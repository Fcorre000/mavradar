"""POST /events: one state change from a field node (SD2, then SD3)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.api.deps import get_ingest_controller, verify_node
from app.contract import CrossingEventIn
from app.controllers.ingest import IngestController
from app.services.auth import Node

router = APIRouter()


class Ack(BaseModel):
    """The node acts only on the status code (SD1); the body just names the event. Not in contract/."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    event_id: UUID


@router.post("/events")
async def post_event(
    event: CrossingEventIn,
    node: Annotated[Node, Depends(verify_node)],
    controller: Annotated[IngestController, Depends(get_ingest_controller)],
) -> Ack:
    await controller.post_event(event, node)
    return Ack(event_id=event.event_id)
