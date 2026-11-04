"""Providers that hand the objects the lifespan built to routes through Depends.

Tests swap any of them with app.dependency_overrides.
"""

from typing import Annotated, cast

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import Settings
from app.controllers.ingest import IngestController
from app.repositories.base import Repositories
from app.services.alert_policy import AlertPolicy
from app.services.auth import Node, NodeAuthenticator
from app.services.crossing_tracker import CrossingTracker
from app.services.event_log import EventLog
from app.services.notifications import NotificationService


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_repositories(request: Request) -> Repositories:
    return cast(Repositories, request.app.state.repositories)


def get_event_log(request: Request) -> EventLog:
    return cast(EventLog, request.app.state.event_log)


def get_crossing_tracker(request: Request) -> CrossingTracker:
    return cast(CrossingTracker, request.app.state.crossing_tracker)


def get_alert_policy(request: Request) -> AlertPolicy:
    return cast(AlertPolicy, request.app.state.alert_policy)


def get_notification_service(request: Request) -> NotificationService:
    return cast(NotificationService, request.app.state.notifications)


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


def get_ingest_controller(
    node: Annotated[Node, Depends(verify_node)],
    settings: Annotated[Settings, Depends(get_settings)],
    event_log: Annotated[EventLog, Depends(get_event_log)],
    tracker: Annotated[CrossingTracker, Depends(get_crossing_tracker)],
    policy: Annotated[AlertPolicy, Depends(get_alert_policy)],
    repositories: Annotated[Repositories, Depends(get_repositories)],
    notifications: Annotated[NotificationService, Depends(get_notification_service)],
) -> IngestController:
    # FastAPI runs verify_node once per request even though the route asks for it too.
    return IngestController(
        event_log,
        tracker,
        policy,
        repositories,
        notifications,
        alert_mode=settings.alert_mode(node.crossing_id),
        node_ids=settings.node_ids(node.crossing_id),
    )
