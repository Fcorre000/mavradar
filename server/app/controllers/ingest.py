"""IngestController: runs the hot path for one event, in the order SD2 sets."""

from datetime import UTC, datetime
from typing import assert_never

from fastapi import HTTPException, status

from app.contract import AlertMode, CrossingEventIn, ReportedState
from app.domain.crossing_state import is_legal
from app.repositories.base import AlertLog
from app.services.alert_policy import AlertPolicy, Recipients
from app.services.alert_rules import AlertContext
from app.services.auth import Node
from app.services.crossing_tracker import ApplyOutcome, CrossingTracker
from app.services.event_log import EventLog, EventStatus


class IngestController:
    def __init__(
        self,
        event_log: EventLog,
        tracker: CrossingTracker,
        policy: AlertPolicy,
        alert_log: AlertLog,
        alert_mode: AlertMode,
    ) -> None:
        self._event_log = event_log
        self._tracker = tracker
        self._policy = policy
        self._alert_log = alert_log
        self._alert_mode = alert_mode  # of the authenticated node's crossing

    async def post_event(self, event: CrossingEventIn, node: Node) -> None:
        """Returns once the event is handled (200). Raises 422, 503, or lets a failure through (500)."""
        if event.node_id != node.node_id or event.crossing_id != node.crossing_id:
            # A node may only report as itself, about the crossing it watches.
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "event is not from this node")
        if not is_legal(event.from_state, event.to_state):
            # The node trusts its own eyes, but its from and to must be a change the state machine
            # allows. Checked before the event log, so a rejected event leaves no entry.
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "not a legal state change")

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
                    now = datetime.now(UTC)
                    outcome = self._tracker.apply(event, received_at=now)
                    recipients = self._recipients(event, outcome, now)
                    await self._send(event, outcome, recipients)
                    if outcome.applied and event.to_state is ReportedState.CLEAR:
                        # The blockage is over. Only now, after the cleared recipients were picked
                        # from it, forget who was told. An outage (sensorOffline) never ends one.
                        self._alert_log.close_blockage(event.crossing_id)
                except Exception:
                    # Nothing went out, so the node's retry (it gets a 500) must start fresh.
                    self._event_log.forget(event.event_id)
                    raise
                self._event_log.mark_pushed(event.event_id)
            case _:
                assert_never(seen)

        # S3 adds the Firestore writes here, before the event counts as done.
        self._event_log.mark_done(event.event_id)

    def _recipients(self, event: CrossingEventIn, outcome: ApplyOutcome, now: datetime) -> Recipients | None:
        """Who gets the alert, or None when the change calls for none or the event was out of order."""
        if outcome.alert is None:
            return None
        ctx = AlertContext(
            crossing_id=event.crossing_id,
            kind=outcome.alert,
            log_only=event.log_only,
            alert_mode=self._alert_mode,
            age=outcome.age,
            now=now,
            told=self._alert_log.who_was_told(event.crossing_id),
        )
        return self._policy.recipients(ctx)

    async def _send(
        self, event: CrossingEventIn, outcome: ApplyOutcome, recipients: Recipients | None
    ) -> None:
        """Stand-in for SD2 step 6, filled in by S2 group 4: send the push to the recipients, then
        record who was told."""
