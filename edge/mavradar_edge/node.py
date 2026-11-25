"""The node's three loops: detection, with the uplink and the heartbeats beside it in their own
threads.

Detection reads the radar, runs the detector and stores each event in the buffer before anything
is sent (SD1 message 6). It never touches the network, so a slow or dead link can't delay it.
The uplink and the heartbeat sender are separate messengers: they share the transport, and the
heartbeats only read the buffer's count.

No command-line entry point yet: starting for real needs a saved background map (E5) and the
service on the Pi (E7). Noticing a radar that goes silent (Detector.tick) needs a source that can
time out, which arrives with the real radar (E6); a replayed log never goes silent.
"""

import threading
from collections.abc import Callable

from mavradar_edge.buffer.event_buffer import EventBuffer
from mavradar_edge.detector.detector import Detector
from mavradar_edge.health.reporter import HeartbeatSender
from mavradar_edge.radar.source import RadarSource
from mavradar_edge.uplink.uplink import Uplink


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
    threads = [threading.Thread(target=uplink.run_forever, name="uplink", daemon=True)]
    if heartbeats is not None:
        threads.append(threading.Thread(target=heartbeats.run_forever, name="heartbeats", daemon=True))
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
