"""Calibrate the background map: python -m mavradar_edge.calibrate [--seconds 300]

Run it on the node with the track empty and the gates up (UC9). It captures, prints a summary next
to the current map, and asks before saving. The node's service has to be stopped meanwhile, since
only one program can use the radar; it is started again however this ends: done, Ctrl-C, a
dropped SSH session (SIGHUP) or a crash.
"""

import argparse
import signal
import sys
import threading
from collections.abc import Callable, Mapping, Sequence
from types import FrameType

from mavradar_edge.buffer.event_buffer import SqliteEventBuffer
from mavradar_edge.calibration.calibrator import Calibrator, describe
from mavradar_edge.config import ConfigError, NodeConfig
from mavradar_edge.detector.background import MapStore
from mavradar_edge.health.reporter import HealthReporter, HeartbeatSender
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.transport.transport import HttpsTransport


def main(
    argv: Sequence[str] | None = None,
    env: Mapping[str, str] | None = None,
    ask: Callable[[str], str] = input,
    out: Callable[[str], object] = print,
) -> int:
    """0: saved or rejected. 1: the capture was thrown out. 2: the node isn't set up for it."""
    parser = argparse.ArgumentParser(prog="python -m mavradar_edge.calibrate", description=__doc__)
    parser.add_argument("--seconds", type=float, default=300.0, help="how long to capture (default 300)")
    args = parser.parse_args(argv)
    try:
        config = NodeConfig.from_env(env)
    except ConfigError as error:
        out(f"Not set up: {error}")
        return 2
    if config.replay_log is None:
        out("No radar adapter yet (E6): set MAVRADAR_NODE_REPLAY_LOG to calibrate from a recorded log.")
        return 2

    store = MapStore(config.map_dir)
    calibrator = Calibrator(
        ReplaySource(config.replay_log, speed=config.replay_speed), store, config.detector
    )
    heartbeats = None
    if config.server_url and config.node_key:
        reporter = HealthReporter(
            node_id=config.node_id,
            log_only=config.log_only,
            detector=calibrator,
            buffer=SqliteEventBuffer(config.buffer_path),
        )
        transport = HttpsTransport(config.server_url, config.node_key, config.send_timeout_s)
        heartbeats = HeartbeatSender(reporter, transport)
        threading.Thread(target=heartbeats.run_forever, name="heartbeats", daemon=True).start()

    # TODO(E7): systemctl stop mavradar-edge here, before the radar is opened.
    try:
        out(f"Capturing for {args.seconds:g} s. Keep the track clear.")
        summary = calibrator.start(args.seconds)
        out(describe(summary, config.detector))
        if summary.candidate is None:
            return 1
        if ask("Save this map? [y/N] ").strip().lower() == "y":
            saved = calibrator.confirm()
            out(f"Saved map {saved.version}. The previous map is kept.")
        else:
            calibrator.reject()
            out("Not saved. The current map is unchanged.")
        return 0
    finally:
        if heartbeats is not None:
            heartbeats.stop()
        # TODO(E7): systemctl start mavradar-edge here, so the node comes back however this ends.


def _exit(signum: int, frame: FrameType | None) -> None:
    # By default SIGHUP and SIGTERM end Python without running finally blocks; this runs them.
    raise SystemExit(128 + signum)


if __name__ == "__main__":
    signal.signal(signal.SIGHUP, _exit)  # the SSH session dropped
    signal.signal(signal.SIGTERM, _exit)
    sys.exit(main())
