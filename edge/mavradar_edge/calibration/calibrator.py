"""Calibrator: captures a background map of the empty crossing and saves it once the maintainer
confirms (UC9, SD10).

Calibration runs as its own program while the node's service is stopped (the radar has one
owner), so there is no detector to pause: the calibrate command is the whole node meanwhile, and
its heartbeats say calibrating. Nothing is saved until confirm(), so a capture that's thrown out,
rejected or cut short by a reboot leaves the saved map exactly as it was.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from mavradar_edge.contract import NodeStatus, ReportedState
from mavradar_edge.detector.background import BackgroundMap, MapMismatchError, MapStore
from mavradar_edge.detector.detector import DetectorStatus
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.radar.source import RadarSource, RangeFrame


@dataclass(frozen=True)
class CalibrationSummary:
    frames: int
    current: BackgroundMap | None  # the saved map, None before the first calibration
    candidate: BackgroundMap | None  # None when the capture was thrown out
    problem: str | None = None  # why it was thrown out
    looks_occupied: bool = False  # the new map's track bands look train-sized next to the current map


class Calibrator:
    def __init__(
        self,
        source: RadarSource,
        store: MapStore,
        settings: DetectorSettings,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._source = source
        self._store = store
        self._s = settings
        self._now = now
        self._candidate: BackgroundMap | None = None

    def current_status(self) -> DetectorStatus:
        """For the heartbeats while calibrating. sensorOffline because the node can't see the
        crossing now, so the server shows it as Unknown instead of trusting an old clear."""
        current = self._store.load()
        version = current.version if current else "none"
        return DetectorStatus(NodeStatus.CALIBRATING, ReportedState.SENSOR_OFFLINE, version)

    def start(self, seconds: float) -> CalibrationSummary:
        frames = list(self._source.range_frames(seconds))
        current = self._store.load()
        self._candidate = None
        if len(frames) < self._s.calibration_min_frames:
            problem = f"too few range frames ({len(frames)}, needs {self._s.calibration_min_frames:g})"
            return CalibrationSummary(len(frames), current, None, problem)
        candidate = BackgroundMap.from_frames(frames, version=self._now().strftime("%Y-%m-%dT%H:%M:%SZ"))
        if moved(frames, candidate, self._s):
            return CalibrationSummary(len(frames), current, None, "something moved in the track band")
        self._candidate = candidate
        return CalibrationSummary(
            len(frames), current, candidate, looks_occupied=looks_occupied(candidate, current, self._s)
        )

    def confirm(self) -> BackgroundMap:
        """Saves the new map; the one it replaces is kept as the previous map."""
        if self._candidate is None:
            raise RuntimeError("no clean capture to confirm")
        saved, self._candidate = self._candidate, None
        self._store.save(saved)
        return saved

    def reject(self) -> None:
        self._candidate = None


def moved(frames: list[RangeFrame], candidate: BackgroundMap, s: DetectorSettings) -> bool:
    """True if any frame is far from the capture's own median in enough track bands. Above
    catches something passing; below catches a train that sat through most of the capture (so
    it became the median) and then left."""
    track = candidate.track_bands(s)
    return any(
        sum(abs(frame.bins[i] - candidate.normal[i]) > s.map_margin for i in track) >= s.min_occupied_bands
        for frame in frames
    )


def looks_occupied(candidate: BackgroundMap, current: BackgroundMap | None, s: DetectorSettings) -> bool:
    """The detector's own test, with the new map as the frame: would the current map call it a
    train? Catches a train stopped for the whole capture, which never moved."""
    if current is None:
        return False
    try:
        return current.track_occupied(RangeFrame(0.0, candidate.bin_size_m, candidate.normal), s)
    except MapMismatchError:  # the radar's bands changed since the last map: nothing to compare
        return False


def describe(summary: CalibrationSummary, s: DetectorSettings) -> str:
    """What the maintainer reads before deciding (UC9 step 5)."""
    if summary.candidate is None:
        return (
            f"Capture thrown out: {summary.problem}. The saved map is unchanged. Clear the track, try again."
        )
    new, old = summary.candidate, summary.current
    lines = [f"Clean capture: {summary.frames} range frames, new map version {new.version}."]
    if summary.looks_occupied:
        lines.append(
            "WARNING: THE TRACK BANDS LOOK TRAIN-SIZED NEXT TO THE CURRENT MAP. Is something parked there?"
        )
    if old is None:
        lines.append("No current map to compare. Check the track is empty before saving.")
    elif (len(old.normal), old.bin_size_m) != (len(new.normal), new.bin_size_m):
        lines.append(f"The current map ({old.version}) has different bands, so it can't be compared.")
        old = None
    else:
        lines.append(f"Compared with the current map ({old.version}):")
    track = new.track_bands(s)
    changed = {
        i
        for i in range(len(new.normal))
        if old is not None and abs(new.normal[i] - old.normal[i]) > s.map_margin
    }
    lines.append("  band        new   current")
    for i in sorted(set(track) | changed):
        where = f"{i * new.bin_size_m:g}-{(i + 1) * new.bin_size_m:g} m"
        was = f"{old.normal[i]:7.1f}" if old is not None else "      -"
        lines.append(f"  {where:<10}{new.normal[i]:6.1f}  {was}  {'track' if i in track else 'changed'}")
    return "\n".join(lines)
