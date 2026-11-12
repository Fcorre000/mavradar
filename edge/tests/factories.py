"""Builders shared by the buffer, uplink and node tests."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from mavradar_edge.buffer.event_buffer import EventBuffer
from mavradar_edge.contract import CrossingEvent, ReportedState

START = datetime(2026, 11, 11, 14, 0, tzinfo=UTC)


def event(second: int = 0) -> CrossingEvent:
    """A valid event with a fresh eventId, `second` seconds after START."""
    return CrossingEvent(
        event_id=str(uuid4()),
        node_id="node-a",
        crossing_id="794980D",
        from_state=ReportedState.CLEAR,
        to_state=ReportedState.BLOCKED,
        occurred_at=START + timedelta(seconds=second),
        log_only=True,
    )


def drain(buffer: EventBuffer) -> list[str]:
    """Empties the buffer and returns the eventIds in the order they would have been sent."""
    ids: list[str] = []
    while (pending := buffer.oldest_pending()) is not None:
        ids.append(pending.event_id)
        buffer.delete(pending.event_id)
    return ids
