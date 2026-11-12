"""The event buffer: both versions behave the same, and the SQLite one keeps its events across a
restart, across threads, and when the process is killed in the middle of a send."""

import json
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from mavradar_edge.buffer.event_buffer import EventBuffer, MemoryEventBuffer, SqliteEventBuffer
from mavradar_edge.transport.transport import FakeTransport
from mavradar_edge.uplink.uplink import Outcome, Uplink
from tests.factories import drain, event


@pytest.fixture(params=["memory", "sqlite"])
def buffer(request: pytest.FixtureRequest, tmp_path: Path) -> EventBuffer:
    return MemoryEventBuffer() if request.param == "memory" else SqliteEventBuffer(tmp_path / "events.db")


# Both versions


def test_empty_at_first(buffer: EventBuffer) -> None:
    assert buffer.oldest_pending() is None
    assert buffer.count() == 0


def test_the_oldest_comes_out_first(buffer: EventBuffer) -> None:
    first, second, third = event(0), event(1), event(2)
    for e in (first, second, third):
        buffer.store(e)

    assert buffer.count() == 3
    assert drain(buffer) == [first.event_id, second.event_id, third.event_id]


def test_the_body_is_the_event_as_it_will_be_sent(buffer: EventBuffer) -> None:
    e = event()
    buffer.store(e)

    pending = buffer.oldest_pending()
    assert pending is not None and pending.body == e.to_dict()


def test_looking_doesnt_remove(buffer: EventBuffer) -> None:
    buffer.store(event())

    assert buffer.oldest_pending() == buffer.oldest_pending()
    assert buffer.count() == 1


def test_storing_the_same_event_twice_keeps_one(buffer: EventBuffer) -> None:
    e = event()
    buffer.store(e)
    buffer.store(e)

    assert buffer.count() == 1


def test_deleting_one_leaves_the_rest(buffer: EventBuffer) -> None:
    first, second = event(0), event(1)
    buffer.store(first)
    buffer.store(second)

    buffer.delete(first.event_id)
    buffer.delete("never-stored")  # harmless

    assert drain(buffer) == [second.event_id]


# SQLite only


def test_events_survive_a_restart(tmp_path: Path) -> None:
    first, second = event(0), event(1)
    before = SqliteEventBuffer(tmp_path / "events.db")
    before.store(first)
    before.store(second)
    before.close()

    after = SqliteEventBuffer(tmp_path / "events.db")  # the node starting up again

    assert drain(after) == [first.event_id, second.event_id]


def test_detection_and_the_uplink_can_use_it_from_two_threads(tmp_path: Path) -> None:
    buffer = SqliteEventBuffer(tmp_path / "events.db")
    events = [event(i) for i in range(20)]

    def store_all() -> None:
        for e in events:
            buffer.store(e)

    writer = threading.Thread(target=store_all)
    writer.start()
    sent: list[str] = []
    deadline = time.monotonic() + 10
    while len(sent) < len(events) and time.monotonic() < deadline:  # this thread plays the uplink
        sent += drain(buffer)
    writer.join()

    assert sent == [e.event_id for e in events]


def test_the_folder_is_made_if_missing(tmp_path: Path) -> None:
    SqliteEventBuffer(tmp_path / "data" / "events.db").store(event())

    assert (tmp_path / "data" / "events.db").exists()


# A power cut in the middle of a send

MID_SEND = """
import json, sys, time
from pathlib import Path
from mavradar_edge.buffer.event_buffer import SqliteEventBuffer
from mavradar_edge.contract import CrossingEvent
from mavradar_edge.uplink.uplink import Uplink

class NeverAnswers:
    def post(self, path, body):
        Path(sys.argv[2]).write_text(body["eventId"])  # the send has started
        time.sleep(600)

buffer = SqliteEventBuffer(sys.argv[1])
buffer.store(CrossingEvent.from_dict(json.loads(sys.argv[3])))
Uplink(buffer, NeverAnswers()).send_next_event()
"""


def test_killing_the_process_mid_send_loses_nothing(tmp_path: Path) -> None:
    # A real power cut can't be staged in a test; kill -9 is the closest: no cleanup runs at all.
    e = event()
    db, marker = tmp_path / "events.db", tmp_path / "sending"
    process = subprocess.Popen(
        [sys.executable, "-c", MID_SEND, str(db), str(marker), json.dumps(e.to_dict())]
    )
    try:
        deadline = time.monotonic() + 20
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert marker.exists(), "the send never started"
    finally:
        process.kill()  # SIGKILL
        process.wait()

    buffer = SqliteEventBuffer(db)  # the node starting up again
    pending = buffer.oldest_pending()
    assert pending is not None and pending.event_id == e.event_id

    transport = FakeTransport()
    assert Uplink(buffer, transport).send_next_event() is Outcome.DELIVERED
    assert transport.posts == [("/events", e.to_dict())]  # the same event, the same eventId
    assert buffer.count() == 0
