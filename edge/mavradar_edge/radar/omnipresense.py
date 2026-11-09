"""Reads OmniPreSense's public sample recordings (github.com/omnipresense/Radar-Datasets): three
bikes and a walker, taken with an OPS243-A. They are the only real OPS243 data we have, and none
of them should ever look like a train.

They aren't our log format. Each file looks spreadsheet-converted: the commas the radar prints are
tabs, and every line is padded to 1024 columns. Most lines are raw I/Q samples, which the detector
doesn't use. The rest are the radar's plain speed reports with its human-readable time (OH) and
magnitude (OM): a date, then up to three magnitude and speed pairs, strongest first.

    Tue Nov  7 2023 20:54:49.396 GMT   72.81   5.58   47.77   5.64   38.02   5.52

The files have no license, so they are never committed: scripts/fetch_recordings.py downloads them.
"""

import time
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from mavradar_edge.radar.playback import Sleep, check_speed, play
from mavradar_edge.radar.source import RangeFrame, Reading, Speed, SpeedReport

DATE_FORMAT = "%a %b %d %Y %H:%M:%S.%f GMT"


class RecordingFormatError(ValueError):
    pass


def read_omnipresense(path: Path | str) -> list[SpeedReport]:
    """The speed reports, timed in seconds from the first one."""
    path = Path(path)
    reports: list[tuple[datetime, tuple[Speed, ...]]] = []
    for number, text in enumerate(path.read_text().splitlines(), start=1):
        fields = [f.strip() for f in text.replace("\t", ",").split(",") if f.strip()]
        if not fields or fields[0].startswith('{"I"') or fields[0].startswith('{"Q"'):
            continue  # blank, or raw I/Q samples
        where = f"{path.name} line {number}"
        try:
            at = datetime.strptime(" ".join(fields[0].split()), DATE_FORMAT).replace(tzinfo=UTC)
            numbers = [float(f) for f in fields[1:]]
        except ValueError:
            raise RecordingFormatError(f"{where}: not a speed report") from None
        if not numbers or len(numbers) % 2:
            raise RecordingFormatError(f"{where}: expected magnitude and speed pairs")
        pairs = zip(numbers[0::2], numbers[1::2], strict=True)
        reports.append((at, tuple(Speed(mps=speed, magnitude=magnitude) for magnitude, speed in pairs)))
    if not reports:
        return []
    start = reports[0][0]
    return [SpeedReport((at - start).total_seconds(), objects) for at, objects in reports]


class RecordingSource:
    """A sample recording as a RadarSource. Doppler only (an OPS243-A), so no range readings."""

    def __init__(self, path: Path | str, speed: float = 0.0, sleep: Sleep = time.sleep) -> None:
        self._speed = check_speed(speed)
        self._sleep = sleep
        self._reports = read_omnipresense(path)

    def readings(self) -> Iterator[Reading]:
        return play(self._reports, self._speed, self._sleep)

    def range_frames(self, seconds: float) -> Iterator[RangeFrame]:
        return iter(())
