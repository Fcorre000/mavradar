"""NodeConfig from environment variables. See .env.example.

Standard library only, like contract.py: the node stays small and portable (blueprint 06, edge
detector).
"""

import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, fields
from pathlib import Path

from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.transport.transport import check_server_url

PREFIX = "MAVRADAR_NODE_"


class ConfigError(ValueError):
    """A setting is missing or can't be read. Raised at startup, never mid-detection."""


@dataclass(frozen=True)
class NodeConfig:
    node_id: str
    crossing_id: str
    # On unless turned off on purpose: every event is marked log-only, so the server records it
    # and alerts nobody (06, edge detector). A forgotten setting can't send a real alert.
    log_only: bool = True
    replay_log: Path | None = None  # a recorded log to play instead of the radar
    replay_speed: float = 1.0  # 1 is real speed, 10 is ten times faster, 0 is no waiting
    # Size of one raw range band. The radar reports it with ?z; its FFT lines don't carry it.
    # 1 m until the real OPS243-C is checked (E6).
    range_bin_m: float = 1.0
    detector: DetectorSettings = field(default_factory=DetectorSettings)
    # The uplink. The URL and key are unset for a run with no server (a replay on a laptop).
    server_url: str | None = None  # https, or http to localhost only
    node_key: str | None = field(default=None, repr=False)  # a secret: kept out of repr and logs
    buffer_path: Path = Path("data/events.db")  # the SQLite outbox, on the node's disk
    send_timeout_s: float = 10.0
    retry_first_s: float = 1.0  # retries start here and double...
    retry_max_s: float = 60.0  # ...up to here, and go back to the start after a success

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "NodeConfig":
        env = os.environ if env is None else env

        def get(name: str) -> str | None:
            value = env.get(PREFIX + name, "").strip()
            return value or None

        def required(name: str) -> str:
            value = get(name)
            if value is None:
                raise ConfigError(f"{PREFIX}{name} is not set")
            return value

        log_only = get("LOG_ONLY")
        if log_only is not None and log_only.lower() not in ("true", "false"):
            raise ConfigError(f"{PREFIX}LOG_ONLY must be true or false, not {log_only!r}")
        replay_log = get("REPLAY_LOG")
        replay_speed = get("REPLAY_SPEED")
        try:
            speed = float(replay_speed) if replay_speed is not None else 1.0
        except ValueError:
            raise ConfigError(f"{PREFIX}REPLAY_SPEED must be a number, not {replay_speed!r}") from None
        if speed < 0:
            raise ConfigError(f"{PREFIX}REPLAY_SPEED can't be negative")
        range_bin = get("RANGE_BIN_M")
        try:
            range_bin_m = float(range_bin) if range_bin is not None else 1.0
        except ValueError:
            raise ConfigError(f"{PREFIX}RANGE_BIN_M must be a number, not {range_bin!r}") from None
        if range_bin_m <= 0:
            raise ConfigError(f"{PREFIX}RANGE_BIN_M must be more than 0")

        server_url = get("SERVER_URL")
        if server_url is not None:
            try:
                server_url = check_server_url(server_url)
            except ValueError as error:
                raise ConfigError(f"{PREFIX}SERVER_URL: {error}") from None

        def seconds(name: str, default: float) -> float:
            raw = get(name)
            try:
                value = float(raw) if raw is not None else default
            except ValueError:
                raise ConfigError(f"{PREFIX}{name} must be a number, not {raw!r}") from None
            if value <= 0:
                raise ConfigError(f"{PREFIX}{name} must be more than 0")
            return value

        retry_first_s, retry_max_s = seconds("RETRY_FIRST_S", 1.0), seconds("RETRY_MAX_S", 60.0)
        if retry_first_s > retry_max_s:
            raise ConfigError(f"{PREFIX}RETRY_FIRST_S can't be more than {PREFIX}RETRY_MAX_S")

        return cls(
            node_id=required("ID"),
            crossing_id=required("CROSSING_ID"),
            log_only=log_only is None or log_only.lower() == "true",
            replay_log=Path(replay_log) if replay_log else None,
            replay_speed=speed,
            range_bin_m=range_bin_m,
            detector=_detector_settings(get),
            server_url=server_url,
            node_key=get("KEY"),
            buffer_path=Path(get("BUFFER_PATH") or "data/events.db"),
            send_timeout_s=seconds("SEND_TIMEOUT_S", 10.0),
            retry_first_s=retry_first_s,
            retry_max_s=retry_max_s,
        )


def _detector_settings(get: Callable[[str], str | None]) -> DetectorSettings:
    """Each threshold from MAVRADAR_NODE_<NAME>, like MAVRADAR_NODE_MIN_SPEED_MPS; unset keeps
    its default."""
    values: dict[str, float] = {}
    for setting in fields(DetectorSettings):
        name = setting.name.upper()
        raw = get(name)
        if raw is None:
            continue
        try:
            value = float(raw)
        except ValueError:
            raise ConfigError(f"{PREFIX}{name} must be a number, not {raw!r}") from None
        if value < 0:
            raise ConfigError(f"{PREFIX}{name} can't be negative")
        values[setting.name] = value
    settings = DetectorSettings(**values)
    if settings.track_band_min_m >= settings.track_band_max_m:
        raise ConfigError(f"{PREFIX}TRACK_BAND_MIN_M must be less than {PREFIX}TRACK_BAND_MAX_M")
    return settings
