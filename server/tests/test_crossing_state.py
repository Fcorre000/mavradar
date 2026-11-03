"""Every from/to pair of the crossing state machine (blueprint 06, section 1): legal or not, and the
alert a legal change calls for. One row per pair, so a missing or extra change shows up here."""

import pytest

from app.contract import ReportedState
from app.domain.crossing_state import AlertKind, alert_for, is_legal

S = ReportedState
A = AlertKind
NO = "illegal"

# from, to, the alert (None for a legal change with no alert), or NO for an illegal change
TABLE: list[tuple[ReportedState, ReportedState, AlertKind | None | str]] = [
    (S.CLEAR, S.CLEAR, NO),
    (S.CLEAR, S.APPROACHING, A.APPROACHING),
    (S.CLEAR, S.BLOCKED, A.BLOCKED),
    (S.CLEAR, S.STOPPED, NO),
    (S.CLEAR, S.SENSOR_OFFLINE, None),
    (S.APPROACHING, S.CLEAR, None),
    (S.APPROACHING, S.APPROACHING, NO),
    (S.APPROACHING, S.BLOCKED, A.BLOCKED),
    (S.APPROACHING, S.STOPPED, NO),
    (S.APPROACHING, S.SENSOR_OFFLINE, None),
    (S.BLOCKED, S.CLEAR, A.CLEARED),
    (S.BLOCKED, S.APPROACHING, NO),
    (S.BLOCKED, S.BLOCKED, NO),
    (S.BLOCKED, S.STOPPED, A.STOPPED),
    (S.BLOCKED, S.SENSOR_OFFLINE, None),
    (S.STOPPED, S.CLEAR, A.CLEARED),
    (S.STOPPED, S.APPROACHING, NO),
    (S.STOPPED, S.BLOCKED, None),
    (S.STOPPED, S.STOPPED, NO),
    (S.STOPPED, S.SENSOR_OFFLINE, None),
    (S.SENSOR_OFFLINE, S.CLEAR, None),
    (S.SENSOR_OFFLINE, S.APPROACHING, None),
    (S.SENSOR_OFFLINE, S.BLOCKED, None),
    (S.SENSOR_OFFLINE, S.STOPPED, None),
    (S.SENSOR_OFFLINE, S.SENSOR_OFFLINE, NO),
]


def test_table_covers_every_pair() -> None:
    assert {(f, t) for f, t, _ in TABLE} == {(f, t) for f in S for t in S}


@pytest.mark.parametrize(("from_state", "to_state", "expected"), TABLE, ids=lambda v: str(v))
def test_change(from_state: ReportedState, to_state: ReportedState, expected: AlertKind | None | str) -> None:
    if expected == NO:
        assert not is_legal(from_state, to_state)
    else:
        assert is_legal(from_state, to_state)
        assert alert_for(from_state, to_state) == expected
