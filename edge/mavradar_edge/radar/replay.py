"""ReplaySource: plays a recorded log of what the OPS243-C prints in JSON mode (OJ), as if the
radar were sending it, so the node can be built and tested with no radar. The format is in
tests/data/README.md.

The whole log is read and checked up front, so a bad log fails at startup with its line number,
not halfway through a replay.
"""

import json
import math
import time
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import cast

from mavradar_edge.radar.playback import Sleep, check_speed, play
from mavradar_edge.radar.source import (
    Distance,
    OcReport,
    RangeFrame,
    RangeReport,
    Reading,
    Speed,
    SpeedReport,
)

# The radar prints at most this many objects per report (O=n goes up to 16; we set 3).
MAX_OBJECTS = 16


class LogFormatError(ValueError):
    """A line the format doesn't allow. The message names the file and line."""


class ReplaySource:
    def __init__(
        self, path: Path | str, speed: float = 1.0, sleep: Sleep = time.sleep, range_bin_m: float = 1.0
    ) -> None:
        """`range_bin_m` is the size of one raw range band. The radar reports it with ?z; it's a
        setting because its FFT lines don't carry it."""
        self._speed = check_speed(speed)
        self._sleep = sleep
        self._range_bin_m = range_bin_m
        self.recorded_at: str | None = None  # from the optional first metadata line
        self._readings = self._load(Path(path))

    def readings(self) -> Iterator[Reading]:
        return play(self._readings, self._speed, self._sleep)

    def range_frames(self, seconds: float) -> Iterator[RangeFrame]:
        """The range frames from the first `seconds` of the log, on their recorded timing."""
        frames = [r for r in self._readings if isinstance(r, RangeFrame)]
        if not frames:
            return iter(())
        end = frames[0].t + seconds
        return play([f for f in frames if f.t < end], self._speed, self._sleep)

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

            if "recordedAt" in line:  # our recorder's note, never printed by the radar
                if readings or self.recorded_at is not None:
                    raise LogFormatError(f"{where}: the recordedAt line can only be the first line")
                recorded_at = line["recordedAt"]
                self.recorded_at = recorded_at if isinstance(recorded_at, str) else None
                continue

            reading = self._reading(line, where)
            if isinstance(reading, OcReport):
                # Printed just after the object leaves, so its end_time can trail the last report a
                # little. It still arrives where the radar printed it.
                reading = _at(reading, max(reading.t, last_t))
            elif reading.t < last_t:
                raise LogFormatError(f"{where}: time goes backwards ({reading.t} after {last_t})")
            last_t = reading.t
            readings.append(reading)
        return readings

    def _reading(self, line: dict[str, object], where: str) -> Reading:
        if "classifier" in line:
            return _oc(line, where)
        if "FFT" in line:
            return _range_frame(line, where, self._range_bin_m)
        if "speed" in line:
            values = _values(line, "speed", where)
            magnitudes = _magnitudes(line, len(values), where)
            _unit(line, "mps", where)
            return SpeedReport(
                _number(line, "time", where),
                tuple(Speed(v, m) for v, m in zip(values, magnitudes, strict=True)),
            )
        if "range" in line:
            values = _values(line, "range", where, minimum=0)
            magnitudes = _magnitudes(line, len(values), where)
            _unit(line, "m", where)
            return RangeReport(
                _number(line, "time", where),
                tuple(Distance(v, m) for v, m in zip(values, magnitudes, strict=True)),
            )
        raise LogFormatError(f"{where}: not a speed, range, FFT or OC line")


def _at(report: OcReport, t: float) -> OcReport:
    return replace(report, t=t)


def _oc(line: dict[str, object], where: str) -> OcReport:
    classifier = line.get("classifier")
    if classifier not in ("object_inbound", "object_outbound"):
        raise LogFormatError(f"{where}: classifier must be object_inbound or object_outbound")
    end_time = _number(line, "end_time", where, minimum=0)
    return OcReport(
        t=end_time,
        inbound=classifier == "object_inbound",
        start_time=_number(line, "start_time", where, minimum=0),
        end_time=end_time,
        delta_time_msec=int(_number(line, "delta_time_msec", where, minimum=0)),
        max_speed_mps=_number(line, "max_speed_mps", where, minimum=0),
        min_speed_mps=_number(line, "min_speed_mps", where, minimum=0),
        max_magnitude=_number(line, "max_magnitude", where, minimum=0),
        avg_magnitude=_number(line, "avg_magnitude", where, minimum=0),
        total_frames=int(_number(line, "total_frames", where, minimum=0)),
        frames_per_mps=_number(line, "frames_per_mps", where, minimum=0),
        length_m=_number(line, "length_m", where, minimum=0),
        speed_change=_number(line, "speed_change", where),
    )


def _range_frame(line: dict[str, object], where: str, bin_size_m: float) -> RangeFrame:
    fft = line.get("FFT")
    if not isinstance(fft, list) or not fft:
        raise LogFormatError(f"{where}: FFT must be a non-empty list")
    bins = tuple(_as_number(v, "FFT", where, minimum=0) for v in cast(list[object], fft))
    return RangeFrame(_number(line, "time", where, minimum=0), bin_size_m, bins)


def _values(line: dict[str, object], name: str, where: str, minimum: float | None = None) -> list[float]:
    """One value, or a list of up to MAX_OBJECTS, strongest first."""
    raw = line.get(name)
    items = cast(list[object], raw) if isinstance(raw, list) else [raw]
    if not items or len(items) > MAX_OBJECTS:
        raise LogFormatError(f"{where}: {name} must have 1 to {MAX_OBJECTS} values")
    return [_as_number(v, name, where, minimum) for v in items]


def _magnitudes(line: dict[str, object], count: int, where: str) -> list[float]:
    if "magnitude" not in line:
        raise LogFormatError(f"{where}: missing magnitude (the node turns it on with OM and oM)")
    magnitudes = _values(line, "magnitude", where, minimum=0)
    if len(magnitudes) != count:
        raise LogFormatError(f"{where}: {count} values but {len(magnitudes)} magnitudes")
    return magnitudes


def _unit(line: dict[str, object], expected: str, where: str) -> None:
    unit = line.get("unit")
    if unit is not None and unit != expected:
        raise LogFormatError(f"{where}: unit must be {expected!r} (the node sets UM and uM), not {unit!r}")


def _number(line: dict[str, object], name: str, where: str, minimum: float | None = None) -> float:
    if name not in line:
        raise LogFormatError(f"{where}: missing {name}")
    return _as_number(line[name], name, where, minimum)


def _as_number(value: object, name: str, where: str, minimum: float | None = None) -> float:
    """In JSON mode the radar sends numbers as text ("0.06"); a recorder might not. Take both."""
    if isinstance(value, bool):  # JSON true and false load as bools, which Python counts as ints
        raise LogFormatError(f"{where}: {name} must be a number, not {value!r}")
    try:
        number = float(cast(str | float, value))
    except (TypeError, ValueError):
        raise LogFormatError(f"{where}: {name} must be a number, not {value!r}") from None
    if not math.isfinite(number):
        raise LogFormatError(f"{where}: {name} must be a finite number")
    if minimum is not None and number < minimum:
        raise LogFormatError(f"{where}: {name} is out of range ({number})")
    return number
