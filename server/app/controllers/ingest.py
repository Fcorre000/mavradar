"""IngestController: runs the hot path for one event, in the order SD2 sets."""

from typing import assert_never

from fastapi import HTTPException, status

from app.contract import CrossingEventIn
from app.services.auth import Node
from app.services.event_log import EventLog, EventStatus


class IngestController:
    def __init__(self, event_log: EventLog) -> None:
        self._event_log = event_log

    async def post_event(self, event: CrossingEventIn, node: Node) -> None:
        """Returns once the event is handled (200). Raises 422, 503, or lets a failure through (500)."""
        if event.node_id != node.node_id or event.crossing_id != node.crossing_id:
            # A node may only report as itself, about the crossing it watches.
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "event is not from this node")

        seen = self._event_log.check_and_mark(event.event_id)
        match seen:
            case EventStatus.DONE:
                return  # a retry after a lost ack: acknowledge again, nothing else
            case EventStatus.IN_PROGRESS:
                # Another copy is mid-request and may still fail, so the node must keep this one.
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "event is being handled, retry")
            case EventStatus.PUSHED:
                pass  # pushed earlier but not written: skip the push and finish the writes
            case EventStatus.NEW:
                try:
                    await self._alert(event)
                except Exception:
                    # Nothing went out, so the node's retry (it gets a 500) must start fresh.
                    self._event_log.forget(event.event_id)
                    raise
                self._event_log.mark_pushed(event.event_id)
            case _:
                assert_never(seen)

        # S3 adds the Firestore writes here, before the event counts as done.
        self._event_log.mark_done(event.event_id)

    async def _alert(self, event: CrossingEventIn) -> None:
        """Stand-in for SD2 steps 4 to 6, filled in by S2 groups 2 to 4: apply the state change,
        pick the recipients, send the push."""
