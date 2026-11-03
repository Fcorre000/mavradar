"""Notification text. Titles match the app's (app/src/domain/alerts.ts) and carry the message on
their own for a one-line glance. Pure, no I/O.

Crossing names and detours are public (they're on the map) and rarely change, so they live here.
"""

from datetime import datetime
from typing import assert_never
from zoneinfo import ZoneInfo

from app.domain.crossing_state import AlertKind

CROSSING_NAMES = {"794980D": "Cooper St"}
DETOURS = {"794980D": "West St underpass"}
# One message goes to a whole batch of phones, so times are shown in the crossing's own zone.
CROSSING_TIME_ZONE = ZoneInfo("America/Chicago")


def crossing_name(crossing_id: str) -> str:
    return CROSSING_NAMES.get(crossing_id, f"Crossing {crossing_id}")


def clock(at: datetime) -> str:
    """Like 2:20 PM, in the crossing's time zone."""
    local = at.astimezone(CROSSING_TIME_ZONE)
    return f"{local.hour % 12 or 12}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'}"


def alert_text(kind: AlertKind, crossing_id: str, at: datetime) -> tuple[str, str]:
    """Title and body. `at` is when the change happened. "Blocked for N min" waits for S5, which
    tracks when a blockage started."""
    name = crossing_name(crossing_id)
    match kind:
        case AlertKind.APPROACHING:
            return f"Train approaching {name}", "It will likely block the crossing shortly."
        case AlertKind.BLOCKED:
            detour = DETOURS.get(crossing_id)
            body = f"Train on the crossing since {clock(at)}." + (f" Detour: {detour}." if detour else "")
            return f"{name} is blocked", body
        case AlertKind.STOPPED:
            return f"Train stopped on {name}", f"Stopped since {clock(at)}."
        case AlertKind.CLEARED:
            return f"{name} is clear", f"Cleared at {clock(at)}."
        case _:
            assert_never(kind)
