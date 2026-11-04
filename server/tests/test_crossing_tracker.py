"""CrossingTracker: trusts the node, ignores events older than the current state, reports age."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.contract import CrossingEventIn, ReportedState
from app.domain.crossing_state import AlertKind
from app.services.crossing_tracker import CrossingReading, CrossingTracker

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


# The crossing's times (what the crossing document shows)


def at_minute(m: int) -> datetime:
    return T0 + timedelta(minutes=m)


def run(*changes: tuple[ReportedState, ReportedState, int]) -> CrossingReading:
    """Applies changes as (from, to, minute) and returns the crossing's reading."""
    tracker = CrossingTracker()
    for from_state, to_state, minute in changes:
        tracker.apply(event(from_state, to_state, at_minute(minute)), received_at=at_minute(minute))
    reading = tracker.reading(CROSSING)
    assert reading is not None
    return reading


def test_no_reading_before_any_event() -> None:
    assert CrossingTracker().reading(CROSSING) is None


def test_a_train_that_starts_moving_again_is_still_the_same_blockage() -> None:
    # 2:00 blocked, 2:05 stopped, 2:12 moving again: blocked since 2:00, no longer stopped.
    reading = run((S.CLEAR, S.BLOCKED, 0), (S.BLOCKED, S.STOPPED, 5), (S.STOPPED, S.BLOCKED, 12))

    assert reading == CrossingReading(S.BLOCKED, since=at_minute(0))


def test_stopping_keeps_the_start_and_sets_stopped_at() -> None:
    reading = run((S.CLEAR, S.BLOCKED, 0), (S.BLOCKED, S.STOPPED, 5))

    assert (reading.since, reading.stopped_at) == (at_minute(0), at_minute(5))


def test_approaching_then_blocked_keeps_when_it_was_seen() -> None:
    reading = run((S.CLEAR, S.APPROACHING, 0), (S.APPROACHING, S.BLOCKED, 1))

    assert (reading.detected_at, reading.since) == (at_minute(0), at_minute(1))


def test_clearing_ends_the_blockage() -> None:
    reading = run((S.CLEAR, S.APPROACHING, 0), (S.APPROACHING, S.BLOCKED, 1), (S.BLOCKED, S.CLEAR, 9))

    assert reading == CrossingReading(S.CLEAR, clear_since=at_minute(9))


def test_approaching_keeps_when_it_last_cleared() -> None:
    reading = run((S.BLOCKED, S.CLEAR, 0), (S.CLEAR, S.APPROACHING, 30))

    assert (reading.clear_since, reading.detected_at) == (at_minute(0), at_minute(30))


def test_an_outage_keeps_the_blockage() -> None:
    reading = run(
        (S.CLEAR, S.BLOCKED, 0),
        (S.BLOCKED, S.STOPPED, 5),
        (S.STOPPED, S.SENSOR_OFFLINE, 6),
        (S.SENSOR_OFFLINE, S.STOPPED, 20),
    )

    assert reading == CrossingReading(S.STOPPED, since=at_minute(0), stopped_at=at_minute(5))


def test_a_new_blockage_starts_its_own_clock() -> None:
    reading = run((S.CLEAR, S.BLOCKED, 0), (S.BLOCKED, S.CLEAR, 9), (S.CLEAR, S.BLOCKED, 40))

    assert reading.since == at_minute(40)


def test_after_a_restart_the_events_change_sets_the_times() -> None:
    # The server remembers nothing, so the blockage seems to start when it first hears of it.
    assert run((S.BLOCKED, S.STOPPED, 7)) == CrossingReading(
        S.STOPPED, since=at_minute(7), stopped_at=at_minute(7)
    )
