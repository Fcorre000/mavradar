"""The FastAPI app. Run with: uv run uvicorn app.main:app --workers 1"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from google.cloud.firestore import AsyncClient

from app.api import events, health
from app.config import Settings
from app.repositories.base import Repositories
from app.repositories.firestore import (
    FirestoreAlertRecords,
    FirestoreCrossingRepository,
    FirestoreEventStore,
    FirestoreTokenRegistry,
)
from app.repositories.memory import MemoryAlertLog
from app.services.alert_policy import AlertPolicy
from app.services.crossing_tracker import CrossingTracker
from app.services.event_log import EventLog
from app.services.notifications import FirebaseFcmClient, NotificationService
from app.services.subscriptions import SubscriptionMap


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    # Every long-lived object is built here once and kept on app.state, never as a module
    # global, so tests can swap it (blueprint 07, Singleton card).
    settings = Settings()
    app.state.settings = settings
    # Application Default Credentials, or the emulator when FIRESTORE_EMULATOR_HOST is set.
    firestore = AsyncClient(project=settings.firebase_project_id)
    app.state.repositories = Repositories(
        alert_log=MemoryAlertLog(),  # in memory for the hot path; alert_records keeps its copy
        crossings=FirestoreCrossingRepository(firestore),
        events=FirestoreEventStore(firestore),
        alert_records=FirestoreAlertRecords(firestore),
        tokens=FirestoreTokenRegistry(firestore),
    )
    app.state.event_log = EventLog()
    app.state.crossing_tracker = CrossingTracker()
    app.state.subscriptions = SubscriptionMap()
    app.state.alert_policy = AlertPolicy(app.state.subscriptions)
    fcm = FirebaseFcmClient(settings.firebase_project_id, dry_run=settings.fcm_dry_run)
    app.state.notifications = NotificationService(fcm)
    yield


app = FastAPI(title="MavRadar", lifespan=lifespan)
app.include_router(health.router)
app.include_router(events.router)
