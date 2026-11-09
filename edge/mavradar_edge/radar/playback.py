"""Hands readings over on their recorded timing. Shared by the replay and the recordings reader."""

import math
import time
from collections.abc import Callable, Iterator, Sequence
from typing import TypeVar

from mavradar_edge.radar.source import Reading

R = TypeVar("R", bound=Reading)

Sleep = Callable[[float], object]


def check_speed(speed: float) -> float:
    if speed < 0 or math.isnan(speed):
        raise ValueError("speed can't be negative")
    return speed


def play(readings: Sequence[R], speed: float, sleep: Sleep = time.sleep) -> Iterator[R]:
    """Waits (t - previous t) / speed before each reading, then hands it over. `speed` 1 is real
    speed, 10 ten times faster, 0 no waiting. Tests pass a fake `sleep` that records the waits."""
    previous: float | None = None
    for reading in readings:
        if previous is not None and speed > 0:
            gap = (reading.t - previous) / speed
            if gap > 0:
                sleep(gap)
        previous = reading.t
        yield reading
