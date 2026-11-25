"""Heartbeats (09 E4, Jira SCRUM-61): every field in the contract, sent on a fixed 30 second
schedule by their own messenger, and a failed one dropped, never buffered or retried."""

import json
import logging
import threading
import time
from collections.abc import Callable, Mapping
from datetime import timedelta
from pathlib import Path
from typing import cast

import pytest

from mavradar_edge.buffer.event_buffer import MemoryEventBuffer
from mavradar_edge.contract import HEARTBEAT_INTERVAL_S, Heartbeat, NodeStatus, ReportedState
from mavradar_edge.detector.background import BackgroundMap
from mavradar_edge.detector.detector import Detector, DetectorStatus
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.health.reporter import (
    HEARTBEATS_PATH,
    STUB_BATTERY_V,
    STUB_TEMP_C,
    HealthReporter,
    HeartbeatSender,
)
from mavradar_edge.node import run
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.radar.source import RangeFrame
from mavradar_edge.transport.transport import FakeTransport, Response
from mavradar_edge.uplink.uplink import Uplink
from tests.factories import START, event
from tests.test_contract import Json, is_valid

DATA = Path(__file__).parent / "data"
SCHEMA = Path(__file__).parents[2] / "contract" / "schemas" / "heartbeat.schema.json"
FRAMES = list(ReplaySource(DATA / "empty_track.jsonl", speed=0).range_frames(1e9))
MAP = BackgroundMap.from_frames(FRAMES, version="map-7")


def detector() -> Detector:
    return Detector(
        node_id="node-a",
        crossing_id="794980D",
        log_only=True,
        background=MAP,
        settings=DetectorSettings(),
        time_of=lambda t: START + timedelta(seconds=t),
    )


class Clock:
    """A clock the test moves by hand."""

    def __init__(self, t: float = 1000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


def reporter(
    d: Detector | None = None,
    buffer: MemoryEventBuffer | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> HealthReporter:
    return HealthReporter(
        node_id="node-a",
        log_only=True,
        detector=d or detector(),
        buffer=buffer if buffer is not None else MemoryEventBuffer(),
        clock=clock,
        now=lambda: START,
    )


def wait_until(condition: Callable[[], bool], seconds: float = 5) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.01)
    return False


# What's in a heartbeat


def test_a_heartbeat_has_every_field_and_passes_the_schema() -> None:
    body = reporter().build_heartbeat().to_dict()

    assert is_valid("heartbeat", cast(Json, json.loads(json.dumps(body))))  # as it goes on the wire
    schema = json.loads(SCHEMA.read_text())
    assert set(body) == set(schema["properties"])  # every field, the optional ones too


def test_what_the_heartbeat_reports() -> None:
    buffer = MemoryEventBuffer()
    buffer.store(event(0))
    buffer.store(event(1))
    clock = Clock()
    r = reporter(buffer=buffer, clock=clock)
    clock.t += 95.7

    hb = r.build_heartbeat()

    assert hb == Heartbeat(
        node_id="node-a",
        sent_at=START,
        status=NodeStatus.DETECTING,
        state=ReportedState.CLEAR,
        log_only=True,
        battery_voltage=STUB_BATTERY_V,
        enclosure_temp_c=STUB_TEMP_C,
        uptime_sec=95,  # whole seconds since the reporter started
        signal_dbm=None,
        software_version="0.1.0",
        map_version="map-7",
        buffered_events=2,  # events still waiting to be sent
    )


def test_the_stubs_are_impossible_values_and_say_so_in_the_log(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING):
        reporter()

    assert (STUB_BATTERY_V, STUB_TEMP_C) == (0.0, -999.0)  # the learner's choice B: obviously not real
    assert "stubbed" in caplog.text


def test_status_follows_the_detector() -> None:
    d = detector()
    d.on_reading(RangeFrame(100, 1.0, MAP.normal))
    assert d.current_status() == DetectorStatus(NodeStatus.DETECTING, ReportedState.CLEAR, "map-7")

    d.tick(200)  # the radar went silent

    assert d.current_status() == DetectorStatus(NodeStatus.FAULTED, ReportedState.SENSOR_OFFLINE, "map-7")


# Sending one


def test_a_sent_heartbeat() -> None:
    transport = FakeTransport([200])
    sender = HeartbeatSender(reporter(), transport)

    assert sender.send_once() is True
    [(path, body)] = transport.posts
    assert path == HEARTBEATS_PATH == "/heartbeats"
    assert body["nodeId"] == "node-a"


@pytest.mark.parametrize("status", [None, 503, 500, 404], ids=["no answer", "503", "500", "404"])
def test_a_failed_heartbeat_is_dropped(status: int | None, caplog: pytest.LogCaptureFixture) -> None:
    buffer = MemoryEventBuffer()
    transport = FakeTransport([status])
    sender = HeartbeatSender(reporter(buffer=buffer), transport)

    assert sender.send_once() is False
    assert len(transport.posts) == 1  # no retry
    assert buffer.count() == 0  # and nothing buffered
    assert "dropped" in caplog.text


def test_a_refused_key_is_an_error(caplog: pytest.LogCaptureFixture) -> None:
    sender = HeartbeatSender(reporter(), FakeTransport([401]))

    assert sender.send_once() is False
    assert any(r.levelno == logging.ERROR and "401" in r.getMessage() for r in caplog.records)


def test_after_a_failure_the_next_heartbeat_is_a_fresh_one() -> None:
    clock = Clock()
    transport = FakeTransport([None, 200])
    sender = HeartbeatSender(reporter(clock=clock), transport, clock=clock)

    sender.send_once()
    clock.t += HEARTBEAT_INTERVAL_S
    sender.send_once()

    assert [body["uptimeSec"] for _, body in transport.posts] == [0, 30]  # built anew, not resent


# The schedule


def test_every_30_seconds_on_a_fixed_schedule() -> None:
    clock = Clock(0)
    sender = HeartbeatSender(reporter(), FakeTransport(), clock=clock)
    assert HEARTBEAT_INTERVAL_S == 30

    clock.t = 4  # the beat due at 0 took 4 s to send
    assert sender.next_due(0) == 30  # the next one is still due at 30, not 34

    clock.t = 30.5
    assert sender.next_due(30) == 60


def test_after_a_long_stall_it_goes_right_away_once() -> None:
    clock = Clock(0)
    sender = HeartbeatSender(reporter(), FakeTransport(), clock=clock)

    clock.t = 75  # stuck for more than two intervals
    assert sender.next_due(0) == 75  # one heartbeat now, not three in a burst


def test_the_loop_sends_at_start_and_keeps_going() -> None:
    transport = FakeTransport()
    sender = HeartbeatSender(reporter(), transport, interval_s=0.05)
    thread = threading.Thread(target=sender.run_forever, daemon=True)
    thread.start()

    assert wait_until(lambda: len(transport.posts) >= 3)
    sender.stop()
    thread.join(timeout=2)
    assert not thread.is_alive()


def test_a_failure_doesnt_stop_the_loop() -> None:
    transport = FakeTransport([None, None])
    sender = HeartbeatSender(reporter(), transport, interval_s=0.05)
    thread = threading.Thread(target=sender.run_forever, daemon=True)
    thread.start()

    assert wait_until(lambda: len(transport.posts) >= 3)
    sender.stop()
    thread.join(timeout=2)


def test_stop_ends_the_wait() -> None:
    sender = HeartbeatSender(reporter(), FakeTransport(), interval_s=60)
    thread = threading.Thread(target=sender.run_forever, daemon=True)
    thread.start()

    sender.stop()
    thread.join(timeout=2)

    assert not thread.is_alive()


# Beside the uplink


class EventsHang:
    """One transport for both messengers, like the node: posts to /events hang until released,
    heartbeats are answered at once."""

    def __init__(self) -> None:
        self.release = threading.Event()
        self.heartbeats: list[Mapping[str, object]] = []
        self.event_posts = 0

    def post(self, path: str, body: Mapping[str, object]) -> Response:
        if path == HEARTBEATS_PATH:
            self.heartbeats.append(body)
            return Response(200)
        self.event_posts += 1
        self.release.wait()
        return Response(200)


def test_a_hung_event_send_doesnt_hold_up_heartbeats() -> None:
    buffer = MemoryEventBuffer()
    buffer.store(event())
    transport = EventsHang()
    uplink = Uplink(buffer, transport)
    sender = HeartbeatSender(reporter(buffer=buffer), transport, interval_s=0.05)
    threads = [threading.Thread(target=t, daemon=True) for t in (uplink.run_forever, sender.run_forever)]
    for thread in threads:
        thread.start()

    assert wait_until(lambda: transport.event_posts == 1)  # the uplink is stuck on its send
    count = len(transport.heartbeats)
    assert wait_until(lambda: len(transport.heartbeats) >= count + 3)  # heartbeats keep coming
    assert transport.heartbeats[-1]["bufferedEvents"] == 1  # and say an event is waiting

    transport.release.set()
    assert wait_until(lambda: buffer.count() == 0)
    uplink.stop()
    sender.stop()
    for thread in threads:
        thread.join(timeout=2)


def test_run_starts_and_stops_the_heartbeats() -> None:
    buffer, transport = MemoryEventBuffer(), FakeTransport()
    d = detector()
    sender = HeartbeatSender(reporter(d, buffer), transport, interval_s=0.05)

    run(ReplaySource(DATA / "train_passing.jsonl", speed=0.0), d, buffer, Uplink(buffer, transport), sender)

    assert "heartbeats" not in {t.name for t in threading.enumerate()}
    assert {path for path, _ in transport.posts} <= {"/events", HEARTBEATS_PATH}
