"""EventLog: what the server has already done with each eventId (blueprint 07, SD2 and SD3).

The node keeps the same eventId for every retry, so this is what stops a retry from pushing twice.
It lives in memory for the life of the process; the lifespan builds it once.
"""

from enum import StrEnum
from uuid import UUID


class EventStatus(StrEnum):
    NEW = "new"  # first time seen; now marked in progress
    IN_PROGRESS = "inProgress"  # another request is handling it right now
    PUSHED = "pushed"  # the push went out, but the writes didn't finish
    DONE = "done"  # pushed and written


class EventLog:
    def __init__(self) -> None:
        self._entries: dict[UUID, EventStatus] = {}

    def check_and_mark(self, event_id: UUID) -> EventStatus:
        """What has happened to this event so far. A new one is marked in progress in the same step,
        with no await in between, so two copies can't both come back as new."""
        current = self._entries.get(event_id)
        if current is None:
            self._entries[event_id] = EventStatus.IN_PROGRESS
            return EventStatus.NEW
        return current

    def mark_pushed(self, event_id: UUID) -> None:
        self._entries[event_id] = EventStatus.PUSHED

    def mark_done(self, event_id: UUID) -> None:
        self._entries[event_id] = EventStatus.DONE

    def forget(self, event_id: UUID) -> None:
        """For a request that failed before the push: nothing went out, so the retry starts fresh."""
        self._entries.pop(event_id, None)
