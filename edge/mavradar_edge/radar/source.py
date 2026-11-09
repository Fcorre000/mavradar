"""The one way the rest of the node gets radar readings (blueprint 08, section 1).

Two sources implement it: ReplaySource plays a recorded log (E1, E2), and Ops243Source reads the
real OPS243-C (E6). The detector never knows which one it has.

The reading types follow what the OPS243-C prints (AN-010-AE). Speed and range are measured
separately (Doppler and FMCW) and printed on separate lines, each listing objects strongest first,
so nothing says which speed goes with which distance. They stay separate here; relating them is
the detector's job.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from mavradar_edge.contract import Direction


@dataclass(frozen=True)
class Speed:
    mps: float  # signed as the radar reports it: positive is toward the radar
    magnitude: float  # the radar's raw echo strength; depends on size, distance and reflectivity

    @property
    def direction(self) -> Direction:
        # The node sits at the crossing, so toward the radar is toward the crossing.
        return Direction.TOWARD if self.mps >= 0 else Direction.AWAY


@dataclass(frozen=True)
class Distance:
    m: float
    magnitude: float


@dataclass(frozen=True)
class SpeedReport:
    """One Doppler report: the moving objects the radar sees, strongest first."""

    t: float  # seconds since the radar powered on
    objects: tuple[Speed, ...]


@dataclass(frozen=True)
class RangeReport:
    """One FMCW report: distances to whatever reflects, moving or not, strongest first."""

    t: float
    objects: tuple[Distance, ...]


@dataclass(frozen=True)
class OcReport:
    """The radar's vehicle-classification summary (OC), printed once an object leaves the beam.
    Doppler-based, so it never sees a stopped train. A long train may give one report or several,
    split at the gaps between cars."""

    t: float  # when it was printed: the object's end_time
    inbound: bool  # classifier "object_inbound" (toward the radar) or "object_outbound"
    start_time: float
    end_time: float
    delta_time_msec: int  # how long the object was in the beam
    max_speed_mps: float
    min_speed_mps: float
    max_magnitude: float
    avg_magnitude: float
    total_frames: int
    frames_per_mps: float
    length_m: float  # max speed x time in view, so overstated
    speed_change: float


@dataclass(frozen=True)
class RangeFrame:
    """The raw FMCW range data (oF): echo per distance band, moving or not. Against the background
    map of the empty track, this is what shows a stopped train (SD10)."""

    t: float
    bin_size_m: float  # bins[i] covers i * bin_size_m up to (i + 1) * bin_size_m
    bins: tuple[float, ...]  # raw magnitude per band, nearest first


Reading = SpeedReport | RangeReport | OcReport | RangeFrame


class RadarSource(Protocol):
    def readings(self) -> Iterator[Reading]:
        """Every reading as it happens, all kinds together, in time order."""
        ...

    def range_frames(self, seconds: float) -> Iterator[RangeFrame]:
        """Range frames for the next `seconds`, for calibration."""
        ...
