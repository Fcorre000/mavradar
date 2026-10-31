"""Providers that hand the objects the lifespan built to routes through Depends.

Tests swap any of them with app.dependency_overrides.
"""

from typing import Annotated, cast

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import Settings
from app.controllers.ingest import IngestController
from app.repositories.memory import MemoryRepositories
from app.services.auth import Node, NodeAuthenticator
from app.services.event_log import EventLog


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_repositories(request: Request) -> MemoryRepositories:
    return cast(MemoryRepositories, request.app.state.repositories)


def get_event_log(request: Request) -> EventLog:
    return cast(EventLog, request.app.state.event_log)


def verify_node(
    settings: Annotated[Settings, Depends(get_settings)],
    x_node_key: Annotated[str | None, Header()] = None,
) -> Node:
    """The node behind the X-Node-Key header, or 401. Reads the node list through get_settings on
    every request, so a test that overrides the settings also sets which nodes exist. FastAPI runs
    this before it validates the body, so a bad key gets 401 even with a bad event."""
    node = NodeAuthenticator(settings.nodes).verify(x_node_key)
    if node is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown node or wrong key")
    return node


def get_ingest_controller(event_log: Annotated[EventLog, Depends(get_event_log)]) -> IngestController:
    return IngestController(event_log)
