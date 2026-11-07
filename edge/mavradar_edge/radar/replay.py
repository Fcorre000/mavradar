"""ReplaySource: plays a recorded log as if the radar were sending it, so the node can be built and
tested with no radar. The format is in tests/data/README.md.

The whole log is read and checked up front, so a bad log fails at startup with its line number,
not halfway through a replay.
"""

import json
import math
import time
from collections.abc import Callable, Iterator, Sequence
from pathlib import Path
from typing import TypeVar, cast

from mavradar_edge.contract import Direction
from mavradar_edge.radar.source import Detection, RangeFrame

Reading = Detection | RangeFrame
R = TypeVar("R", Detection, RangeFrame)


class LogFormatError(ValueError):
    """A line the format doesn't allow. The message names the file and line."""


class ReplaySource:
    def __init__(
        self, path: Path | str, speed: float = 1.0, sleep: Callable[[float], object] = time.sleep
    ) -> None:
        """`speed` 1 plays at real speed, 10 ten times faster, 0 with no waiting at all. `sleep` is
        how it waits; tests pass a fake that records the waits instead."""
        if speed < 0 or math.isnan(speed):
            raise ValueError("speed can't be negative")
        self._speed = speed
        self._sleep = sleep
        self.recorded_at: str | None = None  # from the optional header line
        self._readings = self._load(Path(path))

    def detections(self) -> Iterator[Detection]:
        return self._play([r for r in self._readings if isinstance(r, Detection)])

    def range_frames(self, seconds: float) -> Iterator[RangeFrame]:
        """The range frames from the first `seconds` of the log, timed like detections()."""
        frames = [r for r in self._readings if isinstance(r, RangeFrame)]
        if not frames:
            return iter(())
        end = frames[0].t + seconds
        return self._play([f for f in frames if f.t < end])

    def _play(self, readings: Sequence[R]) -> Iterator[R]:
        previous: float | None = None
        for reading in readings:
            if previous is not None and self._speed > 0:
                gap = (reading.t - previous) / self._speed
                if gap > 0:
                    self._sleep(gap)
            previous = reading.t
            yield reading

    def _load(self, path: Path) -> list[Reading]:
        readings: list[Reading] = []
        last_t = -math.inf
        for number, text in enumerate(path.read_text().splitlines(), start=1):
            if not text.strip():
                continue
            where = f"{path.name} line {number}"
            try:
                raw = json.loads(text)
            except json.JSONDecodeError as error:
                raise LogFormatError(f"{where}: not JSON ({error.msg})") from None
            if not isinstance(raw, dict):
                raise LogFormatError(f"{where}: each line must be a JSON object")
            line = cast(dict[str, object], raw)

            kind = line.get("type")
            if kind == "header":
                if readings or self.recorded_at is not None:
                    raise LogFormatError(f"{where}: the header can only be the first line")
                recorded_at = line.get("recordedAt")
                self.recorded_at = recorded_at if isinstance(recorded_at, str) else None
                continue

            t = _number(line, "t", where)
            if t < last_t:
                raise LogFormatError(f"{where}: t goes backwards ({t} after {last_t})")
            last_t = t
            if kind == "detection":
                readings.append(_detection(line, t, where))
            elif kind == "range":
                readings.append(_range_frame(line, t, where))
            else:
                raise LogFormatError(f"{where}: unknown type {kind!r}")
        return readings


def _detection(line: dict[str, object], t: float, where: str) -> Detection:
    direction = line.get("direction")
    if direction not in ("toward", "away"):
        raise LogFormatError(f"{where}: direction must be toward or away, not {direction!r}")
    range_m = line.get("rangeM")
    return Detection(
        t=t,
        speed_mps=_number(line, "speedMps", where, minimum=0),
        direction=Direction(direction),
        range_m=None if range_m is None else _number(line, "rangeM", where, minimum=0),
        strength=_number(line, "strength", where, minimum=0, maximum=1),
    )


def _range_frame(line: dict[str, object], t: float, where: str) -> RangeFrame:
    bins = line.get("bins")
    if not isinstance(bins, list) or not bins:
        raise LogFormatError(f"{where}: bins must be a non-empty list")
    values: list[float] = []
    for value in cast(list[object], bins):
        if not _is_number(value) or not 0 <= cast(float, value) <= 1:
            raise LogFormatError(f"{where}: every bin must be a number from 0 to 1")
        values.append(float(cast(float, value)))
    return RangeFrame(t=t, bin_size_m=_number(line, "binSizeM", where, minimum=0), bins=tuple(values))


def _is_number(value: object) -> bool:
    # JSON true and false load as bools, which Python also counts as ints.
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def _number(
    line: dict[str, object], name: str, where: str, minimum: float | None = None, maximum: float | None = None
) -> float:
    value = line.get(name)
    if value is None:
        raise LogFormatError(f"{where}: missing {name}")
    if not _is_number(value):
        raise LogFormatError(f"{where}: {name} must be a number, not {value!r}")
    number = float(cast(float, value))
    if (minimum is not None and number < minimum) or (maximum is not None and number > maximum):
        raise LogFormatError(f"{where}: {name} is out of range ({number})")
    return number
