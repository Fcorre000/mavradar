"""The repository protocols (blueprint 08, section 2).

Routes and services depend on these protocols, never on a storage implementation. memory.py has the
in-memory versions, used by tests; firestore.py has the Firestore ones.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from app.contract import CrossingDoc, CrossingEventIn
from app.domain.crossing_state import AlertKind

# push token -> the alert kinds that phone was sent during the current blockage
ToldRecord = Mapping[str, frozenset[AlertKind]]


class AlertLog(Protocol):
    """Who was told what about each crossing's current blockage (SD4). Kept in memory so the hot
    path reads nothing from Firestore; S3 also writes it there, so a restart can reload it."""

    def who_was_told(self, crossing_id: str) -> ToldRecord: ...

    def mark_told(self, crossing_id: str, tokens: Iterable[str], kind: AlertKind) -> None: ...

    def close_blockage(self, crossing_id: str) -> None:
        """The train has cleared: forget who was told, so the next train starts fresh."""
        ...


class CrossingRepository(Protocol):
    """crossings/{usdotId}, the document the app shows (SD3 messages 1 and 2)."""

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        """Replaces the whole document. Raises if the write fails."""
        ...


@dataclass(frozen=True)
class EventRecord:
    """One accepted event, for the history: log-only and out-of-order ones too."""

    event: CrossingEventIn
    received_at: datetime  # the server's clock
    applied: bool  # False: older than the crossing's state, so history only


@dataclass(frozen=True)
class AlertRecord:
    """One alert that went out. Counts only: push tokens are private and stay out of logs."""

    crossing_id: str
    kind: AlertKind
    channel: str
    delivered: int
    dead: int
    failed: int
    sent_at: datetime


class CrossingEventStore(Protocol):
    """crossingEvents/{eventId}, server-only. Keyed by eventId, so a resend rewrites the same
    document instead of adding a second one."""

    async def append(self, record: EventRecord) -> None: ...


class AlertRecordStore(Protocol):
    """The Firestore copies of the alert log and the open blockage records (OQ16), server-only.
    Every write is idempotent, so a failed save can simply be redone."""

    async def record_alert(self, event_id: UUID, record: AlertRecord) -> None:
        """alerts/{eventId}: at most one alert per event."""
        ...

    async def save_blockage(self, crossing_id: str, since: datetime | None, told: ToldRecord) -> None:
        """blockages/{crossingId}: who was told what during the current blockage."""
        ...

    async def delete_blockage(self, crossing_id: str) -> None: ...


@dataclass
class Repositories:
    """Built once by the lifespan. Tests swap in the in-memory ones."""

    alert_log: AlertLog
    crossings: CrossingRepository
    events: CrossingEventStore
    alert_records: AlertRecordStore
