"""The start-up command (09 E7, Jira SCRUM-64): its exit codes, which the service's restart rule
depends on, waiting with calibrating heartbeats when there's no map, and a full replay run."""

import configparser
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from mavradar_edge.__main__ import main
from mavradar_edge.buffer.event_buffer import SqliteEventBuffer
from mavradar_edge.detector.background import BackgroundMap, MapStore
from mavradar_edge.radar.replay import ReplaySource
from tests.test_transport import KEY, Server

EDGE = Path(__file__).parents[1]
DATA = EDGE / "tests" / "data"


def env(tmp_path: Path, server_url: str = "http://127.0.0.1:9", log: str = "train_passing") -> dict[str, str]:
    return {
        "MAVRADAR_NODE_ID": "node-a",
        "MAVRADAR_NODE_CROSSING_ID": "794980D",
        "MAVRADAR_NODE_SERVER_URL": server_url,
        "MAVRADAR_NODE_KEY": KEY,
        "MAVRADAR_NODE_REPLAY_LOG": str(DATA / f"{log}.jsonl"),
        "MAVRADAR_NODE_REPLAY_SPEED": "0",
        "MAVRADAR_NODE_BUFFER_PATH": str(tmp_path / "events.db"),
        "MAVRADAR_NODE_MAP_DIR": str(tmp_path / "maps"),
    }


# Exit 2: not set up, so the service doesn't restart it


@pytest.mark.parametrize(
    "missing",
    ["MAVRADAR_NODE_ID", "MAVRADAR_NODE_SERVER_URL", "MAVRADAR_NODE_KEY", "MAVRADAR_NODE_REPLAY_LOG"],
)
def test_a_missing_setting_exits_2(tmp_path: Path, missing: str, caplog: pytest.LogCaptureFixture) -> None:
    settings = env(tmp_path)
    del settings[missing]

    assert main(settings) == 2
    assert "not set up" in caplog.text


def test_a_bad_setting_exits_2(tmp_path: Path) -> None:
    assert main({**env(tmp_path), "MAVRADAR_NODE_LOG_ONLY": "maybe"}) == 2


def test_the_service_doesnt_restart_on_2_and_waits_between_tries() -> None:
    unit = configparser.ConfigParser(strict=False, interpolation=None)
    unit.read(EDGE / "deploy" / "mavradar-edge.service")
    service = unit["Service"]

    assert service["ExecStart"].endswith("python -m mavradar_edge")
    assert service["Restart"] == "on-failure"
    assert service["RestartPreventExitStatus"] == "2"
    assert float(service["RestartSec"]) >= 5  # under systemd's start limit, 5 starts in 10 s


# Running


def test_a_replay_runs_to_the_end_and_exits_0(tmp_path: Path) -> None:
    MapStore(tmp_path / "maps").save(
        BackgroundMap.from_frames(
            list(ReplaySource(DATA / "empty_track.jsonl", speed=0).range_frames(1e9)), "m1"
        )
    )
    server = Server()
    try:
        code = main(env(tmp_path, server.url))
    finally:
        server.close()

    events = [body for path, _, _, body in server.requests if path == "/events"]
    left = SqliteEventBuffer(tmp_path / "events.db").count()
    assert code == 0  # a finished replay: the service leaves it stopped
    assert len(events) + left == 3  # the passing train's three events, sent or still buffered
    assert any(path == "/heartbeats" for path, _, _, _ in server.requests)
    assert all(isinstance(body, dict) and body["logOnly"] is True for body in events)  # log-only by default


def test_with_no_map_it_only_sends_calibrating_heartbeats(tmp_path: Path) -> None:
    server = Server()
    process = subprocess.Popen(
        [sys.executable, "-m", "mavradar_edge"],
        cwd=EDGE,
        env={**os.environ, **env(tmp_path, server.url)},
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        deadline = time.monotonic() + 20
        while not server.requests and time.monotonic() < deadline:
            time.sleep(0.05)
        time.sleep(0.3)  # long enough that a detecting node would have sent an event too
        assert process.poll() is None  # still running: waiting, not exiting
    finally:
        process.kill()
        _, stderr = process.communicate()
        server.close()

    path, key, _, body = server.requests[0]
    assert (path, key) == ("/heartbeats", KEY)
    assert isinstance(body, dict)
    assert (body["status"], body["state"], body["mapVersion"]) == ("calibrating", "sensorOffline", "none")
    assert all(path == "/heartbeats" for path, _, _, _ in server.requests)  # no detection, no events
    assert "no background map saved" in stderr
