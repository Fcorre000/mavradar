"""Settings from environment variables. See .env.example."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.contract import AlertMode, CrossingId


class NodeConfig(BaseModel):
    """One field node: the SHA-256 hash of its key (never the key itself) and the crossing it watches."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    # 64 hex characters, so pasting the raw key here by mistake fails at startup.
    key_hash: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    crossing_id: CrossingId


class Settings(BaseSettings):
    """Read once at startup by the lifespan; a missing or bad value fails there, not mid-request."""

    model_config = SettingsConfigDict(env_prefix="MAVRADAR_", env_file=".env", extra="ignore", frozen=True)

    version: str = "dev"
    # MAVRADAR_NODES, as JSON: {"node-id": {"key_hash": "...", "crossing_id": "794980D"}}.
    # On Cloud Run this comes from Secret Manager as an env var (S7).
    nodes: dict[str, NodeConfig] = Field(default_factory=dict[str, NodeConfig])
    # MAVRADAR_ALERT_MODES, as JSON: {"794980D": "blockedAndCleared"}. A crossing that isn't listed
    # is logOnly, so a forgotten entry stays silent instead of alerting (D1: every crossing starts
    # there). Changing a mode is rare, so a restart to pick it up is fine.
    alert_modes: dict[CrossingId, AlertMode] = Field(default_factory=dict[CrossingId, AlertMode])

    # MAVRADAR_FCM_DRY_RUN. On unless someone turns it off on purpose: in dry run FCM checks every
    # message but nothing reaches a phone, so a forgotten setting can't send a real alert.
    fcm_dry_run: bool = True
    firebase_project_id: str = "mavradar-4a74a"

    def alert_mode(self, crossing_id: str) -> AlertMode:
        return self.alert_modes.get(crossing_id, AlertMode.LOG_ONLY)
