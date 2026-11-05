"""EventLog: what the server has already done with each eventId (blueprint 07, SD2 and SD3).

The node keeps the same eventId for every retry, so this is what stops a retry from pushing twice.
It lives in memory for the life of the process; the lifespan builds it once.

A pushed event that isn't saved yet also keeps the records still to be saved, because a resend
can't rebuild them: the push and its delivery report happened in the first request.
"""

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from app.repositories.base import AlertRecord, EventRecord
from app.services.crossing_tracker import FinishedBlockage


class EventStatus(StrEnum):
    NEW = "new"  # first time seen; now marked in progress
    IN_PROGRESS = "inProgress"  # another request is handling it right now
    PUSHED = "pushed"  # the push went out, but the writes didn't finish
    DONE = "done"  # pushed and written


@dataclass(frozen=True)
class PendingRecords:
    """What an event still has to save after its push (S3)."""

    history: EventRecord
    alert: AlertRecord | None  # None when nothing was sent
    crossing_changed: bool  # the event moved the crossing, so its document needs saving
    blockage_changed: bool  # who-was-told changed, or the blockage ended
    finished: FinishedBlockage | None = None  # a blockage this event ended, for History


class EventLog:
    def __init__(self) -> None:
        self._entries: dict[UUID, EventStatus] = {}
        self._pending: dict[UUID, PendingRecords] = {}

    def check_and_mark(self, event_id: UUID) -> EventStatus:
        """What has happened to this event so far. A new one is marked in progress in the same step,
        with no await in between, so two copies can't both come back as new."""
        current = self._entries.get(event_id)
        if current is None:
            self._entries[event_id] = EventStatus.IN_PROGRESS
            return EventStatus.NEW
        return current

    def mark_pushed(self, event_id: UUID, records: PendingRecords) -> None:
        self._entries[event_id] = EventStatus.PUSHED
        self._pending[event_id] = records

    def pending(self, event_id: UUID) -> PendingRecords | None:
        return self._pending.get(event_id)

    def mark_done(self, event_id: UUID) -> None:
        self._entries[event_id] = EventStatus.DONE
        self._pending.pop(event_id, None)

    def forget(self, event_id: UUID) -> None:
        """For a request that failed before the push: nothing went out, so the retry starts fresh."""
        self._entries.pop(event_id, None)
