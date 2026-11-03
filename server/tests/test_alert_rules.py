"""Each alert rule alone (09 S2 done-when: every alert rule has its own test)."""

from datetime import time, timedelta

import pytest

from app.contract import AlertMode, AlertTypesDoc, CommuteWindowDoc, QuietHoursDoc
from app.domain.crossing_state import AlertKind
from app.services.alert_rules import (
    AlertModeRule,
    AlertTypeRule,
    CommuteWindowRule,
    LatenessRule,
    LogOnlyRule,
    QuietHoursRule,
    ToldAlreadyRule,
    in_window,
)
from tests.helpers import chicago, context, device

K = AlertKind
ALL_KINDS = list(AlertKind)

# Time windows


@pytest.mark.parametrize(
    ("t", "start", "end", "inside"),
    [
        ("08:00", "07:00", "09:00", True),
        ("07:00", "07:00", "09:00", True),  # start counts
        ("09:00", "07:00", "09:00", False),  # end doesn't
        ("12:00", "07:00", "09:00", False),
        ("23:30", "22:00", "07:00", True),  # wraps past midnight: the late piece
        ("03:00", "22:00", "07:00", True),  # the early piece
        ("12:00", "22:00", "07:00", False),
        ("22:00", "22:00", "07:00", True),
        ("07:00", "22:00", "07:00", False),
        ("10:00", "10:00", "10:00", False),  # same start and end: an empty window
    ],
)
def test_in_window(t: str, start: str, end: str, inside: bool) -> None:
    assert in_window(time.fromisoformat(t), time.fromisoformat(start), time.fromisoformat(end)) is inside


# Alert mode


@pytest.mark.parametrize("kind", ALL_KINDS)
def test_log_only_mode_allows_nothing(kind: AlertKind) -> None:
    assert not AlertModeRule().allows(device(), context(kind, alert_mode=AlertMode.LOG_ONLY))


@pytest.mark.parametrize("kind", ALL_KINDS)
def test_blocked_and_cleared_mode_allows_all_but_approaching(kind: AlertKind) -> None:
    allowed = AlertModeRule().allows(device(), context(kind, alert_mode=AlertMode.BLOCKED_AND_CLEARED))

    assert allowed is (kind is not K.APPROACHING)


@pytest.mark.parametrize("kind", ALL_KINDS)
def test_all_mode_allows_every_kind(kind: AlertKind) -> None:
    assert AlertModeRule().allows(device(), context(kind, alert_mode=AlertMode.ALL))


# Log-only flag


def test_log_only_event_alerts_nobody() -> None:
    assert not LogOnlyRule().allows(device(), context(log_only=True))
    assert LogOnlyRule().allows(device(), context(log_only=False))


# Lateness


@pytest.mark.parametrize(
    ("kind", "age_s", "allowed"),
    [
        (K.APPROACHING, 60, True),
        (K.APPROACHING, 61, False),
        (K.CLEARED, 600, True),
        (K.CLEARED, 601, False),
        (K.STOPPED, 3600, True),  # no limit in the contract
        (K.BLOCKED, 3600, True),
    ],
)
def test_lateness(kind: AlertKind, age_s: int, allowed: bool) -> None:
    assert LatenessRule().allows(device(), context(kind, age=timedelta(seconds=age_s))) is allowed


# Alert types


def test_alert_type_switched_off() -> None:
    types = AlertTypesDoc(approaching=True, blocked=True, stopped=False, cleared=True)

    assert not AlertTypeRule().allows(device(alert_types=types), context(K.STOPPED))
    assert AlertTypeRule().allows(device(alert_types=types), context(K.CLEARED))


@pytest.mark.parametrize("kind", ALL_KINDS)
def test_alert_types_not_written_yet_use_the_app_defaults(kind: AlertKind) -> None:
    assert AlertTypeRule().allows(device(), context(kind)) is (kind is not K.APPROACHING)


# Quiet hours (times are Arlington wall clock)

QUIET = QuietHoursDoc(start="22:00", end="07:00")


@pytest.mark.parametrize(
    ("local", "allowed"),
    [
        ("2026-07-06T23:30", False),
        ("2026-07-07T03:00", False),
        ("2026-07-06T12:00", True),
        ("2026-07-07T07:00", True),  # quiet hours have ended
    ],
)
def test_quiet_hours_past_midnight(local: str, allowed: bool) -> None:
    phone = device(quiet_hours=QUIET, time_zone="America/Chicago")

    assert QuietHoursRule().allows(phone, context(now=chicago(local))) is allowed


def test_no_quiet_hours_allows() -> None:
    assert QuietHoursRule().allows(device(), context(now=chicago("2026-07-06T23:30")))


def test_quiet_hours_use_the_phones_time_zone() -> None:
    now = chicago("2026-07-06T21:30")  # 22:30 in New York

    assert QuietHoursRule().allows(device(quiet_hours=QUIET, time_zone="America/Chicago"), context(now=now))
    assert not QuietHoursRule().allows(
        device(quiet_hours=QUIET, time_zone="America/New_York"), context(now=now)
    )


def test_missing_time_zone_means_arlington() -> None:
    assert not QuietHoursRule().allows(device(quiet_hours=QUIET), context(now=chicago("2026-07-06T23:30")))


# Commute windows (2026-07-06 is a Monday; days are ISO, 1 = Monday)

MORNING = CommuteWindowDoc(days=[1, 2, 3, 4, 5], start="07:00", end="09:00")
LATE_MONDAY = CommuteWindowDoc(days=[1], start="22:00", end="02:00")


@pytest.mark.parametrize("windows", [None, []], ids=["none", "empty"])
def test_no_commute_windows_allows(windows: list[CommuteWindowDoc] | None) -> None:
    assert CommuteWindowRule().allows(
        device(commute_windows=windows), context(now=chicago("2026-07-06T03:00"))
    )


@pytest.mark.parametrize(
    ("local", "allowed"),
    [
        ("2026-07-06T08:00", True),  # Monday morning, inside
        ("2026-07-06T12:00", False),  # outside the hours
        ("2026-07-11T08:00", False),  # Saturday
    ],
)
def test_commute_window(local: str, allowed: bool) -> None:
    rule = CommuteWindowRule()

    assert rule.allows(device(commute_windows=[MORNING]), context(now=chicago(local))) is allowed


@pytest.mark.parametrize(
    ("local", "allowed"),
    [
        ("2026-07-06T23:00", True),  # Monday night
        ("2026-07-07T01:00", True),  # early Tuesday belongs to Monday's window
        ("2026-07-06T01:00", False),  # early Monday would be Sunday's window
        ("2026-07-07T23:00", False),  # Tuesday night
    ],
)
def test_commute_window_past_midnight_belongs_to_its_start_day(local: str, allowed: bool) -> None:
    rule = CommuteWindowRule()

    assert rule.allows(device(commute_windows=[LATE_MONDAY]), context(now=chicago(local))) is allowed


# Already told


@pytest.mark.parametrize(
    ("kind", "told", "allowed"),
    [
        (K.STOPPED, set[AlertKind](), False),
        (K.STOPPED, {K.BLOCKED}, True),
        (K.CLEARED, set[AlertKind](), False),
        (K.CLEARED, {K.BLOCKED}, True),
        (K.CLEARED, {K.STOPPED}, True),
        (K.APPROACHING, set[AlertKind](), True),
    ],
)
def test_told_already(kind: AlertKind, told: set[AlertKind], allowed: bool) -> None:
    ctx = context(kind, told={"token-a": frozenset(told)})

    assert ToldAlreadyRule().allows(device("token-a"), ctx) is allowed


def test_told_memory_is_per_phone() -> None:
    ctx = context(K.CLEARED, told={"token-b": frozenset({K.BLOCKED})})

    assert not ToldAlreadyRule().allows(device("token-a"), ctx)
