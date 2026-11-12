"""The uplink against every row of the response table in blueprint 08, section 4: what each answer
leaves in the buffer, what gets resent, and how long the uplink waits."""

import threading
import time
from collections.abc import Callable

import pytest

from mavradar_edge.buffer.event_buffer import MemoryEventBuffer
from mavradar_edge.transport.transport import FakeTransport
from mavradar_edge.uplink.uplink import Backoff, Outcome, Uplink
from tests.factories import event


def uplink_with(*statuses: int | None) -> tuple[Uplink, MemoryEventBuffer, FakeTransport]:
    buffer, transport = MemoryEventBuffer(), FakeTransport(statuses)
    return Uplink(buffer, transport), buffer, transport


# The table


def test_nothing_to_send() -> None:
    uplink, _, transport = uplink_with()

    assert uplink.send_next_event() is Outcome.EMPTY
    assert transport.posts == []


def test_200_deletes_the_event() -> None:
    # Accepted and duplicate are both a plain 200: either way the server has it.
    uplink, buffer, transport = uplink_with(200)
    e = event()
    buffer.store(e)

    assert uplink.send_next_event() is Outcome.DELIVERED
    assert buffer.count() == 0
    assert transport.posts == [("/events", e.to_dict())]


def test_422_deletes_and_logs(caplog: pytest.LogCaptureFixture) -> None:
    uplink, buffer, _ = uplink_with(422)
    e = event()
    buffer.store(e)

    assert uplink.send_next_event() is Outcome.REJECTED
    assert buffer.count() == 0
    assert e.event_id in caplog.text and "invalid" in caplog.text


def test_401_keeps_and_logs(caplog: pytest.LogCaptureFixture) -> None:
    uplink, buffer, _ = uplink_with(401)
    buffer.store(event())

    assert uplink.send_next_event() is Outcome.UNAUTHORIZED
    assert buffer.count() == 1
    assert "401" in caplog.text


@pytest.mark.parametrize("status", [503, 500, 502, None], ids=["503", "500", "502", "timeout or no network"])
def test_a_temporary_failure_keeps_the_event(status: int | None) -> None:
    uplink, buffer, _ = uplink_with(status)
    buffer.store(event())

    assert uplink.send_next_event() is Outcome.RETRY
    assert buffer.count() == 1


@pytest.mark.parametrize("status", [404, 302, 400, 418])
def test_an_answer_the_table_doesnt_list_never_deletes(status: int) -> None:
    uplink, buffer, _ = uplink_with(status)
    buffer.store(event())

    assert uplink.send_next_event() is Outcome.RETRY
    assert buffer.count() == 1


# Retries


def test_a_retry_sends_the_same_event_id_every_time() -> None:
    uplink, buffer, transport = uplink_with(None, 503, 500, 200)
    e = event()
    buffer.store(e)

    outcomes = [uplink.send_next_event() for _ in range(4)]

    assert outcomes == [Outcome.RETRY, Outcome.RETRY, Outcome.RETRY, Outcome.DELIVERED]
    assert [body["eventId"] for _, body in transport.posts] == [e.event_id] * 4
    assert all(body == e.to_dict() for _, body in transport.posts)


def test_the_oldest_event_goes_first_and_holds_back_the_rest() -> None:
    uplink, buffer, transport = uplink_with(503, 200, 200)
    first, second = event(0), event(1)
    buffer.store(first)
    buffer.store(second)

    for _ in range(3):
        uplink.send_next_event()

    assert [body["eventId"] for _, body in transport.posts] == [
        first.event_id,
        first.event_id,
        second.event_id,
    ]


def test_a_rejected_event_doesnt_hold_back_the_next() -> None:
    uplink, buffer, transport = uplink_with(422, 200)
    bad, good = event(0), event(1)
    buffer.store(bad)
    buffer.store(good)

    assert [uplink.send_next_event(), uplink.send_next_event()] == [Outcome.REJECTED, Outcome.DELIVERED]
    assert transport.posts[-1][1]["eventId"] == good.event_id


# Waiting


def waits(uplink: Uplink, count: int) -> list[float]:
    return [uplink.wait_after(uplink.send_next_event()) for _ in range(count)]


def test_retries_start_fast_and_double_up_to_a_minute() -> None:
    uplink, buffer, _ = uplink_with(*[None] * 9)
    buffer.store(event())

    assert waits(uplink, 9) == [1, 2, 4, 8, 16, 32, 60, 60, 60]


def test_a_success_goes_back_to_fast() -> None:
    uplink, buffer, _ = uplink_with(None, None, None, 200, None)
    buffer.store(event(0))
    buffer.store(event(1))

    assert waits(uplink, 5) == [1, 2, 4, 0, 1]  # delivered: no wait, and the next failure starts over


def test_a_wrong_key_waits_the_full_minute() -> None:
    uplink, buffer, _ = uplink_with(401, 401)
    buffer.store(event())

    assert waits(uplink, 2) == [60, 60]


def test_an_empty_buffer_waits_for_the_idle_poll() -> None:
    uplink = Uplink(MemoryEventBuffer(), FakeTransport(), idle_s=5)

    assert waits(uplink, 1) == [5]


def test_backoff_settings() -> None:
    backoff = Backoff(first_s=0.5, max_s=3)

    assert [backoff.next() for _ in range(5)] == [0.5, 1, 2, 3, 3]
    backoff.reset()
    assert backoff.next() == 0.5


# The loop


def run_in_thread(uplink: Uplink) -> threading.Thread:
    thread = threading.Thread(target=uplink.run_forever, daemon=True)
    thread.start()
    return thread


def wait_until(condition: Callable[[], bool], seconds: float = 5) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.01)
    return False


def test_an_idle_uplink_sends_as_soon_as_it_is_notified() -> None:
    buffer, transport = MemoryEventBuffer(), FakeTransport()
    uplink = Uplink(buffer, transport, idle_s=60)  # the poll alone would take a minute
    thread = run_in_thread(uplink)
    time.sleep(0.1)  # let it find the buffer empty and settle into its long wait

    buffer.store(event())
    uplink.notify()

    assert wait_until(lambda: buffer.count() == 0, seconds=2)
    uplink.stop()
    thread.join(timeout=2)
    assert not thread.is_alive()


def test_a_new_event_doesnt_cut_a_backoff_short() -> None:
    buffer, transport = MemoryEventBuffer(), FakeTransport([None])
    uplink = Uplink(buffer, transport, backoff=Backoff(first_s=0.4, max_s=0.4))
    buffer.store(event(0))
    thread = run_in_thread(uplink)
    assert wait_until(lambda: len(transport.posts) == 1)

    buffer.store(event(1))
    uplink.notify()
    time.sleep(0.15)

    assert len(transport.posts) == 1  # still backing off
    assert wait_until(lambda: buffer.count() == 0, seconds=3)
    uplink.stop()
    thread.join(timeout=2)


def test_stop_ends_a_long_wait() -> None:
    uplink = Uplink(MemoryEventBuffer(), FakeTransport(), idle_s=60)
    thread = run_in_thread(uplink)

    uplink.stop()
    thread.join(timeout=2)

    assert not thread.is_alive()
