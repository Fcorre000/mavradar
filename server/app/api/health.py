"""GET /health for Cloud Run.

Only says the process is up. It never touches Firestore or any other dependency: a probe
that fails on a Firestore blip would get the one instance restarted and lose its in-memory
state, without fixing Firestore. Not /healthz: Cloud Run reserves some paths ending in "z".
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_settings
from app.config import Settings

router = APIRouter()


class Health(BaseModel):
    status: Literal["ok"]
    version: str


@router.get("/health")
async def health(settings: Annotated[Settings, Depends(get_settings)]) -> Health:
    return Health(status="ok", version=settings.version)
