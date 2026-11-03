"""NotificationService: the one place that talks to FCM (07, Facade card; SD2 messages 19 to 23).

Callers hand it a Push and the tokens. The channel decides how urgent the message is, so a
service-status note can never come out urgent. FCM failures are recorded, never raised: the push
step must not fail the request, or the node's retry would push again to phones that got it.
"""

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Protocol, cast

# The Firebase Admin SDK ships no type hints; its untyped corners are pinned down in this module only.
import firebase_admin  # pyright: ignore[reportMissingTypeStubs]
from firebase_admin import exceptions, messaging  # pyright: ignore[reportMissingTypeStubs]

from app.domain.alert_text import alert_text
from app.domain.crossing_state import AlertKind

logger = logging.getLogger(__name__)

BATCH_SIZE = 500  # FCM's limit per multicast
RETRY_DELAY_S = 0.5
HTTP_TIMEOUT_S = 5


class Channel(StrEnum):
    # Only ever carries a real train event: the user owns its importance after the first one.
    TRAIN_ALERTS = "train-alerts"
    # Sensor offline, degraded detection, tests: never urgent.
    SERVICE_STATUS = "service-status"


@dataclass(frozen=True)
class Push:
    """One notification, before it becomes an FCM message."""

    title: str
    body: str
    data: dict[str, str]
    channel: Channel


def alert_push(kind: AlertKind, crossing_id: str, at: datetime, channel: Channel) -> Push:
    """A crossing alert, on the channel AlertPolicy picked. `at` is when the change happened."""
    title, body = alert_text(kind, crossing_id, at)
    # The app opens this crossing's Status when the alert is tapped (SD9).
    return Push(title, body, {"crossingId": crossing_id, "kind": kind}, channel)


class SendResult(StrEnum):
    DELIVERED = "delivered"
    DEAD = "dead"  # the token will never work again; S3 deletes it
    RETRY = "retry"  # FCM busy or down; worth one more try
    FAILED = "failed"


@dataclass(frozen=True)
class DeliveryReport:
    delivered: list[str] = field(default_factory=list[str])
    dead: list[str] = field(default_factory=list[str])
    failed: list[str] = field(default_factory=list[str])


class FcmClient(Protocol):
    def multicast(self, push: Push, tokens: Sequence[str]) -> list[SendResult]:
        """One result per token, in order. Blocking."""
        ...


def build_message(push: Push, tokens: Sequence[str]) -> messaging.MulticastMessage:
    urgent = push.channel is Channel.TRAIN_ALERTS
    return messaging.MulticastMessage(
        # FCM registration tokens, which is what the app registers. firebase-admin 7 deprecates
        # this in favor of fids (Firebase Installation IDs), a different ID: moving means the app
        # registering its installation ID instead, so it waits for its own decision.
        tokens=list(tokens),
        notification=messaging.Notification(title=push.title, body=push.body),
        data=push.data,
        android=messaging.AndroidConfig(
            # Delivery priority: high on every message, so a dozing phone wakes for it now (CLAUDE.md).
            priority="high",
            # Display priority comes from the channel: only train alerts are shown as urgent.
            notification=messaging.AndroidNotification(
                channel_id=push.channel.value, priority="high" if urgent else "default"
            ),
        ),
        apns=messaging.APNSConfig(
            headers={"apns-priority": "10" if urgent else "5"},
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    sound="default" if urgent else None,
                    custom_data={"interruption-level": "time-sensitive" if urgent else "active"},
                )
            ),
        ),
    )


_DEAD = (messaging.UnregisteredError, messaging.SenderIdMismatchError, exceptions.InvalidArgumentError)
_RETRY = (
    messaging.QuotaExceededError,
    exceptions.UnavailableError,
    exceptions.InternalError,
    exceptions.DeadlineExceededError,
)


def classify(error: BaseException | None) -> SendResult:
    if error is None:
        return SendResult.DELIVERED
    if isinstance(error, _DEAD):
        return SendResult.DEAD
    if isinstance(error, _RETRY):
        return SendResult.RETRY
    return SendResult.FAILED


class FirebaseFcmClient:
    """The real client, through the Firebase Admin SDK. Credentials come from Application Default
    Credentials (the service account on Cloud Run, gcloud locally), never a key file."""

    APP_NAME = "mavradar"

    def __init__(self, project_id: str, dry_run: bool) -> None:
        self._app: firebase_admin.App
        try:
            self._app = firebase_admin.get_app(self.APP_NAME)
        except ValueError:  # first start in this process (tests start the lifespan many times)
            options = {"projectId": project_id, "httpTimeout": HTTP_TIMEOUT_S}
            self._app = firebase_admin.initialize_app(options=options, name=self.APP_NAME)  # pyright: ignore[reportUnknownMemberType]
        self._dry_run = dry_run
        if dry_run:
            logger.info("FCM dry run is on: messages are checked, nothing reaches a phone")
        else:
            logger.warning("FCM dry run is OFF: pushes reach real phones")

    def multicast(self, push: Push, tokens: Sequence[str]) -> list[SendResult]:
        try:
            batch = messaging.send_each_for_multicast(  # pyright: ignore[reportUnknownMemberType]
                build_message(push, tokens), dry_run=self._dry_run, app=self._app
            )
        except exceptions.FirebaseError as error:
            return [classify(error)] * len(tokens)
        return [classify(cast(BaseException | None, response.exception)) for response in batch.responses]


class NotificationService:
    def __init__(self, client: FcmClient, retry_delay_s: float = RETRY_DELAY_S) -> None:
        self._client = client
        self._retry_delay_s = retry_delay_s

    async def send(self, push: Push, tokens: Sequence[str]) -> DeliveryReport:
        report = DeliveryReport()
        for start in range(0, len(tokens), BATCH_SIZE):
            batch = list(tokens[start : start + BATCH_SIZE])
            results = dict(zip(batch, await self._attempt(push, batch), strict=True))
            again = [token for token, result in results.items() if result is SendResult.RETRY]
            if again:
                # One short retry while the alert is still useful, then give up on those tokens.
                await asyncio.sleep(self._retry_delay_s)
                results.update(zip(again, await self._attempt(push, again), strict=True))
            for token, result in results.items():
                match result:
                    case SendResult.DELIVERED:
                        report.delivered.append(token)
                    case SendResult.DEAD:
                        report.dead.append(token)
                    case SendResult.RETRY | SendResult.FAILED:
                        report.failed.append(token)
        if report.dead or report.failed:
            logger.warning(
                "push %s: %d delivered, %d dead, %d failed",
                push.data.get("kind"),
                len(report.delivered),
                len(report.dead),
                len(report.failed),
            )
        return report

    async def _attempt(self, push: Push, tokens: list[str]) -> list[SendResult]:
        try:
            # The SDK call blocks, so it runs in a worker thread and other requests keep moving.
            results = await asyncio.to_thread(self._client.multicast, push, tokens)
        except Exception:
            logger.exception("push failed outright")
            return [SendResult.FAILED] * len(tokens)
        if len(results) != len(tokens):
            logger.error("FCM returned %d results for %d tokens", len(results), len(tokens))
            return [SendResult.FAILED] * len(tokens)
        return results
