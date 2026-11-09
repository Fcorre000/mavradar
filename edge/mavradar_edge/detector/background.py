"""BackgroundMap: what the empty crossing normally looks like, band by band (SD10).

A stopped train sends no Doppler readings, but it still reflects, so it shows in the raw range
frames. So does everything fixed (a mast, a gate arm), so a frame is only judged against each
band's own normal: a band is "something new" when it is well above what that band usually shows.
Capturing, confirming and saving a map on the node is E5; this module builds and compares.
"""

import statistics
from collections.abc import Sequence
from dataclasses import dataclass

from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.radar.source import RangeFrame, Reading


class MapMismatchError(ValueError):
    """A frame from different radar settings than the map's, so the bands don't line up."""


@dataclass(frozen=True)
class BackgroundMap:
    bin_size_m: float
    normal: tuple[float, ...]  # each band's usual echo on the empty crossing, nearest first
    version: str = "unsaved"

    @classmethod
    def from_frames(cls, frames: Sequence[RangeFrame], version: str = "unsaved") -> "BackgroundMap":
        """Each band's normal is the median over the frames, so a blip during capture (a bird)
        doesn't count."""
        if not frames:
            raise ValueError("a background map needs at least one range frame")
        first = frames[0]
        for frame in frames:
            if frame.bin_size_m != first.bin_size_m or len(frame.bins) != len(first.bins):
                raise MapMismatchError("every frame in a capture must have the same bands")
        normal = tuple(statistics.median(f.bins[i] for f in frames) for i in range(len(first.bins)))
        return cls(first.bin_size_m, normal, version)

    def new_bands(self, frame: RangeFrame, margin: float) -> list[int]:
        """The bands well above their own normal."""
        if frame.bin_size_m != self.bin_size_m or len(frame.bins) != len(self.normal):
            raise MapMismatchError(
                f"frame has {len(frame.bins)} bands of {frame.bin_size_m} m, the map "
                f"{len(self.normal)} of {self.bin_size_m} m"
            )
        return [
            i
            for i, (echo, usual) in enumerate(zip(frame.bins, self.normal, strict=True))
            if echo > usual + margin
        ]

    def track_bands(self, settings: DetectorSettings) -> range:
        """The bands whose centre falls in the track band."""
        first = int(settings.track_band_min_m / self.bin_size_m)
        last = int(settings.track_band_max_m / self.bin_size_m)
        inside = [
            i
            for i in range(first, min(last + 1, len(self.normal)))
            if settings.track_band_min_m <= (i + 0.5) * self.bin_size_m <= settings.track_band_max_m
        ]
        return range(inside[0], inside[-1] + 1) if inside else range(0)

    def track_occupied(self, frame: RangeFrame, settings: DetectorSettings) -> bool:
        """Something train-sized on the track: enough track bands well above their normal. One band
        alone is something small, like a person."""
        new = set(self.new_bands(frame, settings.map_margin))
        return len(new & set(self.track_bands(settings))) >= settings.min_occupied_bands


class BandWatcher:
    """Keeps whether the track band was occupied in the latest range frame."""

    def __init__(self, background: BackgroundMap, settings: DetectorSettings) -> None:
        self._map = background
        self._settings = settings
        self._occupied = False
        self._frame_t: float | None = None

    def add(self, reading: Reading) -> None:
        if isinstance(reading, RangeFrame):
            self._occupied = self._map.track_occupied(reading, self._settings)
            self._frame_t = reading.t

    def occupied(self, now: float) -> bool:
        """False once frames stop arriving, so a radar that goes quiet can't leave a train stopped."""
        if self._frame_t is None or now - self._frame_t > self._settings.frame_stale_s:
            return False
        return self._occupied
