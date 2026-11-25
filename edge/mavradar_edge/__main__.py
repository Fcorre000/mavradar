"""Start the node: python -m mavradar_edge (what deploy/mavradar-edge.service runs).

Exit codes, which the service's restart rule depends on:
- 0: the radar source finished on its own. Only a replay log does that, so nothing restarts it.
- 1: a failure (any uncaught error, or a background thread that failed, E4). systemd restarts it.
  When the real radar adapter arrives (E6), a radar that disappears must raise an error, so it
  lands here too: a lost radar is a failure, never a normal end.
- 2: the node isn't set up (a setting is missing or wrong). Restarting can't fix that, so the
  service doesn't; the reason is in the log.

With no background map saved yet the node doesn't detect at all: it can't see a stopped train, so
it would report clear with a train on the crossing. It sends heartbeats saying calibrating, so the
crossing shows Unknown, until calibrate saves a map and starts the service again.
"""

import logging
import sys
from collections.abc import Mapping

from mavradar_edge.buffer.event_buffer import SqliteEventBuffer
from mavradar_edge.config import ConfigError, NodeConfig
from mavradar_edge.contract import NodeStatus, ReportedState
from mavradar_edge.detector.background import MapStore
from mavradar_edge.detector.detector import Detector, DetectorStatus
from mavradar_edge.health.reporter import HealthReporter, HeartbeatSender
from mavradar_edge.node import run
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.transport.transport import HttpsTransport
from mavradar_edge.uplink.uplink import Backoff, Uplink

logger = logging.getLogger("mavradar_edge")


class WaitingForMap:
    """What the heartbeats say before the first calibration."""

    def current_status(self) -> DetectorStatus:
        return DetectorStatus(NodeStatus.CALIBRATING, ReportedState.SENSOR_OFFLINE, "none")


def main(env: Mapping[str, str] | None = None) -> int:
    try:
        config = NodeConfig.from_env(env)
    except ConfigError as error:
        logger.error("not set up: %s", error)
        return 2
    if not (config.server_url and config.node_key):
        logger.error("not set up: MAVRADAR_NODE_SERVER_URL and MAVRADAR_NODE_KEY are both needed")
        return 2
    if config.replay_log is None:
        logger.error("not set up: no radar adapter yet (E6); set MAVRADAR_NODE_REPLAY_LOG to play a log")
        return 2

    buffer = SqliteEventBuffer(config.buffer_path)
    transport = HttpsTransport(config.server_url, config.node_key, config.send_timeout_s)
    background = MapStore(config.map_dir).load()

    def heartbeats(status: WaitingForMap | Detector) -> HeartbeatSender:
        reporter = HealthReporter(
            node_id=config.node_id, log_only=config.log_only, detector=status, buffer=buffer
        )
        return HeartbeatSender(reporter, transport)

    if background is None:
        logger.warning(
            "no background map saved: run python -m mavradar_edge.calibrate; heartbeats say calibrating"
        )
        heartbeats(WaitingForMap()).run_forever()  # until the service is stopped
        return 0

    detector = Detector(
        node_id=config.node_id,
        crossing_id=config.crossing_id,
        log_only=config.log_only,
        background=background,
        settings=config.detector,
    )
    source = ReplaySource(config.replay_log, speed=config.replay_speed, range_bin_m=config.range_bin_m)
    uplink = Uplink(buffer, transport, Backoff(config.retry_first_s, config.retry_max_s))
    logger.info("detecting with map %s (log-only: %s)", background.version, config.log_only)
    run(source, detector, buffer, uplink, heartbeats(detector))
    logger.info("the replay log ended")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main())
