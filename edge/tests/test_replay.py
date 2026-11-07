"""ReplaySource: parsing the recorded-log format (tests/data/README.md) and playing it on time.

Timing tests pass a fake sleep that records each wait instead of waiting, so a 3-minute log plays
in milliseconds and the test still sees exactly how long the replay would have waited.
"""

import json
from pathlib import Path

import pytest

from mavradar_edge.contract import Direction
from mavradar_edge.radar.replay import LogFormatError, ReplaySource
from mavradar_edge.radar.source import Detection, RadarSource, RangeFrame

DATA = Path(__file__).parent / "data"
LOGS = ["train_passing", "train_stopping", "truck", "empty_track"]


def detection(t: float, **change: object) -> str:
    line: dict[str, object] = {
        "t": t,
        "type": "detection",
        "speedMps": 11.0,
        "direction": "toward",
        "rangeM": 80.0,
        "strength": 0.9,
    }
    return json.dumps(line | change)


def frame(t: float, **change: object) -> str:
    return json.dumps({"t": t, "type": "range", "binSizeM": 1.0, "bins": [0.1, 0.9]} | change)


def write(tmp_path: Path, *lines: str) -> Path:
    path = tmp_path / "log.jsonl"
    path.write_text("\n".join(lines) + "\n")
    return path


# Parsing


def test_reads_detections_and_range_frames(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        '{"type": "header", "recordedAt": "2026-11-05T14:00:00Z", "source": "ops243"}',
        detection(0.0),
        frame(0.5),
        "",
        detection(1.0, rangeM=None),
    )
    replay = ReplaySource(path, speed=0)

    assert replay.recorded_at == "2026-11-05T14:00:00Z"
    assert list(replay.detections()) == [
        Detection(0.0, 11.0, Direction.TOWARD, 80.0, 0.9),
        Detection(1.0, 11.0, Direction.TOWARD, None, 0.9),
    ]
    assert list(replay.range_frames(10)) == [RangeFrame(0.5, 1.0, (0.1, 0.9))]


@pytest.mark.parametrize(
    ("line", "message"),
    [
        ("{not json", "line 2: not JSON"),
        ("[1, 2]", "line 2: each line must be a JSON object"),
        (detection(1, type="sonar"), "line 2: unknown type 'sonar'"),
        (detection(1, direction="sideways"), "line 2: direction must be toward or away"),
        (json.dumps({"type": "detection", "speedMps": 1}), "line 2: missing t"),
        (detection(1, speedMps="fast"), "line 2: speedMps must be a number"),
        (detection(1, strength=True), "line 2: strength must be a number"),
        (detection(1, strength=1.5), "line 2: strength is out of range"),
        (detection(1, speedMps=-3), "line 2: speedMps is out of range"),
        (frame(1, bins=[]), "line 2: bins must be a non-empty list"),
        (frame(1, bins=[0.1, 2]), "line 2: every bin must be a number from 0 to 1"),
        (detection(0.5), "line 2: t goes backwards"),
        ('{"type": "header"}', "line 2: the header can only be the first line"),
    ],
)
def test_a_bad_line_fails_at_load_with_its_line_number(tmp_path: Path, line: str, message: str) -> None:
    path = write(tmp_path, detection(1.0), line)

    with pytest.raises(LogFormatError, match=message):
        ReplaySource(path)


def test_the_same_time_twice_is_allowed(tmp_path: Path) -> None:
    replay = ReplaySource(write(tmp_path, detection(1.0), frame(1.0), detection(1.0)), speed=0)

    assert len(list(replay.detections())) == 2


# Timing


def test_real_speed_waits_the_recorded_gaps(tmp_path: Path) -> None:
    waits: list[float] = []
    replay = ReplaySource(write(tmp_path, detection(0), detection(0.2), detection(1.2)), sleep=waits.append)

    list(replay.detections())

    assert waits == pytest.approx([0.2, 1.0])  # nothing before the first reading


def test_ten_times_faster_waits_a_tenth(tmp_path: Path) -> None:
    waits: list[float] = []
    replay = ReplaySource(
        write(tmp_path, detection(0), detection(0.2), detection(1.2)), speed=10, sleep=waits.append
    )

    list(replay.detections())

    assert waits == pytest.approx([0.02, 0.1])


def test_speed_zero_never_waits(tmp_path: Path) -> None:
    waits: list[float] = []

    list(ReplaySource(write(tmp_path, detection(0), detection(5)), speed=0, sleep=waits.append).detections())

    assert waits == []


def test_readings_arrive_one_wait_at_a_time(tmp_path: Path) -> None:
    # Each reading is handed over right after its own wait, not all at the end.
    seen: list[str] = []
    replay = ReplaySource(
        write(tmp_path, detection(0), detection(1)), sleep=lambda s: seen.append(f"wait {s}")
    )

    for reading in replay.detections():
        seen.append(f"reading {reading.t}")

    assert seen == ["reading 0.0", "wait 1.0", "reading 1.0"]


def test_detections_skip_range_frames_in_the_timing(tmp_path: Path) -> None:
    waits: list[float] = []
    replay = ReplaySource(write(tmp_path, detection(0), frame(0.5), detection(2)), sleep=waits.append)

    list(replay.detections())

    assert waits == pytest.approx([2.0])


def test_range_frames_cover_the_asked_seconds(tmp_path: Path) -> None:
    replay = ReplaySource(write(tmp_path, frame(3), frame(5), frame(7), frame(9)), speed=0)

    assert [f.t for f in replay.range_frames(5)] == [3, 5, 7]  # from 3 s, for 5 s


def test_negative_speed_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        ReplaySource(write(tmp_path, detection(0)), speed=-1)


# The synthetic logs


@pytest.mark.parametrize("name", LOGS)
def test_each_synthetic_log_loads_and_plays(name: str) -> None:
    replay = ReplaySource(DATA / f"{name}.jsonl", speed=0)

    detections = list(replay.detections())
    frames = list(replay.range_frames(1e9))

    assert frames, "every log has range frames for the background"
    assert [d.t for d in detections] == sorted(d.t for d in detections)


def test_the_stopped_train_has_no_detections_but_still_fills_the_track_band() -> None:
    replay = ReplaySource(DATA / "train_stopping.jsonl", speed=0)
    times = [d.t for d in replay.detections()]
    longest_gap = max(b - a for a, b in zip(times, times[1:], strict=False))

    assert longest_gap > 150  # stopped: nothing moves, so the radar reports no Doppler readings
    quiet = [f for f in replay.range_frames(1e9) if times[0] < f.t and f.t - times[0] > 60 and f.t < 200]
    assert all(max(f.bins[18:23]) > 0.7 for f in quiet)


def test_the_truck_is_short() -> None:
    times = [d.t for d in ReplaySource(DATA / "truck.jsonl", speed=0).detections()]

    assert times[-1] - times[0] < 5


def test_a_log_plays_through_the_radar_source_protocol() -> None:
    source: RadarSource = ReplaySource(DATA / "truck.jsonl", speed=0)

    assert next(iter(source.detections())).strength > 0.5
