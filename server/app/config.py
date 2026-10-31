"""Settings from environment variables. See .env.example."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.contract import CrossingId


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
