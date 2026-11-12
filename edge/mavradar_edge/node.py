"""The node's two loops: detection, and the uplink beside it in a second thread.

Detection reads the radar, runs the detector and stores each event in the buffer before anything
is sent (SD1 message 6). It never touches the network, so a slow or dead link can't delay it.

No command-line entry point yet: starting for real needs a saved background map (E5) and the
service on the Pi (E7). Noticing a radar that goes silent (Detector.tick) needs a source that can
time out, which arrives with the real radar (E6); a replayed log never goes silent.
"""

import threading
from collections.abc import Callable

from mavradar_edge.buffer.event_buffer import EventBuffer
from mavradar_edge.detector.detector import Detector
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


def run(source: RadarSource, detector: Detector, buffer: EventBuffer, uplink: Uplink) -> None:
    """Detection in this thread, the uplink in another. When the source ends the uplink is stopped;
    anything not yet delivered stays in the buffer for the next start."""
    thread = threading.Thread(target=uplink.run_forever, name="uplink", daemon=True)
    thread.start()
    try:
        run_detection(source, detector, buffer, uplink.notify)
    finally:
        uplink.stop()
        thread.join(timeout=15)
