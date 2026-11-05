"""The repository protocols (blueprint 08, section 2).

Routes and services depend on these protocols, never on a storage implementation. memory.py has the
in-memory versions, used by tests; firestore.py has the Firestore ones.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from uuid import UUID

from app.contract import BlockageEventDoc, CrossingDoc, CrossingEventIn, HistorySummaryDoc
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


SummaryRange = Literal["7d", "30d"]


class CrossingRepository(Protocol):
    """crossings/{usdotId} and its events and summary, all of which the app reads (SD3)."""

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        """Replaces the whole document. Raises if the write fails."""
        ...

    async def add_blockage(self, crossing_id: str, blockage_id: UUID, doc: BlockageEventDoc) -> None:
        """crossings/{id}/events/{blockageId}, keyed by the clearing event's eventId so a resend
        rewrites the same record instead of adding a second blockage to History."""
        ...

    async def recent_blockages(self, crossing_id: str, since: datetime) -> list[BlockageEventDoc]:
        """Finished blockages that started at or after `since`."""
        ...

    async def save_summary(self, crossing_id: str, range_: SummaryRange, doc: HistorySummaryDoc) -> None: ...


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


class TokenRegistry(Protocol):
    """devices/{fcmToken}, written by the app's registerDevice(). The server only deletes, and
    only tokens FCM reported dead (SD3 messages 7 to 9). S6 adds loading and syncing."""

    async def remove(self, tokens: Sequence[str]) -> None:
        """Deleting a document that's already gone is fine, so a resend can redo this."""
        ...


@dataclass
class Repositories:
    """Built once by the lifespan. Tests swap in the in-memory ones."""

    alert_log: AlertLog
    crossings: CrossingRepository
    events: CrossingEventStore
    alert_records: AlertRecordStore
    tokens: TokenRegistry
