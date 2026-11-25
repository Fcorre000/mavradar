"""Heartbeats: the node tells the server it's alive every 30 seconds (SD5 messages 1 to 6).

HealthReporter builds the Heartbeat; HeartbeatSender sends one on a fixed schedule in its own
thread. It's a separate messenger from the event uplink: an event stuck in a 60 second backoff, or
a send that hangs, never makes a heartbeat late, and a heartbeat never touches the uplink's retries.

A heartbeat that fails is dropped, never buffered or retried: only the next one matters. The
buffer is only read here, for the count of events still waiting.
"""

import logging
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from typing import Protocol

from mavradar_edge.buffer.event_buffer import EventBuffer
from mavradar_edge.contract import HEARTBEAT_INTERVAL_S, Heartbeat
from mavradar_edge.detector.detector import DetectorStatus
from mavradar_edge.transport.transport import Transport

logger = logging.getLogger(__name__)

HEARTBEATS_PATH = "/heartbeats"

# TODO(hardware): read the battery from the INA219 and the enclosure temperature from its sensor.
# Until they're wired these are deliberately impossible, so the server's health check flags every
# heartbeat and nobody mistakes them for real readings (a normal-looking value would hide a sensor
# that never got connected).
STUB_BATTERY_V = 0.0
STUB_TEMP_C = -999.0


class StatusSource(Protocol):
    def current_status(self) -> DetectorStatus: ...


def software_version() -> str:
    try:
        return version("mavradar-edge")
    except PackageNotFoundError:
        return "unknown"


class HealthReporter:
    def __init__(
        self,
        *,
        node_id: str,
        log_only: bool,
        detector: StatusSource,
        buffer: EventBuffer,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._node_id = node_id
        self._log_only = log_only
        self._detector = detector
        self._buffer = buffer
        self._clock = clock
        self._now = now
        self._started = clock()  # uptime counts from when the node started reporting
        self._version = software_version()
        logger.warning(
            "battery and temperature are stubbed (%s V, %s C) until the INA219 and sensor are wired",
            STUB_BATTERY_V,
            STUB_TEMP_C,
        )

    def build_heartbeat(self) -> Heartbeat:
        status = self._detector.current_status()
        return Heartbeat(
            node_id=self._node_id,
            sent_at=self._now(),
            status=status.status,
            state=status.state,
            log_only=self._log_only,
            battery_voltage=STUB_BATTERY_V,
            enclosure_temp_c=STUB_TEMP_C,
            uptime_sec=max(0, int(self._clock() - self._started)),
            signal_dbm=None,  # no modem yet; the Cat-M HAT reports it once it's on the BOM
            software_version=self._version,
            map_version=status.map_version,
            buffered_events=self._buffer.count(),
        )


class HeartbeatSender:
    def __init__(
        self,
        reporter: HealthReporter,
        transport: Transport,
        interval_s: float = HEARTBEAT_INTERVAL_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._reporter = reporter
        self._transport = transport
        self._interval_s = interval_s
        self._clock = clock
        self._stop = threading.Event()

    def send_once(self) -> bool:
        """Builds and sends one heartbeat. True if the server took it; a failure is only logged."""
        heartbeat = self._reporter.build_heartbeat()
        status = self._transport.post(HEARTBEATS_PATH, heartbeat.to_dict()).status
        if status == 200:
            return True
        if status == 401:
            logger.error("server refused the node key (401); heartbeat dropped")
        else:
            logger.warning("heartbeat not delivered (%s); dropped", status or "no answer")
        return False

    def next_due(self, due: float) -> float:
        """The next beat is one interval after the last one was due, not after its send finished,
        so a slow send doesn't push every later beat back. After a stall longer than an interval it
        goes right away, once, instead of firing off the missed ones."""
        return max(due + self._interval_s, self._clock())

    def stop(self) -> None:
        self._stop.set()

    def run_forever(self) -> None:
        due = self._clock()  # the first heartbeat goes out at start, so the server sees us now
        while not self._stop.is_set():
            self.send_once()
            due = self.next_due(due)
            self._stop.wait(max(0.0, due - self._clock()))
