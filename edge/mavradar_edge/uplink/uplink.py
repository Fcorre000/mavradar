"""Uplink: sends the buffer's oldest event and acts on the server's answer (SD1 messages 7 to 16).

It runs in its own thread and shares only the buffer with detection, so a slow or dead link never
delays the radar. What each answer means is the table in blueprint 08, section 4. An event leaves
the buffer only on a 200 (accepted, or seen before) or a 422 (will never succeed); anything else
keeps it, and the retry sends the body it was stored with, so the same eventId.
"""

import logging
import threading
from enum import StrEnum

from mavradar_edge.buffer.event_buffer import EventBuffer
from mavradar_edge.transport.transport import Transport

logger = logging.getLogger(__name__)

EVENTS_PATH = "/events"


class Outcome(StrEnum):
    EMPTY = "empty"  # nothing to send
    DELIVERED = "delivered"  # 200: the server has it (new or a repeat), deleted here
    REJECTED = "rejected"  # 422: invalid for good, deleted and logged
    UNAUTHORIZED = "unauthorized"  # 401: kept; the key is wrong and won't fix itself
    RETRY = "retry"  # 503, another answer, a timeout or no network: kept, try again


class Backoff:
    """Waits that start short and double up to a cap: quick for a blip, patient for an outage."""

    def __init__(self, first_s: float = 1.0, max_s: float = 60.0) -> None:
        self._first_s = first_s
        self.max_s = max_s
        self._next_s = first_s

    def next(self) -> float:
        wait = self._next_s
        self._next_s = min(self._next_s * 2, self.max_s)
        return wait

    def reset(self) -> None:
        self._next_s = self._first_s


class Uplink:
    def __init__(
        self, buffer: EventBuffer, transport: Transport, backoff: Backoff | None = None, idle_s: float = 5.0
    ) -> None:
        self._buffer = buffer
        self._transport = transport
        self._backoff = backoff or Backoff()
        self._idle_s = idle_s  # a safety poll; notify() is what normally wakes an idle uplink
        self._wake = threading.Event()
        self._stop = threading.Event()

    def send_next_event(self) -> Outcome:
        pending = self._buffer.oldest_pending()
        if pending is None:
            return Outcome.EMPTY
        status = self._transport.post(EVENTS_PATH, pending.body).status
        if status == 200:
            self._buffer.delete(pending.event_id)
            return Outcome.DELIVERED
        if status == 422:
            # Resending would fail the same way, and it would hold up every event behind it.
            self._buffer.delete(pending.event_id)
            logger.error("server rejected event %s as invalid; dropped: %s", pending.event_id, pending.body)
            return Outcome.REJECTED
        if status == 401:
            logger.error("server refused the node key (401); event %s kept", pending.event_id)
            return Outcome.UNAUTHORIZED
        # 503 means pushed but not saved yet; the rest is unknown. Never delete on a guess.
        logger.warning("event %s not delivered (%s); will retry", pending.event_id, status or "no answer")
        return Outcome.RETRY

    def wait_after(self, outcome: Outcome) -> float:
        """How long to wait before the next send."""
        if outcome is Outcome.RETRY:
            return self._backoff.next()
        if outcome is Outcome.UNAUTHORIZED:
            return self._backoff.max_s
        self._backoff.reset()
        return self._idle_s if outcome is Outcome.EMPTY else 0.0

    def notify(self) -> None:
        """Detection stored an event: an idle uplink sends it now instead of at its next poll."""
        self._wake.set()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()

    def run_forever(self) -> None:
        while not self._stop.is_set():
            self._wake.clear()  # before looking, so an event stored after the look still wakes us
            outcome = self.send_next_event()
            wait = self.wait_after(outcome)
            if outcome is Outcome.EMPTY:
                self._wake.wait(wait)
            elif wait > 0:
                self._stop.wait(wait)  # a new event doesn't cut a backoff short
