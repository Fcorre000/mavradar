"""The FastAPI app. Run with: uv run uvicorn app.main:app --workers 1"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health
from app.config import Settings
from app.repositories.memory import MemoryRepositories


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    # Every long-lived object is built here once and kept on app.state, never as a module
    # global, so tests can swap it (blueprint 07, Singleton card).
    app.state.settings = Settings()
    app.state.repositories = MemoryRepositories()
    yield


app = FastAPI(title="MavRadar", lifespan=lifespan)
app.include_router(health.router)
