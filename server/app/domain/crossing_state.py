"""The crossing state machine from blueprint 06, section 1, as pure functions: is a change legal,
and which alert does it call for. The node decides states (OQ1); the server only checks and reacts.
"""

from enum import StrEnum
from typing import assert_never

from app.contract import ReportedState

S = ReportedState


class AlertKind(StrEnum):
    APPROACHING = "approaching"
    BLOCKED = "blocked"
    STOPPED = "stopped"
    CLEARED = "cleared"


_ON_LINE = (S.CLEAR, S.APPROACHING, S.BLOCKED, S.STOPPED)

LEGAL_CHANGES: frozenset[tuple[ReportedState, ReportedState]] = frozenset(
    {
        (S.CLEAR, S.APPROACHING),
        (S.APPROACHING, S.CLEAR),
        (S.APPROACHING, S.BLOCKED),
        (S.CLEAR, S.BLOCKED),
        (S.BLOCKED, S.STOPPED),
        (S.STOPPED, S.BLOCKED),
        (S.BLOCKED, S.CLEAR),
        # Not in the diagram: a stopped train has to move to leave. If the node reports it anyway,
        # take it as stopped, blocked, clear, with one cleared alert.
        (S.STOPPED, S.CLEAR),
        *((state, S.SENSOR_OFFLINE) for state in _ON_LINE),
        *((S.SENSOR_OFFLINE, state) for state in _ON_LINE),
    }
)


def is_legal(from_state: ReportedState, to_state: ReportedState) -> bool:
    """Whether the node's own story holds together. Staying in the same state is not a change."""
    return (from_state, to_state) in LEGAL_CHANGES


def alert_for(from_state: ReportedState, to_state: ReportedState) -> AlertKind | None:
    """The alert a legal change calls for, before anyone's preferences. Uses the event's own
    from_state, not the server's memory, which is empty after a restart."""
    match to_state:
        case S.APPROACHING:
            return AlertKind.APPROACHING if from_state is S.CLEAR else None
        case S.BLOCKED:
            # Sent later, after each device's minimum blockage time (SD4). From stopped, the
            # train is moving again, and coming back from offline just restores live status.
            return AlertKind.BLOCKED if from_state in (S.CLEAR, S.APPROACHING) else None
        case S.STOPPED:
            return AlertKind.STOPPED if from_state is S.BLOCKED else None
        case S.CLEAR:
            # From approaching, no blockage happened.
            return AlertKind.CLEARED if from_state in (S.BLOCKED, S.STOPPED) else None
        case S.SENSOR_OFFLINE:
            return None  # "status unknown" goes out on service-status after 10 minutes (SD6)
        case _:
            assert_never(to_state)
