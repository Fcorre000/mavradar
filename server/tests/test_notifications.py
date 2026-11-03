"""NotificationService, the FCM message it builds, and the alert text (09 S2 done-when: every message
sets android.priority high and the channel ID; service-status is never urgent; dry run)."""

import warnings
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast

import pytest
from firebase_admin import exceptions, messaging  # pyright: ignore[reportMissingTypeStubs]

from app.config import Settings
from app.domain.alert_text import alert_text, clock
from app.domain.crossing_state import AlertKind
from app.services import notifications
from app.services.notifications import (
    BATCH_SIZE,
    Channel,
    FirebaseFcmClient,
    NotificationService,
    Push,
    SendResult,
    alert_push,
    build_message,
    classify,
)
from tests.helpers import FakeFcmClient, chicago

R = SendResult
TRAIN = alert_push(AlertKind.CLEARED, "794980D", chicago("2026-07-06T14:20"), Channel.TRAIN_ALERTS)
STATUS = Push(
    "Cooper St status unknown", "No sensor data.", {"crossingId": "794980D"}, Channel.SERVICE_STATUS
)


# The message, as FCM receives it


def encode(push: Push) -> object:
    """The JSON the SDK sends to FCM for one token, so the tests check the wire format itself."""
    multicast = build_message(push, ["token-a"])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)  # token vs fid, see build_message
        one = messaging.Message(
            token="token-a",
            data=multicast.data,  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
            notification=multicast.notification,  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
            android=multicast.android,  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
            apns=multicast.apns,  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
        )
    return cast(object, messaging._MessagingService.encode_message(one))  # pyright: ignore[reportPrivateUsage, reportUnknownMemberType]


def test_train_alert_on_the_wire() -> None:
    assert encode(TRAIN) == {
        "token": "token-a",
        "notification": {"title": "Cooper St is clear", "body": "Cleared at 2:20 PM."},
        "data": {"crossingId": "794980D", "kind": "cleared"},
        # Delivery priority high (every message), shown as urgent (train alerts only).
        "android": {
            "priority": "high",
            "notification": {"channel_id": "train-alerts", "notification_priority": "PRIORITY_HIGH"},
        },
        "apns": {
            "headers": {"apns-priority": "10"},
            "payload": {"aps": {"sound": "default", "interruption-level": "time-sensitive"}},
        },
    }


def test_service_status_is_never_urgent_on_the_wire() -> None:
    assert encode(STATUS) == {
        "token": "token-a",
        "notification": {"title": "Cooper St status unknown", "body": "No sensor data."},
        "data": {"crossingId": "794980D"},
        "android": {
            "priority": "high",  # still delivered promptly
            "notification": {"channel_id": "service-status", "notification_priority": "PRIORITY_DEFAULT"},
        },
        "apns": {"headers": {"apns-priority": "5"}, "payload": {"aps": {"interruption-level": "active"}}},
    }


# The real client, with the SDK call replaced


@dataclass
class FakeResponse:
    exception: BaseException | None


@dataclass
class FakeBatch:
    responses: list[FakeResponse]


def test_dry_run_reaches_the_sdk(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[bool] = []

    def send(message: object, dry_run: bool, app: object) -> FakeBatch:
        seen.append(dry_run)
        return FakeBatch([FakeResponse(None), FakeResponse(None)])

    monkeypatch.setattr(messaging, "send_each_for_multicast", send)

    assert FirebaseFcmClient("mavradar-4a74a", dry_run=True).multicast(TRAIN, ["a", "b"]) == [R.DELIVERED] * 2
    assert seen == [True]


def test_dry_run_is_on_unless_turned_off() -> None:
    assert Settings.model_fields["fcm_dry_run"].default is True


def test_whole_call_failure_counts_for_every_token(monkeypatch: pytest.MonkeyPatch) -> None:
    def send(message: object, dry_run: bool, app: object) -> FakeBatch:
        raise exceptions.UnavailableError("FCM down")

    monkeypatch.setattr(messaging, "send_each_for_multicast", send)

    assert FirebaseFcmClient("mavradar-4a74a", dry_run=True).multicast(TRAIN, ["a", "b"]) == [R.RETRY] * 2


@pytest.mark.parametrize(
    ("error", "result"),
    [
        (None, R.DELIVERED),
        (messaging.UnregisteredError("app uninstalled"), R.DEAD),
        (messaging.SenderIdMismatchError("other project"), R.DEAD),
        (exceptions.InvalidArgumentError("not a token"), R.DEAD),
        (messaging.QuotaExceededError("slow down"), R.RETRY),
        (exceptions.UnavailableError("down"), R.RETRY),
        (exceptions.InternalError("oops"), R.RETRY),
        (exceptions.DeadlineExceededError("timeout"), R.RETRY),
        (exceptions.PermissionDeniedError("no access"), R.FAILED),
    ],
    ids=lambda v: type(v).__name__ if isinstance(v, BaseException) else str(v),
)
def test_classify(error: BaseException | None, result: SendResult) -> None:
    assert classify(error) is result


# The service


async def send(client: FakeFcmClient, tokens: Sequence[str]) -> notifications.DeliveryReport:
    return await NotificationService(client, retry_delay_s=0).send(TRAIN, tokens)


@pytest.mark.anyio
async def test_batches_of_500() -> None:
    fcm = FakeFcmClient()
    tokens = [f"t{i}" for i in range(2 * BATCH_SIZE + 1)]

    report = await send(fcm, tokens)

    assert [len(batch) for _, batch in fcm.calls] == [500, 500, 1]
    assert report.delivered == tokens


@pytest.mark.anyio
async def test_a_temporary_failure_gets_one_retry() -> None:
    fcm = FakeFcmClient(answers={"a": [R.RETRY, R.DELIVERED], "b": [R.RETRY, R.RETRY]})

    report = await send(fcm, ["a", "b", "c"])

    assert [batch for _, batch in fcm.calls] == [["a", "b", "c"], ["a", "b"]]
    assert report.delivered == ["a", "c"]
    assert report.failed == ["b"]  # retried once, then given up on


@pytest.mark.anyio
async def test_dead_and_failed_tokens_are_reported_apart() -> None:
    report = await send(FakeFcmClient(answers={"a": [R.DEAD], "b": [R.FAILED]}), ["a", "b", "c"])

    assert (report.delivered, report.dead, report.failed) == (["c"], ["a"], ["b"])


class Broken(FakeFcmClient):
    def multicast(self, push: Push, tokens: Sequence[str]) -> list[SendResult]:
        raise RuntimeError("bug in the client")


class Short(FakeFcmClient):
    def multicast(self, push: Push, tokens: Sequence[str]) -> list[SendResult]:
        return [R.DELIVERED]


@pytest.mark.anyio
@pytest.mark.parametrize("client", [Broken(), Short()], ids=["raises", "wrong count"])
async def test_a_broken_client_never_raises_it_just_fails(client: FakeFcmClient) -> None:
    report = await send(client, ["a", "b"])

    assert report.failed == ["a", "b"]


# The text


@pytest.mark.parametrize(
    ("kind", "title", "body"),
    [
        (AlertKind.APPROACHING, "Train approaching Cooper St", "It will likely block the crossing shortly."),
        (
            AlertKind.BLOCKED,
            "Cooper St is blocked",
            "Train on the crossing since 2:05 PM. Detour: West St underpass.",
        ),
        (AlertKind.STOPPED, "Train stopped on Cooper St", "Stopped since 2:05 PM."),
        (AlertKind.CLEARED, "Cooper St is clear", "Cleared at 2:05 PM."),
    ],
)
def test_alert_text(kind: AlertKind, title: str, body: str) -> None:
    assert alert_text(kind, "794980D", chicago("2026-07-06T14:05")) == (title, body)


def test_unknown_crossing_still_reads() -> None:
    assert (
        alert_text(AlertKind.CLEARED, "123456A", chicago("2026-07-06T14:05"))[0]
        == "Crossing 123456A is clear"
    )


@pytest.mark.parametrize(
    ("at", "shown"),
    [
        (datetime(2026, 7, 6, 5, 5, tzinfo=UTC), "12:05 AM"),  # CDT, UTC-5
        (datetime(2026, 7, 6, 17, 0, tzinfo=UTC), "12:00 PM"),
        (datetime(2026, 12, 7, 20, 30, tzinfo=UTC), "2:30 PM"),  # CST, UTC-6
    ],
)
def test_clock_is_arlington_time(at: datetime, shown: str) -> None:
    assert clock(at) == shown
