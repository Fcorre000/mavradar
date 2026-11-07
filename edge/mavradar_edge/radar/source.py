"""The one way the rest of the node gets radar readings (blueprint 08, section 1).

Two sources implement it: ReplaySource plays a recorded log (E1), and Ops243Source reads the real
OPS243-C (E6). The detector never knows which one it has.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from mavradar_edge.contract import Direction


@dataclass(frozen=True)
class Detection:
    """Something moving: one Doppler reading. A train is a long, strong, steady run of these."""

    t: float  # seconds since the source started
    speed_mps: float
    direction: Direction  # toward or away from the crossing
    range_m: float | None  # None when the radar has a speed but no distance for it
    strength: float  # echo strength, 0 to 1


@dataclass(frozen=True)
class RangeFrame:
    """How much echo comes back from each distance band, moving or not. Against the background map
    of the empty track, this is what shows a stopped train (SD10)."""

    t: float  # seconds since the source started
    bin_size_m: float  # bins[i] covers i * bin_size_m up to (i + 1) * bin_size_m
    bins: tuple[float, ...]  # echo strength per band, 0 to 1, nearest first


class RadarSource(Protocol):
    def detections(self) -> Iterator[Detection]:
        """Readings as they happen, in time order."""
        ...

    def range_frames(self, seconds: float) -> Iterator[RangeFrame]:
        """Range frames for the next `seconds`, for calibration."""
        ...
