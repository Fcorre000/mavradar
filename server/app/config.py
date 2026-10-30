"""Settings from environment variables. See .env.example."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read once at startup by the lifespan; a missing or bad value fails there, not mid-request."""

    model_config = SettingsConfigDict(env_prefix="MAVRADAR_", env_file=".env", extra="ignore", frozen=True)

    version: str = "dev"
