"""Calibration (09 E5, Jira SCRUM-62, UC9): a clean capture, one with movement, too few frames, a
reject, a restart mid-calibration, the warning for a train parked through the whole capture, and
the calibrate command itself. The saved map never changes until the maintainer confirms."""

import os
import signal
import subprocess
import sys
import time
from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest

import mavradar_edge.calibrate
from mavradar_edge.calibrate import main
from mavradar_edge.calibration.calibrator import (
    CalibrationSummary,
    Calibrator,
    describe,
    looks_occupied,
    moved,
)
from mavradar_edge.contract import NodeStatus, ReportedState
from mavradar_edge.detector.background import BackgroundMap, MapStore
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.radar.source import RangeFrame, Reading
from tests.test_transport import KEY, Server

DATA = Path(__file__).parent / "data"
S = DetectorSettings()
EMPTY = list(ReplaySource(DATA / "empty_track.jsonl", speed=0).range_frames(1e9))
NOW = datetime(2026, 11, 25, 16, 4, 5, tzinfo=UTC)
TRACK = range(18, 23)  # the 1 m bands inside 18 to 23 m


def parked(frames: list[RangeFrame]) -> list[RangeFrame]:
    """The empty-track frames with a train stopped across the track the whole time."""
    return [replace(f, bins=tuple(88.0 if i in TRACK else v for i, v in enumerate(f.bins))) for f in frames]


class Frames:
    """A radar source that gives these range frames."""

    def __init__(self, frames: list[RangeFrame]) -> None:
        self._frames = frames

    def readings(self) -> Iterator[Reading]:
        return iter(self._frames)

    def range_frames(self, seconds: float) -> Iterator[RangeFrame]:
        return iter(self._frames)


def calibrator(
    store: MapStore, log: str = "empty_track", seconds: float = 1e9
) -> tuple[Calibrator, CalibrationSummary]:
    c = Calibrator(ReplaySource(DATA / f"{log}.jsonl", speed=0), store, S, now=lambda: NOW)
    return c, c.start(seconds)


@pytest.fixture
def store(tmp_path: Path) -> MapStore:
    return MapStore(tmp_path / "maps")


@pytest.fixture
def saved(store: MapStore) -> BackgroundMap:
    """A map already saved from an earlier calibration."""
    old = BackgroundMap.from_frames(EMPTY, version="old")
    store.save(old)
    return old


# The capture


def test_a_clean_capture_saves_on_confirm(store: MapStore) -> None:
    c, summary = calibrator(store)

    assert summary.problem is None and summary.frames == len(EMPTY)
    assert store.load() is None  # nothing saved yet
    saved = c.confirm()

    assert saved.version == "2026-11-25T16:04:05Z"
    assert store.load() == saved == BackgroundMap.from_frames(EMPTY, version=saved.version)


def test_a_capture_with_movement_is_thrown_out(store: MapStore, saved: BackgroundMap) -> None:
    c, summary = calibrator(store, "train_passing")

    assert summary.candidate is None and summary.problem == "something moved in the track band"
    with pytest.raises(RuntimeError):
        c.confirm()
    assert store.load() == saved  # the old map is kept


def test_a_train_that_sat_through_most_of_it_and_left_is_movement() -> None:
    # The train is the median, so the empty frames at the end are what stands out: below it.
    frames = parked(EMPTY[:40]) + EMPTY[40:]
    candidate = BackgroundMap.from_frames(frames)

    assert candidate.normal[20] == 88.0
    assert moved(frames, candidate, S)


def test_too_few_frames_are_thrown_out(store: MapStore, saved: BackgroundMap) -> None:
    _, summary = calibrator(store, seconds=20)  # about 10 frames: the radar dropped out

    assert summary.candidate is None and summary.problem is not None and "too few" in summary.problem
    assert store.load() == saved


def test_a_reject_keeps_the_saved_map(store: MapStore, saved: BackgroundMap) -> None:
    c, _ = calibrator(store)

    c.reject()

    assert store.load() == saved
    with pytest.raises(RuntimeError):
        c.confirm()


def test_a_restart_mid_calibration_comes_back_with_the_saved_map(
    store: MapStore, saved: BackgroundMap, tmp_path: Path
) -> None:
    calibrator(store)  # captured, never confirmed: the node reboots here

    assert MapStore(tmp_path / "maps").load() == saved  # what the node loads when it starts again


def test_a_new_map_keeps_the_previous_one(store: MapStore, saved: BackgroundMap) -> None:
    c, _ = calibrator(store)

    new = c.confirm()

    assert store.load() == new
    assert store.load_previous() == saved


def test_a_save_cut_short_leaves_a_whole_map(store: MapStore, saved: BackgroundMap, tmp_path: Path) -> None:
    # A reboot before the rename leaves a half-written temporary file and the old current map.
    (tmp_path / "maps" / "current.tmp").write_text('{"version": "new", "bin')

    assert store.load() == saved


# The warning for a train parked through the whole capture (the learner's choice B)


def test_a_train_parked_the_whole_time_warns_but_can_still_be_saved(
    store: MapStore, saved: BackgroundMap
) -> None:
    frames = parked(EMPTY)
    c = Calibrator(Frames(frames), store, S, now=lambda: NOW)

    summary = c.start(1e9)

    assert summary.problem is None  # nothing moved, so the movement check can't catch it
    assert summary.looks_occupied
    assert "WARNING" in describe(summary, S)
    c.confirm()  # the maintainer decides: a new fence would look the same
    assert store.load_previous() == saved


def test_no_warning_for_the_same_empty_scene(saved: BackgroundMap) -> None:
    assert not looks_occupied(BackgroundMap.from_frames(EMPTY), saved, S)


def test_the_first_calibration_says_to_check_the_track(store: MapStore) -> None:
    _, summary = calibrator(store)

    text = describe(summary, S)

    assert not summary.looks_occupied
    assert "No current map to compare. Check the track is empty" in text


def test_the_summary_shows_the_track_bands_next_to_the_current_map(
    store: MapStore, saved: BackgroundMap
) -> None:
    _, summary = calibrator(store)

    text = describe(summary, S)

    assert "Compared with the current map (old)" in text
    assert all(f"{i}-{i + 1} m" in text for i in TRACK)


def test_a_thrown_out_capture_says_why() -> None:
    summary = CalibrationSummary(5, None, None, "too few range frames (5, needs 30)")

    assert describe(summary, S).startswith("Capture thrown out: too few range frames")


def test_heartbeats_say_calibrating_and_the_crossing_unknown(store: MapStore, saved: BackgroundMap) -> None:
    c = Calibrator(Frames(EMPTY), store, S)

    status = c.current_status()

    assert (status.status, status.state, status.map_version) == (
        NodeStatus.CALIBRATING,
        ReportedState.SENSOR_OFFLINE,
        "old",
    )


# The command


@pytest.fixture(autouse=True)
def service(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Never touches a real service, even on the Pi: records what calibrate asks systemctl to do."""
    calls: list[str] = []

    def fake(action: str) -> bool:
        calls.append(action)
        return True

    monkeypatch.setattr(mavradar_edge.calibrate, "systemctl", fake)
    return calls


def env(tmp_path: Path, log: str = "empty_track") -> dict[str, str]:
    return {
        "MAVRADAR_NODE_ID": "node-a",
        "MAVRADAR_NODE_CROSSING_ID": "794980D",
        "MAVRADAR_NODE_REPLAY_LOG": str(DATA / f"{log}.jsonl"),
        "MAVRADAR_NODE_REPLAY_SPEED": "0",
        "MAVRADAR_NODE_MAP_DIR": str(tmp_path / "maps"),
    }


def test_the_command_saves_on_yes(tmp_path: Path) -> None:
    printed: list[str] = []

    code = main(["--seconds", "1000"], env(tmp_path), ask=lambda _: "y", out=printed.append)

    assert code == 0
    assert MapStore(tmp_path / "maps").load() is not None
    assert printed[-1].startswith("Saved map")


@pytest.mark.parametrize("answer", ["n", "", "yes please"])
def test_the_command_saves_only_on_y(tmp_path: Path, answer: str) -> None:
    code = main(["--seconds", "1000"], env(tmp_path), ask=lambda _: answer, out=lambda _: None)

    assert code == 0
    assert MapStore(tmp_path / "maps").load() is None


def test_the_command_reports_a_thrown_out_capture(tmp_path: Path) -> None:
    def never(_: str) -> str:
        raise AssertionError("asked to save a thrown-out capture")

    assert main(["--seconds", "1000"], env(tmp_path, "train_passing"), ask=never, out=lambda _: None) == 1


def test_the_command_needs_a_radar(tmp_path: Path) -> None:
    printed: list[str] = []
    settings = env(tmp_path)
    del settings["MAVRADAR_NODE_REPLAY_LOG"]

    assert main([], settings, out=printed.append) == 2
    assert "E6" in printed[0]


def test_the_command_sends_heartbeats_that_say_calibrating(tmp_path: Path) -> None:
    server = Server()
    settings = {**env(tmp_path), "MAVRADAR_NODE_SERVER_URL": server.url, "MAVRADAR_NODE_KEY": KEY}
    settings["MAVRADAR_NODE_BUFFER_PATH"] = str(tmp_path / "events.db")

    def answer_after_a_heartbeat(_: str) -> str:
        deadline = time.monotonic() + 5
        while not server.requests and time.monotonic() < deadline:
            time.sleep(0.01)
        return "n"

    try:
        main(["--seconds", "1000"], settings, ask=answer_after_a_heartbeat, out=lambda _: None)
    finally:
        server.close()
    path, key, _, body = server.requests[0]
    assert (path, key) == ("/heartbeats", KEY)
    assert isinstance(body, dict)
    assert (body["status"], body["state"]) == ("calibrating", "sensorOffline")


@pytest.mark.parametrize(
    ("log", "answer"), [("empty_track", "y"), ("empty_track", "n"), ("train_passing", "")]
)
def test_the_service_is_stopped_first_and_started_again(
    tmp_path: Path, service: list[str], log: str, answer: str
) -> None:
    main(["--seconds", "1000"], env(tmp_path, log), ask=lambda _: answer, out=lambda _: None)

    assert service == ["stop", "start"]  # saved, rejected, or thrown out


def test_ctrl_c_still_starts_the_service_again(tmp_path: Path, service: list[str]) -> None:
    def interrupted(_: str) -> str:
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        main(["--seconds", "1000"], env(tmp_path), ask=interrupted, out=lambda _: None)
    assert service == ["stop", "start"]


def test_a_failed_start_says_how_to_start_it(tmp_path: Path) -> None:
    printed: list[str] = []

    main(["--seconds", "1000"], env(tmp_path), ask=lambda _: "n", out=printed.append, service=lambda _: False)

    assert printed[-1].endswith("systemctl --user start mavradar-edge")


def test_ctrl_c_at_the_prompt_saves_nothing(tmp_path: Path) -> None:
    def interrupted(_: str) -> str:
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        main(["--seconds", "1000"], env(tmp_path), ask=interrupted, out=lambda _: None)
    assert MapStore(tmp_path / "maps").load() is None


def test_a_dropped_ssh_session_runs_the_cleanup(tmp_path: Path) -> None:
    # SIGHUP would end Python without its finally blocks; the command turns it into an exit that
    # runs them (where E7 starts the service again). 128 + 1 means our handler ran, -1 that it didn't.
    process = subprocess.Popen(
        [sys.executable, "-m", "mavradar_edge.calibrate", "--seconds", "1000"],
        cwd=Path(__file__).parents[1],
        env={**os.environ, **env(tmp_path), "PATH": ""},  # no systemctl: never the real service
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert process.stdout is not None
        deadline = time.monotonic() + 20
        while "Compared" not in (line := process.stdout.readline()) and "No current map" not in line:
            assert line and time.monotonic() < deadline, "never got to the prompt"
        process.send_signal(signal.SIGHUP)
        assert process.wait(timeout=10) == 128 + signal.SIGHUP
    finally:
        process.kill()
    assert MapStore(tmp_path / "maps").load() is None
