"""Blockage statistics for crossings/{id}/summary/{7d|30d}: a port of the app's blockageStats in
app/src/domain/stats.ts, which says a server-side summary must use the same definitions. Change
both together. Pure, no I/O.

Days and hours are counted in the crossing's time zone. The app counts them in the phone's, which
is the same for every user so far.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from app.contract import TYPICAL_MIN_SAMPLES, HistorySummaryDoc, LongestDoc
from app.domain.alert_text import CROSSING_TIME_ZONE


@dataclass(frozen=True)
class Blockage:
    start: datetime
    duration_min: float
    stopped: bool


def js_round(x: float) -> int:
    """Math.round: halves go up. Python's round() sends 2.5 to 2, which would disagree with the app."""
    return math.floor(x + 0.5)


def median(sorted_values: Sequence[float]) -> float:
    mid = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[mid]
    return (sorted_values[mid - 1] + sorted_values[mid]) / 2


def typical(durations: Sequence[float]) -> int | None:
    """Null with too little history, so the app never states a "typical" time from a few trains."""
    if len(durations) < TYPICAL_MIN_SAMPLES:
        return None
    return max(1, js_round(median(sorted(durations))))


def window_start(now: datetime, days: int, tz: ZoneInfo = CROSSING_TIME_ZONE) -> datetime:
    """Local midnight `days - 1` days ago: the window covers `days` calendar days, today included."""
    first: date = now.astimezone(tz).date() - timedelta(days=days - 1)
    return datetime.combine(first, time(0), tzinfo=tz)


def blockage_summary(
    blockages: Sequence[Blockage], now: datetime, days: Literal[7, 30], tz: ZoneInfo = CROSSING_TIME_ZONE
) -> HistorySummaryDoc:
    """One crossing's blockages, any range, summarized over the window ending now."""
    today = now.astimezone(tz).date()
    start = window_start(now, days, tz)
    mine = sorted((b for b in blockages if start <= b.start <= now), key=lambda b: b.start, reverse=True)

    hours = [0] * 24
    per_day = [0] * days
    longest: Blockage | None = None
    for b in mine:  # newest first, like the app, so a tie for longest keeps the newest
        local = b.start.astimezone(tz)
        hours[local.hour] += 1
        # Calendar days, not 24-hour blocks, so a daylight-saving day still counts once.
        per_day[days - 1 - (today - local.date()).days] += 1
        if longest is None or b.duration_min > longest.duration_min:
            longest = b

    return HistorySummaryDoc(
        days=days,
        count=len(mine),
        typical_min=typical([b.duration_min for b in mine]),
        typical_stopped_min=typical([b.duration_min for b in mine if b.stopped]),
        longest=(
            LongestDoc(start=longest.start, duration_min=longest.duration_min, stopped=longest.stopped)
            if longest
            else None
        ),
        hours=[n / days for n in hours],
        per_day=per_day,
        updated_at=now,
    )
