"""The FastAPI app. Run with: uv run uvicorn app.main:app --workers 1"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import events, health
from app.config import Settings
from app.repositories.memory import MemoryRepositories
from app.services.alert_policy import AlertPolicy
from app.services.crossing_tracker import CrossingTracker
from app.services.event_log import EventLog
from app.services.subscriptions import SubscriptionMap


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    # Every long-lived object is built here once and kept on app.state, never as a module
    # global, so tests can swap it (blueprint 07, Singleton card).
    app.state.settings = Settings()
    app.state.repositories = MemoryRepositories()
    app.state.event_log = EventLog()
    app.state.crossing_tracker = CrossingTracker()
    app.state.subscriptions = SubscriptionMap()
    app.state.alert_policy = AlertPolicy(app.state.subscriptions)
    yield


app = FastAPI(title="MavRadar", lifespan=lifespan)
app.include_router(health.router)
app.include_router(events.router)
