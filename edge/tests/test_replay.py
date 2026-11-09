"""ReplaySource: parsing the radar's JSON-mode lines (tests/data/README.md) and playing them on time.

Timing tests pass a fake sleep that records each wait instead of waiting, so a 5-minute log plays
in milliseconds and the test still sees exactly how long the replay would have waited.
"""

import json
from pathlib import Path

import pytest

from mavradar_edge.contract import Direction
from mavradar_edge.radar.replay import LogFormatError, ReplaySource
from mavradar_edge.radar.source import (
    Distance,
    OcReport,
    RadarSource,
    RangeFrame,
    RangeReport,
    Speed,
    SpeedReport,
)

DATA = Path(__file__).parent / "data"
LOGS = ["train_passing", "train_stopping", "truck", "empty_track"]
OC = {
    "classifier": "object_outbound",
    "start_time": "120.000",
    "end_time": "121.600",
    "delta_time_msec": 1600,
    "max_speed_mps": 13.3,
    "min_speed_mps": 12.7,
    "max_magnitude": 91,
    "avg_magnitude": 70,
    "total_frames": 8,
    "frames_per_mps": 0.6015,
    "length_m": 21.3,
    "speed_change": 0.045,
}


def speed(t: float, **change: object) -> str:
    return json.dumps({"time": f"{t:.3f}", "unit": "mps", "magnitude": "95.2", "speed": "11.2"} | change)


def ranges(t: float, **change: object) -> str:
    return json.dumps(
        {"time": f"{t:.3f}", "unit": "m", "magnitude": ["90", "40"], "range": ["20.5", "8"]} | change
    )


def fft(t: float, **change: object) -> str:
    return json.dumps({"time": f"{t:.3f}", "FFT": [5.5, 90.0]} | change)


def oc(**change: object) -> str:
    return json.dumps(OC | change)


def write(tmp_path: Path, *lines: str) -> Path:
    path = tmp_path / "log.jsonl"
    path.write_text("\n".join(lines) + "\n")
    return path


# Parsing


def test_reads_every_line_type_as_the_radar_prints_it(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        '{"recordedAt": "2026-11-05T14:00:00Z", "source": "ops243"}',
        speed(120.0),
        ranges(120.1),
        fft(120.5),
        "",
        oc(end_time="121.600"),
    )
    replay = ReplaySource(path, speed=0, range_bin_m=0.5)

    assert replay.recorded_at == "2026-11-05T14:00:00Z"
    assert list(replay.readings()) == [
        SpeedReport(120.0, (Speed(11.2, 95.2),)),
        RangeReport(120.1, (Distance(20.5, 90), Distance(8, 40))),
        RangeFrame(120.5, 0.5, (5.5, 90.0)),
        OcReport(121.6, False, 120.0, 121.6, 1600, 13.3, 12.7, 91, 70, 8, 0.6015, 21.3, 0.045),
    ]


def test_several_objects_strongest_first(tmp_path: Path) -> None:
    line = speed(1, magnitude=["95.2", "40.1", "22"], speed=["-11.13", "6.02", "1.5"])

    report = next(iter(ReplaySource(write(tmp_path, line), speed=0).readings()))

    assert isinstance(report, SpeedReport)
    assert [o.mps for o in report.objects] == [-11.13, 6.02, 1.5]


def test_positive_speed_is_toward_the_radar() -> None:
    assert Speed(5.58, 72.8).direction is Direction.TOWARD
    assert Speed(-1.27, 326.8).direction is Direction.AWAY


def test_plain_numbers_are_accepted_too(tmp_path: Path) -> None:
    line = json.dumps({"time": 3.5, "magnitude": 90, "speed": 11})

    assert next(iter(ReplaySource(write(tmp_path, line), speed=0).readings())) == SpeedReport(
        3.5, (Speed(11, 90),)
    )


def test_unknown_fields_are_ignored(tmp_path: Path) -> None:
    # A newer firmware adding a field mustn't break the replay.
    assert len(list(ReplaySource(write(tmp_path, speed(1, direction="inbound")), speed=0).readings())) == 1


def test_an_oc_report_printed_a_little_late_keeps_its_place(tmp_path: Path) -> None:
    readings = list(ReplaySource(write(tmp_path, speed(122.0), oc(end_time="121.600")), speed=0).readings())

    assert [r.t for r in readings] == [122.0, 122.0]
    assert isinstance(readings[1], OcReport) and readings[1].end_time == 121.6


@pytest.mark.parametrize(
    ("line", "message"),
    [
        ("{not json", "line 2: not JSON"),
        ("[1, 2]", "line 2: each line must be a JSON object"),
        (json.dumps({"time": "5", "temperature": "20"}), "line 2: not a speed, range, FFT or OC line"),
        (json.dumps({"magnitude": "9", "speed": "1"}), "line 2: missing time"),
        (speed(5, speed="fast"), "line 2: speed must be a number"),
        (speed(5, speed=True), "line 2: speed must be a number"),
        (json.dumps({"time": "5", "speed": "1"}), "line 2: missing magnitude"),
        (speed(5, magnitude=["9", "8"]), "line 2: 1 values but 2 magnitudes"),
        (speed(5, speed=[]), "line 2: speed must have 1 to 16 values"),
        (speed(5, unit="mph"), "line 2: unit must be 'mps'"),
        (ranges(5, range=["-1", "8"]), "line 2: range is out of range"),
        (fft(5, FFT=[]), "line 2: FFT must be a non-empty list"),
        (oc(classifier="car"), "line 2: classifier must be object_inbound or object_outbound"),
        (oc(length_m="long"), "line 2: length_m must be a number"),
        (speed(0.5), "line 2: time goes backwards"),
        ('{"recordedAt": null}', "line 2: the recordedAt line can only be the first line"),
    ],
)
def test_a_bad_line_fails_at_load_with_its_line_number(tmp_path: Path, line: str, message: str) -> None:
    with pytest.raises(LogFormatError, match=message):
        ReplaySource(write(tmp_path, speed(1.0), line))


# Timing


def test_real_speed_waits_the_recorded_gaps(tmp_path: Path) -> None:
    waits: list[float] = []
    replay = ReplaySource(write(tmp_path, speed(100), ranges(100.2), speed(101.2)), sleep=waits.append)

    list(replay.readings())

    assert waits == pytest.approx([0.2, 1.0])  # nothing before the first reading


def test_ten_times_faster_waits_a_tenth(tmp_path: Path) -> None:
    waits: list[float] = []
    replay = ReplaySource(
        write(tmp_path, speed(100), speed(100.2), speed(101.2)), speed=10, sleep=waits.append
    )

    list(replay.readings())

    assert waits == pytest.approx([0.02, 0.1])


def test_speed_zero_never_waits(tmp_path: Path) -> None:
    waits: list[float] = []

    list(ReplaySource(write(tmp_path, speed(0), speed(5)), speed=0, sleep=waits.append).readings())

    assert waits == []


def test_readings_arrive_one_wait_at_a_time(tmp_path: Path) -> None:
    seen: list[str] = []
    replay = ReplaySource(write(tmp_path, speed(0), speed(1)), sleep=lambda s: seen.append(f"wait {s}"))

    for reading in replay.readings():
        seen.append(f"reading {reading.t}")

    assert seen == ["reading 0.0", "wait 1.0", "reading 1.0"]


def test_range_frames_cover_the_asked_seconds(tmp_path: Path) -> None:
    replay = ReplaySource(write(tmp_path, fft(3), speed(4), fft(5), fft(7), fft(9)), speed=0)

    assert [f.t for f in replay.range_frames(5)] == [3, 5, 7]  # from 3 s, for 5 s, frames only


def test_negative_speed_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        ReplaySource(write(tmp_path, speed(0)), speed=-1)


# The synthetic logs


def kinds(name: str) -> dict[type, int]:
    counts: dict[type, int] = {}
    for reading in ReplaySource(DATA / f"{name}.jsonl", speed=0).readings():
        counts[type(reading)] = counts.get(type(reading), 0) + 1
    return counts


@pytest.mark.parametrize("name", LOGS)
def test_each_synthetic_log_loads_in_time_order(name: str) -> None:
    times = [r.t for r in ReplaySource(DATA / f"{name}.jsonl", speed=0).readings()]

    assert times == sorted(times)
    assert {RangeReport, RangeFrame} <= set(kinds(name))  # every log has background


def test_one_long_oc_report_for_the_passing_train_and_two_for_the_stopping_one() -> None:
    # A long train may give one OC report or several; the logs cover both.
    assert kinds("train_passing")[OcReport] == 1
    assert kinds("train_stopping")[OcReport] == 2


def test_the_stopped_train_gives_no_speed_reports_but_range_still_sees_it() -> None:
    readings = list(ReplaySource(DATA / "train_stopping.jsonl", speed=0).readings())
    speed_times = [r.t for r in readings if isinstance(r, SpeedReport)]
    gaps = list(zip(speed_times, speed_times[1:], strict=False))
    start, end = max(gaps, key=lambda g: g[1] - g[0])

    assert end - start > 150  # stopped: nothing moves
    during = [r for r in readings if isinstance(r, RangeReport) and start + 5 < r.t < end - 5]
    assert during and all(any(18 <= o.m <= 23 for o in r.objects) for r in during)


def test_a_log_plays_through_the_radar_source_protocol() -> None:
    source: RadarSource = ReplaySource(DATA / "truck.jsonl", speed=0)

    assert any(isinstance(r, OcReport) for r in source.readings())
