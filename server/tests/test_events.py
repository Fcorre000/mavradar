"""POST /events, the whole hot path of SD2: node keys, validation, the EventLog branches, the
crossing state, who gets the alert, and the push.

The server side of each test holds only the hash of TEST_KEY; requests send the key itself. FCM is
always the fake, so no test reaches the network.
"""

import json
from collections.abc import Generator, Iterable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.deps import get_ingest_controller, get_notification_service, get_repositories, get_settings
from app.config import NodeConfig, Settings
from app.contract import AlertMode, CrossingEventIn, ReportedState
from app.controllers.ingest import IngestController
from app.domain.crossing_state import AlertKind
from app.main import app
from app.repositories.base import AlertLog
from app.repositories.memory import MemoryAlertLog, MemoryRepositories
from app.services.alert_policy import AlertPolicy, Recipients
from app.services.auth import hash_key
from app.services.crossing_tracker import ApplyOutcome, CrossingTracker
from app.services.event_log import EventLog, EventStatus
from app.services.notifications import Channel, NotificationService, SendResult
from app.services.subscriptions import SubscriptionMap
from tests.helpers import FakeFcmClient, device

TEST_KEY = "test-key"
EXAMPLE = Path(__file__).parents[2] / "contract/examples/crossing-event/valid/minimal.json"


def load_event() -> dict[str, object]:
    return cast(dict[str, object], json.loads(EXAMPLE.read_text()))


EVENT = load_event()
EVENT_ID = UUID(cast(str, EVENT["eventId"]))
GOOD = {"X-Node-Key": TEST_KEY}


class RecordingController(IngestController):
    """Records each run of the alert steps (recipients, then push), and can make the first few
    fail before the push."""

    def __init__(self, fail_first: int = 0, alert_mode: AlertMode = AlertMode.LOG_ONLY) -> None:
        super().__init__(event_log(), tracker(), policy(), alert_log(), alert_mode, notifications())
        self.alerts = 0
        self.outcomes: list[ApplyOutcome] = []
        self.recipients: list[Recipients | None] = []
        self._fail_first = fail_first

    def _recipients(self, event: CrossingEventIn, outcome: ApplyOutcome, now: datetime) -> Recipients | None:
        self.alerts += 1
        self.outcomes.append(outcome)
        if self.alerts <= self._fail_first:
            raise RuntimeError("failed before the push")
        recipients = super()._recipients(event, outcome, now)
        self.recipients.append(recipients)
        return recipients


@pytest.fixture
def fcm() -> FakeFcmClient:
    return FakeFcmClient()


def running_client(fcm: FakeFcmClient) -> Generator[TestClient]:
    node = NodeConfig(key_hash=hash_key(TEST_KEY), crossing_id=cast(str, EVENT["crossingId"]))
    settings = Settings(nodes={cast(str, EVENT["nodeId"]): node})
    app.dependency_overrides[get_settings] = lambda: settings
    service = NotificationService(fcm, retry_delay_s=0)
    app.dependency_overrides[get_notification_service] = lambda: service
    # A failure before the push surfaces as a 500, the way the node would see it.
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client(fcm: FakeFcmClient) -> Iterator[TestClient]:
    yield from running_client(fcm)


# For a test that needs its own FCM answers.
client_with = contextmanager(running_client)


def event_log() -> EventLog:
    return cast(EventLog, app.state.event_log)


def tracker() -> CrossingTracker:
    return cast(CrossingTracker, app.state.crossing_tracker)


def policy() -> AlertPolicy:
    return cast(AlertPolicy, app.state.alert_policy)


def alert_log() -> AlertLog:
    return cast(MemoryRepositories, app.state.repositories).alert_log


def notifications() -> NotificationService:
    return cast(NotificationService, app.dependency_overrides[get_notification_service]())


def subscriptions() -> SubscriptionMap:
    return cast(SubscriptionMap, app.state.subscriptions)


def use_controller(fail_first: int = 0, alert_mode: AlertMode = AlertMode.LOG_ONLY) -> RecordingController:
    controller = RecordingController(fail_first, alert_mode)
    app.dependency_overrides[get_ingest_controller] = lambda: controller
    return controller


# Node keys


def test_right_key_gets_in(client: TestClient) -> None:
    response = client.post("/events", headers=GOOD, json=EVENT)

    assert response.status_code == 200
    assert response.json() == {"eventId": str(EVENT_ID)}


@pytest.mark.parametrize("headers", [{"X-Node-Key": "made-up"}, {}], ids=["wrong key", "no key"])
def test_wrong_or_missing_key_gets_401(client: TestClient, headers: dict[str, str]) -> None:
    assert client.post("/events", headers=headers, json=EVENT).status_code == 401


def test_bad_key_wins_over_bad_body(client: TestClient) -> None:
    assert client.post("/events", headers={"X-Node-Key": "made-up"}, json={}).status_code == 401


def test_no_nodes_configured_means_every_key_fails(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(nodes={})

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 401


def test_raw_key_in_settings_fails_at_startup() -> None:
    with pytest.raises(ValidationError):
        NodeConfig(key_hash=TEST_KEY, crossing_id="794980D")


# Validation


def test_malformed_event_gets_422(client: TestClient) -> None:
    assert client.post("/events", headers=GOOD, json={**EVENT, "toState": "flying"}).status_code == 422


@pytest.mark.parametrize(
    "change", [{"nodeId": "node-b"}, {"crossingId": "123456Z"}], ids=["other node", "other crossing"]
)
def test_event_not_from_this_node_gets_422(client: TestClient, change: dict[str, str]) -> None:
    assert client.post("/events", headers=GOOD, json={**EVENT, **change}).status_code == 422


# EventLog branches


def test_new_event_alerts_once_and_is_done(client: TestClient) -> None:
    controller = use_controller()

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 200
    assert controller.alerts == 1
    assert event_log().check_and_mark(EVENT_ID) is EventStatus.DONE


def test_retry_after_done_acks_without_alerting_again(client: TestClient) -> None:
    controller = use_controller()
    client.post("/events", headers=GOOD, json=EVENT)

    response = client.post("/events", headers=GOOD, json=EVENT)

    assert response.status_code == 200
    assert controller.alerts == 1


def test_copy_while_first_is_in_progress_gets_503(client: TestClient) -> None:
    controller = use_controller()
    event_log().check_and_mark(EVENT_ID)  # the first copy is mid-request

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 503
    assert controller.alerts == 0


def test_pushed_but_not_written_skips_the_push(client: TestClient) -> None:
    controller = use_controller()
    event_log().check_and_mark(EVENT_ID)
    event_log().mark_pushed(EVENT_ID)

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 200
    assert controller.alerts == 0
    assert event_log().check_and_mark(EVENT_ID) is EventStatus.DONE


def test_failure_before_push_lets_the_retry_start_fresh(client: TestClient) -> None:
    controller = use_controller(fail_first=1)

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 500
    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 200
    assert controller.alerts == 2
    assert event_log().check_and_mark(EVENT_ID) is EventStatus.DONE


# Crossing state


def test_illegal_change_gets_422_and_leaves_no_log_entry(client: TestClient) -> None:
    response = client.post(
        "/events", headers=GOOD, json={**EVENT, "fromState": "clear", "toState": "stopped"}
    )

    assert response.status_code == 422
    assert event_log().check_and_mark(EVENT_ID) is EventStatus.NEW


def test_new_event_moves_the_crossing_and_names_its_alert(client: TestClient) -> None:
    controller = use_controller()

    client.post("/events", headers=GOOD, json=EVENT)  # clear to approaching

    assert tracker().state(cast(str, EVENT["crossingId"])) is ReportedState.APPROACHING
    assert controller.outcomes[0].alert is AlertKind.APPROACHING


# Who gets it

CROSSING = cast(str, EVENT["crossingId"])
LIVE = {**EVENT, "logOnly": False}


def at(minute: int, change: dict[str, object]) -> dict[str, object]:
    """A live event <minute> minutes into the last half hour, so the lateness rule still lets
    cleared through at minute 25 or later. A fresh eventId each time."""
    occurred = datetime.now(UTC).replace(microsecond=0) - timedelta(minutes=30 - minute)
    return {**LIVE, **change, "eventId": str(uuid4()), "occurredAt": f"{occurred:%Y-%m-%dT%H:%M:%S}.000Z"}


def follower_told_blocked() -> None:
    subscriptions().upsert("token-a", device("token-a").doc)
    alert_log().mark_told(CROSSING, ["token-a"], AlertKind.BLOCKED)


def configure_blocked_and_cleared() -> None:
    configured = Settings(
        nodes=cast(Settings, app.dependency_overrides[get_settings]()).nodes,
        alert_modes={CROSSING: AlertMode.BLOCKED_AND_CLEARED},
    )
    app.dependency_overrides[get_settings] = lambda: configured


def test_unconfigured_crossing_is_log_only(client: TestClient, fcm: FakeFcmClient) -> None:
    follower_told_blocked()

    client.post("/events", headers=GOOD, json=at(29, {"fromState": "blocked", "toState": "clear"}))

    assert fcm.calls == []


def test_alert_mode_comes_from_the_settings(client: TestClient, fcm: FakeFcmClient) -> None:
    # Goes through the real providers, so this checks that the node's crossing picks its mode.
    configure_blocked_and_cleared()
    follower_told_blocked()

    client.post("/events", headers=GOOD, json=at(29, {"fromState": "blocked", "toState": "clear"}))

    assert [tokens for _, tokens in fcm.calls] == [["token-a"]]


def test_cleared_goes_to_phones_told_blocked_then_the_memory_is_wiped(client: TestClient) -> None:
    controller = use_controller(alert_mode=AlertMode.BLOCKED_AND_CLEARED)
    follower_told_blocked()

    client.post("/events", headers=GOOD, json=at(29, {"fromState": "blocked", "toState": "clear"}))

    recipients = controller.recipients[0]
    assert recipients is not None and recipients.tokens == ["token-a"]
    assert alert_log().who_was_told(CROSSING) == {}


def test_an_out_of_order_clear_keeps_the_memory(client: TestClient) -> None:
    use_controller(alert_mode=AlertMode.BLOCKED_AND_CLEARED)
    client.post("/events", headers=GOOD, json=at(10, {"fromState": "clear", "toState": "blocked"}))
    follower_told_blocked()

    client.post("/events", headers=GOOD, json=at(5, {"fromState": "blocked", "toState": "clear"}))

    assert "token-a" in alert_log().who_was_told(CROSSING)


def test_an_outage_doesnt_end_the_blockage(client: TestClient) -> None:
    use_controller(alert_mode=AlertMode.BLOCKED_AND_CLEARED)
    follower_told_blocked()

    client.post("/events", headers=GOOD, json=at(0, {"fromState": "blocked", "toState": "sensorOffline"}))

    assert "token-a" in alert_log().who_was_told(CROSSING)


# The push


def test_the_push_says_what_happened_and_where(client: TestClient, fcm: FakeFcmClient) -> None:
    configure_blocked_and_cleared()
    follower_told_blocked()

    client.post("/events", headers=GOOD, json=at(29, {"fromState": "blocked", "toState": "clear"}))

    push, _ = fcm.calls[0]
    assert push.title == "Cooper St is clear"
    assert push.data == {"crossingId": CROSSING, "kind": "cleared"}
    assert push.channel is Channel.TRAIN_ALERTS


def test_only_phones_fcm_accepted_are_told() -> None:
    fcm = FakeFcmClient(answers={"token-b": [SendResult.DEAD]})
    with client_with(fcm) as c:
        configure_blocked_and_cleared()
        for token in ("token-a", "token-b"):
            subscriptions().upsert(token, device(token).doc)
        alert_log().mark_told(CROSSING, ["token-a", "token-b"], AlertKind.BLOCKED)

        c.post("/events", headers=GOOD, json=at(29, {"fromState": "blocked", "toState": "stopped"}))

        told = alert_log().who_was_told(CROSSING)
        assert AlertKind.STOPPED in told["token-a"]
        assert AlertKind.STOPPED not in told["token-b"]


class SpyAlertLog(MemoryAlertLog):
    """Writes its name into the shared call list, like the fake FCM client does."""

    def __init__(self, log: list[str]) -> None:
        super().__init__()
        self._log = log

    def mark_told(self, crossing_id: str, tokens: Iterable[str], kind: AlertKind) -> None:
        self._log.append("write")
        super().mark_told(crossing_id, tokens, kind)

    def close_blockage(self, crossing_id: str) -> None:
        self._log.append("write")
        super().close_blockage(crossing_id)


def test_the_push_goes_out_before_anything_is_written() -> None:
    calls: list[str] = []
    with client_with(FakeFcmClient(log=calls)) as c:
        configure_blocked_and_cleared()
        repositories = MemoryRepositories()
        spy = SpyAlertLog(calls)
        repositories.alert_log = spy
        app.dependency_overrides[get_repositories] = lambda: repositories
        subscriptions().upsert("token-a", device("token-a").doc)
        MemoryAlertLog.mark_told(spy, CROSSING, ["token-a"], AlertKind.BLOCKED)  # setup, not logged

        c.post("/events", headers=GOOD, json=at(29, {"fromState": "blocked", "toState": "clear"}))

    # S3's Firestore writes join this list as "write" too, so this keeps guarding the order.
    assert calls[0] == "push"
    assert calls.count("push") == 1 and set(calls[1:]) == {"write"}
