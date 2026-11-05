"""CrossingTracker: each crossing's current state and its times, in memory (SD2 messages 13 and 14).

Built once by the lifespan. After a restart it knows nothing, so the next legal event sets the state.
The times are what the crossing document needs (S3); they use the event's occurredAt, when the
change happened.
"""

import logging
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import assert_never

from app.contract import CrossingEventIn, ReportedState
from app.domain.crossing_state import AlertKind, alert_for

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FinishedBlockage:
    """A blockage that just ended, for the History screen (S3)."""

    start: datetime
    end: datetime
    stopped: bool  # the train stopped at some point during it


@dataclass(frozen=True)
class ApplyOutcome:
    applied: bool  # False: older than the current state, so it goes to history only
    alert: AlertKind | None
    age: timedelta  # server receive time minus occurredAt; the lateness rule (group 3) judges it
    finished: FinishedBlockage | None = None  # set when this change ended a blockage


S = ReportedState


@dataclass(frozen=True)
class CrossingReading:
    state: ReportedState
    since: datetime | None = None  # start of the current blockage
    stopped_at: datetime | None = None  # when the train stopped
    detected_at: datetime | None = None  # when an approaching train was seen
    clear_since: datetime | None = None  # when the crossing last cleared
    # Ticked when the train stops, and kept when it moves again (unlike stopped_at), so the
    # finished blockage can say whether it ever stopped. Reset when the blockage ends.
    had_stop: bool = False


def next_reading(old: CrossingReading | None, event: CrossingEventIn) -> CrossingReading:
    """The crossing after this change. One blockage runs from its start until the train leaves,
    however often the train stops and starts, so `since` carries through blocked and stopped and
    stopped_at only describes the train as it is now."""
    old = old or CrossingReading(S.SENSOR_OFFLINE)
    at = event.occurred_at
    # An outage doesn't end a blockage, so coming back from offline continues it.
    ongoing = old.since if event.from_state in (S.BLOCKED, S.STOPPED, S.SENSOR_OFFLINE) else None
    match event.to_state:
        case S.CLEAR:
            return CrossingReading(S.CLEAR, clear_since=at)
        case S.APPROACHING:
            return CrossingReading(S.APPROACHING, detected_at=at, clear_since=old.clear_since)
        case S.BLOCKED:
            # Moving again, or still moving: no longer stopped. A new blockage starts unticked.
            had_stop = old.had_stop if ongoing else False
            return replace(old, state=S.BLOCKED, since=ongoing or at, stopped_at=None, had_stop=had_stop)
        case S.STOPPED:
            stopped_at = old.stopped_at if event.from_state is S.SENSOR_OFFLINE else None
            return replace(
                old, state=S.STOPPED, since=ongoing or at, stopped_at=stopped_at or at, had_stop=True
            )
        case S.SENSOR_OFFLINE:
            return replace(old, state=S.SENSOR_OFFLINE)  # keep every time; the node's return decides
        case _:
            assert_never(event.to_state)


@dataclass(frozen=True)
class _Current:
    reading: CrossingReading
    occurred_at: datetime  # of the last event applied


class CrossingTracker:
    def __init__(self) -> None:
        self._crossings: dict[str, _Current] = {}

    def state(self, crossing_id: str) -> ReportedState:
        current = self._crossings.get(crossing_id)
        return current.reading.state if current else ReportedState.SENSOR_OFFLINE

    def reading(self, crossing_id: str) -> CrossingReading | None:
        """None until an event for this crossing arrives."""
        current = self._crossings.get(crossing_id)
        return current.reading if current else None

    def apply(self, event: CrossingEventIn, received_at: datetime) -> ApplyOutcome:
        """Apply a legal change. The node is trusted: its to_state becomes the state, even when its
        from_state shows the server missed an event."""
        age = received_at - event.occurred_at
        current = self._crossings.get(event.crossing_id)

        # Both times come from the same node's clock, so their order holds even if it drifts.
        if current is not None and event.occurred_at < current.occurred_at:
            return ApplyOutcome(applied=False, alert=None, age=age)

        if current is not None and event.from_state != current.reading.state:
            logger.warning(
                "missed an event: server had %s, node reports %s to %s",
                current.reading.state,
                event.from_state,
                event.to_state,
                extra={
                    "event_id": str(event.event_id),
                    "node_id": event.node_id,
                    "crossing_id": event.crossing_id,
                },
            )

        old = current.reading if current else None
        reading = next_reading(old, event)
        self._crossings[event.crossing_id] = _Current(reading, event.occurred_at)
        return ApplyOutcome(
            applied=True,
            alert=alert_for(event.from_state, event.to_state),
            age=age,
            finished=_finished(old, event),
        )


def _finished(old: CrossingReading | None, event: CrossingEventIn) -> FinishedBlockage | None:
    """The blockage this change ended, read from the crossing as it was just before the clear."""
    if event.to_state is not S.CLEAR or event.from_state not in (S.BLOCKED, S.STOPPED):
        return None  # approaching to clear: no blockage happened
    if old is None or old.since is None:
        # After a restart the server doesn't know when it began; S5's reload of blockages/{id} fixes it.
        logger.warning(
            "blockage ended with no known start; not recorded",
            extra={"event_id": str(event.event_id), "crossing_id": event.crossing_id},
        )
        return None
    return FinishedBlockage(
        start=old.since, end=event.occurred_at, stopped=old.had_stop or event.from_state is S.STOPPED
    )
