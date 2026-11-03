"""CrossingTracker: trusts the node, ignores events older than the current state, reports age."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.contract import CrossingEventIn, ReportedState
from app.domain.crossing_state import AlertKind
from app.services.crossing_tracker import CrossingTracker

S = ReportedState
CROSSING = "794980D"
T0 = datetime(2026, 11, 3, 14, 0, tzinfo=UTC)


def event(from_state: ReportedState, to_state: ReportedState, at: datetime) -> CrossingEventIn:
    return CrossingEventIn(
        schema_version=1,
        event_id=uuid4(),
        node_id="node-a",
        crossing_id=CROSSING,
        from_state=from_state,
        to_state=to_state,
        occurred_at=at,
        log_only=False,
    )


def test_unknown_crossing_starts_offline_and_takes_any_legal_event() -> None:
    tracker = CrossingTracker()
    assert tracker.state(CROSSING) is S.SENSOR_OFFLINE

    outcome = tracker.apply(event(S.BLOCKED, S.CLEAR, T0), received_at=T0)

    assert outcome.applied
    assert tracker.state(CROSSING) is S.CLEAR


def test_alert_comes_from_the_events_own_change() -> None:
    # After a restart the server believes offline, but the node says blocked to clear: the people
    # told "blocked" before the restart still need their cleared alert.
    tracker = CrossingTracker()

    assert tracker.apply(event(S.BLOCKED, S.CLEAR, T0), received_at=T0).alert is AlertKind.CLEARED


def test_mismatch_trusts_the_node_and_warns(caplog: pytest.LogCaptureFixture) -> None:
    tracker = CrossingTracker()
    tracker.apply(event(S.APPROACHING, S.CLEAR, T0), received_at=T0)  # server now believes clear

    with caplog.at_level(logging.WARNING):
        outcome = tracker.apply(event(S.BLOCKED, S.CLEAR, T0 + timedelta(minutes=5)), received_at=T0)

    assert outcome.applied
    assert outcome.alert is AlertKind.CLEARED
    assert tracker.state(CROSSING) is S.CLEAR
    assert "missed an event" in caplog.text


def test_no_warning_when_the_story_matches(caplog: pytest.LogCaptureFixture) -> None:
    tracker = CrossingTracker()
    tracker.apply(event(S.CLEAR, S.APPROACHING, T0), received_at=T0)

    with caplog.at_level(logging.WARNING):
        tracker.apply(event(S.APPROACHING, S.BLOCKED, T0 + timedelta(seconds=5)), received_at=T0)

    assert caplog.text == ""


def test_older_event_goes_to_history_only() -> None:
    tracker = CrossingTracker()
    tracker.apply(event(S.BLOCKED, S.CLEAR, T0 + timedelta(minutes=5)), received_at=T0)

    outcome = tracker.apply(event(S.CLEAR, S.BLOCKED, T0), received_at=T0)

    assert not outcome.applied
    assert outcome.alert is None
    assert tracker.state(CROSSING) is S.CLEAR


def test_same_time_is_not_older() -> None:
    tracker = CrossingTracker()
    tracker.apply(event(S.CLEAR, S.APPROACHING, T0), received_at=T0)

    outcome = tracker.apply(event(S.APPROACHING, S.BLOCKED, T0), received_at=T0)

    assert outcome.applied
    assert tracker.state(CROSSING) is S.BLOCKED


def test_age_is_receive_time_minus_occurred_at() -> None:
    tracker = CrossingTracker()

    outcome = tracker.apply(event(S.CLEAR, S.APPROACHING, T0), received_at=T0 + timedelta(seconds=90))

    assert outcome.age == timedelta(seconds=90)


def test_crossings_are_tracked_separately() -> None:
    tracker = CrossingTracker()
    other = event(S.CLEAR, S.BLOCKED, T0).model_copy(update={"crossing_id": "123456A"})

    tracker.apply(other, received_at=T0)

    assert tracker.state("123456A") is S.BLOCKED
    assert tracker.state(CROSSING) is S.SENSOR_OFFLINE
