"""The alert rules: one small class per condition, each saying whether one device may get one alert
(07, Strategy card). AlertPolicy runs them in order; a device needs a yes from every rule.

Minimum blockage time is not here: blocked alerts go out from the S5 checks (SD4).
"""

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Protocol, assert_never
from zoneinfo import ZoneInfo

from app.contract import APPROACHING_MAX_AGE_S, CLEARED_MAX_AGE_S, AlertMode, CommuteWindowDoc
from app.domain.crossing_state import AlertKind
from app.repositories.base import ToldRecord
from app.services.subscriptions import Device

# For a device that hasn't written its timeZone yet (task A3). Every crossing so far is in Arlington.
DEFAULT_TIME_ZONE = "America/Chicago"


@dataclass(frozen=True)
class AlertContext:
    """Everything about one alert that the rules need, the same for every device."""

    crossing_id: str
    kind: AlertKind
    log_only: bool
    alert_mode: AlertMode
    age: timedelta  # how old the event is
    now: datetime  # when the phone would buzz; the time rules use this, not the event time
    told: ToldRecord


class AlertRule(Protocol):
    def allows(self, device: Device, ctx: AlertContext) -> bool: ...


def in_window(t: time, start: time, end: time) -> bool:
    """Whether a time of day falls in [start, end). A window whose start is later than its end
    wraps past midnight, so it is two pieces: from start to midnight, and from midnight to end."""
    if start <= end:
        return start <= t < end
    return t >= start or t < end


def local_now(device: Device, ctx: AlertContext) -> datetime:
    return ctx.now.astimezone(ZoneInfo(device.doc.time_zone or DEFAULT_TIME_ZONE))


class AlertModeRule:
    """The crossing's alert mode (D1, OQ19). A crossing that isn't configured is logOnly."""

    def allows(self, device: Device, ctx: AlertContext) -> bool:
        match ctx.alert_mode:
            case AlertMode.LOG_ONLY:
                return False
            case AlertMode.BLOCKED_AND_CLEARED:
                return ctx.kind is not AlertKind.APPROACHING
            case AlertMode.ALL:
                return True
            case _:
                assert_never(ctx.alert_mode)


class LogOnlyRule:
    """An event the node flagged log-only still updates the state and history, but alerts nobody."""

    def allows(self, device: Device, ctx: AlertContext) -> bool:
        return not ctx.log_only


class LatenessRule:
    """Drops an alert that is too old to help (OQ17). Only these two kinds have limits in the contract."""

    def allows(self, device: Device, ctx: AlertContext) -> bool:
        match ctx.kind:
            case AlertKind.APPROACHING:
                return ctx.age <= timedelta(seconds=APPROACHING_MAX_AGE_S)
            case AlertKind.CLEARED:
                return ctx.age <= timedelta(seconds=CLEARED_MAX_AGE_S)
            case AlertKind.BLOCKED | AlertKind.STOPPED:
                return True
            case _:
                assert_never(ctx.kind)


class AlertTypeRule:
    """The alert types the person switched on. Before the app writes them (A3), the app's own
    defaults apply: blocked, stopped and cleared on, approaching off."""

    def allows(self, device: Device, ctx: AlertContext) -> bool:
        types = device.doc.alert_types
        match ctx.kind:
            case AlertKind.APPROACHING:
                return types.approaching if types else False
            case AlertKind.BLOCKED:
                return types.blocked if types else True
            case AlertKind.STOPPED:
                return types.stopped if types else True
            case AlertKind.CLEARED:
                return types.cleared if types else True
            case _:
                assert_never(ctx.kind)


class QuietHoursRule:
    """No alerts inside quiet hours. They are dropped, not held: hours later they would be stale."""

    def allows(self, device: Device, ctx: AlertContext) -> bool:
        quiet = device.doc.quiet_hours
        if quiet is None:
            return True
        t = local_now(device, ctx).time()
        return not in_window(t, time.fromisoformat(quiet.start), time.fromisoformat(quiet.end))


class CommuteWindowRule:
    """With commute windows set, alerts only come inside one of them ("alerts only come when you
    drive"). None or an empty list means no windows, so no limit."""

    def allows(self, device: Device, ctx: AlertContext) -> bool:
        windows = device.doc.commute_windows
        if not windows:
            return True
        local = local_now(device, ctx)
        return any(_in_commute(window, local) for window in windows)


def _in_commute(window: CommuteWindowDoc, local: datetime) -> bool:
    """A window's days are the days it starts on: Mon 22:00 to 02:00 runs into early Tuesday."""
    t, start, end = local.time(), time.fromisoformat(window.start), time.fromisoformat(window.end)
    if start <= end:
        return local.isoweekday() in window.days and start <= t < end
    if t >= start:
        return local.isoweekday() in window.days
    if t < end:
        return (local - timedelta(days=1)).isoweekday() in window.days
    return False


class ToldAlreadyRule:
    """Stopped only goes to phones told blocked; cleared only to phones told blocked or stopped.
    The memory is wiped when the train clears, so it covers the current blockage only."""

    def allows(self, device: Device, ctx: AlertContext) -> bool:
        told = ctx.told.get(device.token, frozenset())
        match ctx.kind:
            case AlertKind.STOPPED:
                return AlertKind.BLOCKED in told
            case AlertKind.CLEARED:
                return AlertKind.BLOCKED in told or AlertKind.STOPPED in told
            case AlertKind.APPROACHING | AlertKind.BLOCKED:
                return True
            case _:
                assert_never(ctx.kind)
