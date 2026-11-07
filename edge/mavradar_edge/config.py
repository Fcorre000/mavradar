"""NodeConfig from environment variables. See .env.example.

Standard library only, like contract.py: the node stays small and portable (blueprint 06, edge
detector). Detector thresholds join in E2 and the node key in E3.
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

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

        return cls(
            node_id=required("ID"),
            crossing_id=required("CROSSING_ID"),
            log_only=log_only is None or log_only.lower() == "true",
            replay_log=Path(replay_log) if replay_log else None,
            replay_speed=speed,
        )
