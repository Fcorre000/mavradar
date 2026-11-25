"""The node's three loops: detection, with the uplink and the heartbeats beside it in their own
threads.

Detection reads the radar, runs the detector and stores each event in the buffer before anything
is sent (SD1 message 6). It never touches the network, so a slow or dead link can't delay it.
The uplink and the heartbeat sender are separate messengers: they share the transport, and the
heartbeats only read the buffer's count.

An unexpected error in the uplink or heartbeat thread ends the whole process (exit code 1) so
systemd restarts the node (E7). A thread that died quietly would leave a node that still detects
but never reports, which the server can only see as offline. Stopping hard is safe: the buffer
survives it, the same as a power cut.

No command-line entry point yet: starting for real needs a saved background map (E5) and the
service on the Pi (E7). Noticing a radar that goes silent (Detector.tick) needs a source that can
time out, which arrives with the real radar (E6); a replayed log never goes silent.
"""

import logging
import os
import threading
from collections.abc import Callable

from mavradar_edge.buffer.event_buffer import EventBuffer
from mavradar_edge.detector.detector import Detector
from mavradar_edge.health.reporter import HeartbeatSender
from mavradar_edge.radar.source import RadarSource
from mavradar_edge.uplink.uplink import Uplink

logger = logging.getLogger(__name__)


def exit_on_error(loop: Callable[[], None], exit: Callable[[int], object] = os._exit) -> Callable[[], None]:
    """Wraps a thread's loop so an error ends the process, not just the thread. sys.exit() wouldn't
    do: in a thread it only ends that thread."""

    def guarded() -> None:
        try:
            loop()
        except Exception:
            name = threading.current_thread().name
            logger.critical("the %s thread failed; exiting so the node restarts", name, exc_info=True)
            exit(1)

    return guarded


def run_detection(
    source: RadarSource,
    detector: Detector,
    buffer: EventBuffer,
    on_stored: Callable[[], object] = lambda: None,
) -> None:
    """Runs until the source ends. `on_stored` is called after each event is safely in the buffer."""
    for reading in source.readings():
        event = detector.on_reading(reading)
        if event is not None:
            buffer.store(event)
            on_stored()


def run(
    source: RadarSource,
    detector: Detector,
    buffer: EventBuffer,
    uplink: Uplink,
    heartbeats: HeartbeatSender | None = None,
) -> None:
    """Detection in this thread, the uplink and the heartbeats in others. When the source ends
    both are stopped; anything not yet delivered stays in the buffer for the next start."""
    loops = {"uplink": uplink.run_forever}
    if heartbeats is not None:
        loops["heartbeats"] = heartbeats.run_forever
    threads = [
        threading.Thread(target=exit_on_error(loop), name=name, daemon=True) for name, loop in loops.items()
    ]
    for thread in threads:
        thread.start()
    try:
        run_detection(source, detector, buffer, uplink.notify)
    finally:
        uplink.stop()
        if heartbeats is not None:
            heartbeats.stop()
        for thread in threads:
            thread.join(timeout=15)
