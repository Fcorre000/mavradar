"""The app's stats tests (app/src/domain/__tests__/stats.test.ts), ported, plus the edges where
Python and JavaScript could disagree. The server's summaries must match the app's numbers."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.contract import TYPICAL_MIN_SAMPLES
from app.domain.stats import Blockage, blockage_summary, js_round, median, typical, window_start

TZ = ZoneInfo("America/Chicago")
NOW = datetime(2026, 10, 15, 14, 0, tzinfo=TZ)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)


def ev(ago: timedelta, duration_min: float, stopped: bool = False) -> Blockage:
    return Blockage(start=NOW - ago, duration_min=duration_min, stopped=stopped)


EVENTS = [
    ev(HOUR, 4),
    ev(2 * HOUR, 6),
    ev(DAY + HOUR, 3),
    ev(2 * DAY, 20, True),
    ev(3 * DAY, 5),
    ev(40 * DAY, 99),
]


def test_median_takes_the_middle_or_the_mean_of_the_two_middles() -> None:
    assert median([1, 3, 9]) == 3
    assert median([2, 4, 6, 8]) == 5


def test_counts_only_inside_the_window() -> None:
    assert blockage_summary(EVENTS, NOW, 7).count == 5


def test_typical_of_every_blockage_and_of_stopped_ones_separately() -> None:
    s = blockage_summary(EVENTS, NOW, 7)

    assert s.typical_min == 5
    assert s.typical_stopped_min is None  # one stopped train is not enough to call typical


def test_typical_is_hidden_below_the_minimum_samples() -> None:
    assert blockage_summary(EVENTS[: TYPICAL_MIN_SAMPLES - 1], NOW, 7).typical_min is None


def test_longest_and_per_calendar_day_oldest_first() -> None:
    s = blockage_summary(EVENTS, NOW, 7)

    assert s.longest is not None and s.longest.duration_min == 20 and s.longest.stopped
    assert len(s.per_day) == 7
    assert s.per_day[6] == 2  # today
    assert sum(s.per_day) == 5


def test_hours_are_averaged_over_the_window() -> None:
    s = blockage_summary([ev(HOUR, 4), ev(DAY + HOUR, 4)], NOW, 7)

    assert s.hours[13] == pytest.approx(2 / 7)
    assert len(s.hours) == 24


# Where a port could drift from the app


def test_halves_round_up_like_javascript() -> None:
    assert js_round(2.5) == 3 and js_round(3.5) == 4  # Python's round() gives 2 and 4
    durations = [1, 2, 2.5, 3, 4]
    assert typical(durations) == 3


def test_typical_is_at_least_one_minute() -> None:
    assert typical([0.2] * TYPICAL_MIN_SAMPLES) == 1


def test_the_window_starts_at_local_midnight() -> None:
    assert window_start(NOW, 7) == datetime(2026, 10, 9, 0, 0, tzinfo=TZ)
    just_before = Blockage(datetime(2026, 10, 8, 23, 59, tzinfo=TZ), 5, False)
    just_inside = Blockage(datetime(2026, 10, 9, 0, 1, tzinfo=TZ), 5, False)

    assert blockage_summary([just_before, just_inside], NOW, 7).count == 1


def test_a_daylight_saving_week_still_has_one_slot_per_day() -> None:
    # DST ended on Sunday 2026-11-01 in Arlington, so that day was 25 hours long.
    now = datetime(2026, 11, 4, 9, 0, tzinfo=TZ)
    days = [datetime(2026, 10, 29, 23, 30, tzinfo=TZ) + timedelta(days=n) for n in range(7)]
    blockages = [Blockage(d, 5, False) for d in days if d <= now]

    s = blockage_summary(blockages, now, 7)

    assert s.per_day == [1, 1, 1, 1, 1, 1, 0]  # Oct 29 to Nov 4; Nov 4's 23:30 hasn't happened


def test_an_empty_window_matches_the_contract_example() -> None:
    s = blockage_summary([], NOW, 30)

    assert (s.count, s.typical_min, s.longest, sum(s.per_day), len(s.per_day)) == (0, None, None, 0, 30)
