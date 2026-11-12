"""The two loops together: detection stores events while the uplink sends them, and a link that
hangs never holds detection up (09 E3 done-when)."""

import threading
import time
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

from mavradar_edge.buffer.event_buffer import MemoryEventBuffer, SqliteEventBuffer
from mavradar_edge.detector.background import BackgroundMap
from mavradar_edge.detector.detector import Detector
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.node import run, run_detection
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.transport.transport import FakeTransport
from mavradar_edge.uplink.uplink import Uplink
from tests.factories import START, drain

DATA = Path(__file__).parent / "data"
MAP = BackgroundMap.from_frames(list(ReplaySource(DATA / "empty_track.jsonl", speed=0).range_frames(1e9)))
STATES = ["approaching", "blocked", "clear"]  # what the passing train produces (E2)


def detector() -> Detector:
    return Detector(
        node_id="node-a",
        crossing_id="794980D",
        log_only=True,
        background=MAP,
        settings=DetectorSettings(),
        time_of=lambda t: START + timedelta(seconds=t),
    )


def train() -> ReplaySource:
    return ReplaySource(DATA / "train_passing.jsonl", speed=0)


def wait_until(condition: Callable[[], bool], seconds: float = 5) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.01)
    return False


def test_detection_stores_each_event_before_anything_is_sent() -> None:
    buffer = MemoryEventBuffer()
    stored: list[int] = []

    run_detection(train(), detector(), buffer, on_stored=lambda: stored.append(buffer.count()))

    assert stored == [1, 2, 3]  # already in the buffer each time the uplink is told


def test_a_link_that_hangs_never_blocks_detection(tmp_path: Path) -> None:
    buffer = SqliteEventBuffer(tmp_path / "events.db")
    transport = FakeTransport()
    transport.gate.clear()  # every send hangs, like a dead link
    uplink = Uplink(buffer, transport)
    thread = threading.Thread(target=uplink.run_forever, daemon=True)
    thread.start()

    started = time.monotonic()
    run_detection(train(), detector(), buffer, uplink.notify)  # the whole train, start to finish
    took = time.monotonic() - started

    assert wait_until(lambda: len(transport.posts) == 1)  # the uplink is stuck on its first send
    assert buffer.count() == 3  # and detection still saw and stored the whole train
    assert took < 5

    transport.gate.set()  # the link comes back
    assert wait_until(lambda: buffer.count() == 0)
    uplink.stop()
    thread.join(timeout=2)
    assert [body["toState"] for _, body in transport.posts] == STATES  # in order, each once


def test_run_delivers_what_it_can_and_keeps_the_rest() -> None:
    buffer, transport = MemoryEventBuffer(), FakeTransport()

    run(train(), detector(), buffer, Uplink(buffer, transport))

    delivered = [str(body["eventId"]) for _, body in transport.posts]
    left = drain(buffer)
    assert len(set(delivered)) == len(delivered)  # nothing sent twice
    assert len(delivered) + len(left) == 3  # nothing lost
    assert [body["toState"] for _, body in transport.posts] == STATES[: len(delivered)]


def test_a_server_that_is_down_leaves_everything_in_the_buffer() -> None:
    buffer, transport = MemoryEventBuffer(), FakeTransport([None] * 50)

    run(train(), detector(), buffer, Uplink(buffer, transport))

    assert buffer.count() == 3
