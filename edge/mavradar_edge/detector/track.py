"""Track: one thing the radar keeps seeing, built up reading by reading.

Speed and range reports arrive separately and are never paired (radar/source.py). The track
takes its duration, speed and direction from the speed reports, and from the range reports only
when something strong was last seen in the track band. The classifier relates them by asking for
both at once, never by matching one speed to one distance.
"""

import statistics
from dataclasses import dataclass, field

from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.radar.source import RangeReport, Reading, SpeedReport

RECENT = 10  # speed readings that decide the current direction


@dataclass
class Track:
    start_t: float  # first strong speed reading
    last_t: float  # latest strong speed reading
    now: float  # the latest reading of any kind
    speeds_mps: list[float] = field(default_factory=list[float])  # every strong reading, signed
    last_in_band_t: float | None = None  # latest strong range reading in the track band

    @property
    def duration_s(self) -> float:
        return self.last_t - self.start_t

    @property
    def median_speed_mps(self) -> float:
        return statistics.median(abs(s) for s in self.speeds_mps)

    @property
    def toward(self) -> bool:
        """Mostly moving toward the radar lately. Positive speed is toward, so toward also means
        the range is closing."""
        recent = self.speeds_mps[-RECENT:]
        return sum(s > 0 for s in recent) > len(recent) / 2

    def in_band(self, window_s: float) -> bool:
        return self.last_in_band_t is not None and self.now - self.last_in_band_t <= window_s


class TrackBuilder:
    """Feed it every reading in time order; it keeps the current track, or none."""

    def __init__(self, settings: DetectorSettings) -> None:
        self._settings = settings
        self._track: Track | None = None
        self._last_in_band_t: float | None = None
        self._last_motion_t: float | None = None

    def still_s(self, now: float) -> float:
        """How long nothing has moved, even after the track ended. Infinite before any motion."""
        return float("inf") if self._last_motion_t is None else now - self._last_motion_t

    @property
    def track(self) -> Track | None:
        return self._track

    def add(self, reading: Reading) -> Track | None:
        s = self._settings
        if isinstance(reading, RangeReport):
            band = [o for o in reading.objects if s.track_band_min_m <= o.m <= s.track_band_max_m]
            if any(o.magnitude >= s.min_magnitude for o in band):
                self._last_in_band_t = reading.t

        track = self._track
        if track is not None and reading.t - track.last_t > s.gap_s:
            track = None  # gone for longer than a gap between cars

        if isinstance(reading, SpeedReport):
            # The strongest object above the floor; the radar lists them strongest first.
            strong = next(
                (
                    o
                    for o in reading.objects
                    if o.magnitude >= s.min_magnitude and abs(o.mps) >= s.clutter_mps
                ),
                None,
            )
            if strong is not None:
                self._last_motion_t = reading.t
                if track is None:
                    track = Track(start_t=reading.t, last_t=reading.t, now=reading.t)
                track.last_t = reading.t
                track.speeds_mps.append(strong.mps)

        if track is not None:
            track.now = reading.t
            track.last_in_band_t = self._last_in_band_t
        self._track = track
        return track
