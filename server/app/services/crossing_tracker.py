"""CrossingTracker: each crossing's current state, in memory (SD2 messages 13 and 14).

Built once by the lifespan. After a restart it knows nothing, so the next legal event sets the state.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.contract import CrossingEventIn, ReportedState
from app.domain.crossing_state import AlertKind, alert_for

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ApplyOutcome:
    applied: bool  # False: older than the current state, so it goes to history only
    alert: AlertKind | None
    age: timedelta  # server receive time minus occurredAt; the lateness rule (group 3) judges it


@dataclass(frozen=True)
class _Current:
    state: ReportedState
    occurred_at: datetime  # of the last event applied


class CrossingTracker:
    def __init__(self) -> None:
        self._crossings: dict[str, _Current] = {}

    def state(self, crossing_id: str) -> ReportedState:
        current = self._crossings.get(crossing_id)
        return current.state if current else ReportedState.SENSOR_OFFLINE

    def apply(self, event: CrossingEventIn, received_at: datetime) -> ApplyOutcome:
        """Apply a legal change. The node is trusted: its to_state becomes the state, even when its
        from_state shows the server missed an event."""
        age = received_at - event.occurred_at
        current = self._crossings.get(event.crossing_id)

        # Both times come from the same node's clock, so their order holds even if it drifts.
        if current is not None and event.occurred_at < current.occurred_at:
            return ApplyOutcome(applied=False, alert=None, age=age)

        if current is not None and event.from_state != current.state:
            logger.warning(
                "missed an event: server had %s, node reports %s to %s",
                current.state,
                event.from_state,
                event.to_state,
                extra={
                    "event_id": str(event.event_id),
                    "node_id": event.node_id,
                    "crossing_id": event.crossing_id,
                },
            )

        self._crossings[event.crossing_id] = _Current(event.to_state, event.occurred_at)
        return ApplyOutcome(applied=True, alert=alert_for(event.from_state, event.to_state), age=age)
