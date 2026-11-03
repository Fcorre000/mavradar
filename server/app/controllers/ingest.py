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
from app.services.notifications import DeliveryReport, NotificationService, alert_push


class IngestController:
    def __init__(
        self,
        event_log: EventLog,
        tracker: CrossingTracker,
        policy: AlertPolicy,
        alert_log: AlertLog,
        alert_mode: AlertMode,
        notifications: NotificationService,
    ) -> None:
        self._event_log = event_log
        self._tracker = tracker
        self._policy = policy
        self._alert_log = alert_log
        self._alert_mode = alert_mode  # of the authenticated node's crossing
        self._notifications = notifications

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
                    report = await self._send(event, outcome, recipients)
                except Exception:
                    # Failed before the push (sending itself never raises), so nothing went out and
                    # the node's retry (it gets a 500) must start fresh.
                    self._event_log.forget(event.event_id)
                    raise
                self._event_log.mark_pushed(event.event_id)

                # Everything below is a record of what happened, so it comes after the push.
                if outcome.alert is not None and report is not None:
                    # Only phones FCM accepted were told; dead and failed tokens weren't.
                    self._alert_log.mark_told(event.crossing_id, report.delivered, outcome.alert)
                if outcome.applied and event.to_state is ReportedState.CLEAR:
                    # The blockage is over. Only now, after the cleared recipients were picked
                    # from it, forget who was told. An outage (sensorOffline) never ends one.
                    self._alert_log.close_blockage(event.crossing_id)
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
    ) -> DeliveryReport | None:
        """Sends the push, or None when there is nothing to send. Dead tokens stay in the report
        for S3 to delete."""
        if outcome.alert is None or recipients is None or not recipients.tokens:
            return None
        push = alert_push(outcome.alert, event.crossing_id, event.occurred_at, recipients.channel)
        return await self._notifications.send(push, recipients.tokens)
