"""BackgroundMap: what the empty crossing normally looks like, band by band (SD10).

A stopped train sends no Doppler readings, but it still reflects, so it shows in the raw range
frames. So does everything fixed (a mast, a gate arm), so a frame is only judged against each
band's own normal: a band is "something new" when it is well above what that band usually shows.
Capturing and confirming a map is the calibrate command (E5); this module builds, compares and
stores maps.
"""

import json
import os
import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

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


class MapStore:
    """The current map and the one before it, as current.json and previous.json in one folder.

    Saving copies current to previous, then swaps the new map in. Each file is written whole and
    renamed into place (os.replace is atomic), so a reboot mid-save always leaves a whole current
    map: the old one or the new one, never half of either (UC9 7a)."""

    def __init__(self, folder: Path) -> None:
        self._current = folder / "current.json"
        self._previous = folder / "previous.json"

    def load(self) -> BackgroundMap | None:
        """None before the first calibration."""
        return _read(self._current)

    def load_previous(self) -> BackgroundMap | None:
        """The map to go back to if a new one turns out worse (UC9 8a)."""
        return _read(self._previous)

    def save(self, new: BackgroundMap) -> None:
        self._current.parent.mkdir(parents=True, exist_ok=True)
        if self._current.exists():
            _write(self._previous, self._current.read_text())
        _write(
            self._current,
            json.dumps({"version": new.version, "binSizeM": new.bin_size_m, "normal": new.normal}),
        )


def _read(path: Path) -> BackgroundMap | None:
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    return BackgroundMap(
        float(data["binSizeM"]), tuple(float(v) for v in data["normal"]), str(data["version"])
    )


def _write(path: Path, text: str) -> None:
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as file:
        file.write(text)
        file.flush()
        os.fsync(file.fileno())  # on the SD card before the rename, not just in a cache
    os.replace(temporary, path)


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
