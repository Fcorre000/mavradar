"""Builders shared by the alert tests."""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.contract import AlertMode, DeviceDoc, Platform
from app.domain.crossing_state import AlertKind
from app.repositories.base import ToldRecord
from app.services.alert_rules import AlertContext
from app.services.notifications import Push, SendResult
from app.services.subscriptions import Device

CROSSING = "794980D"
NOW = datetime(2026, 7, 6, 17, 0, tzinfo=UTC)


def chicago(local: str) -> datetime:
    """A wall-clock time in Arlington, as the UTC instant the server would see."""
    return datetime.fromisoformat(local).replace(tzinfo=ZoneInfo("America/Chicago")).astimezone(UTC)


def device(token: str = "token-a", **prefs: Any) -> Device:
    doc = DeviceDoc(uid="uid", platform=Platform.ANDROID, updated_at=NOW, subscriptions=[CROSSING], **prefs)
    return Device(token, doc)


def context(
    kind: AlertKind = AlertKind.CLEARED,
    *,
    log_only: bool = False,
    alert_mode: AlertMode = AlertMode.BLOCKED_AND_CLEARED,
    age: timedelta = timedelta(0),
    now: datetime = NOW,
    told: ToldRecord | None = None,
) -> AlertContext:
    return AlertContext(
        crossing_id=CROSSING,
        kind=kind,
        log_only=log_only,
        alert_mode=alert_mode,
        age=age,
        now=now,
        told=told if told is not None else {},
    )


class FakeFcmClient:
    """Stands in for FCM: records every multicast and answers per token. A token's answers are
    used one per call, so ["retry", "delivered"] means it fails once, then gets through."""

    def __init__(
        self, log: list[str] | None = None, answers: dict[str, list[SendResult]] | None = None
    ) -> None:
        self.calls: list[tuple[Push, list[str]]] = []
        self.log = log if log is not None else []
        self._answers = answers or {}

    def multicast(self, push: Push, tokens: Sequence[str]) -> list[SendResult]:
        self.calls.append((push, list(tokens)))
        self.log.append("push")
        results: list[SendResult] = []
        for token in tokens:
            queue = self._answers.get(token)
            results.append(queue.pop(0) if queue else SendResult.DELIVERED)
        return results
