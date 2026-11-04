"""IngestController: runs the hot path for one event, in the order SD2 sets, then saves it (SD3)."""

import asyncio
import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import assert_never

from fastapi import HTTPException, status

from app.contract import AlertMode, CrossingDoc, CrossingEventIn, ReportedState, SensorDoc
from app.domain.crossing_state import is_legal
from app.repositories.base import Repositories
from app.services.alert_policy import AlertPolicy, Recipients
from app.services.alert_rules import AlertContext
from app.services.auth import Node
from app.services.crossing_tracker import ApplyOutcome, CrossingTracker
from app.services.event_log import EventLog, EventStatus
from app.services.notifications import DeliveryReport, NotificationService, alert_push

logger = logging.getLogger(__name__)

# Quick retries for a failing save before the node gets a 503 (SD3). Seconds.
SAVE_RETRY_DELAYS = (0.1, 0.3)
# Until heartbeats report a name and battery (S4).
DEFAULT_SENSOR = SensorDoc(name="Crossing node", battery_ok=True)


class IngestController:
    def __init__(
        self,
        event_log: EventLog,
        tracker: CrossingTracker,
        policy: AlertPolicy,
        repositories: Repositories,
        notifications: NotificationService,
        alert_mode: AlertMode,
        node_ids: Sequence[str],
        save_retry_delays: Sequence[float] = SAVE_RETRY_DELAYS,
    ) -> None:
        self._event_log = event_log
        self._tracker = tracker
        self._policy = policy
        self._alert_log = repositories.alert_log
        self._crossings = repositories.crossings
        self._notifications = notifications
        # Both are for the authenticated node's crossing.
        self._alert_mode = alert_mode
        self._node_ids = list(node_ids)
        self._save_retry_delays = save_retry_delays

    async def post_event(self, event: CrossingEventIn, node: Node) -> None:
        """Returns once the event is handled and saved (200). Raises 422 or 503, or lets a failure
        before the push through (500)."""
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
                # Pushed earlier but not saved: skip the push and save again.
                changed = True
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
                changed = outcome.applied  # an out-of-order event changed nothing to save
            case _:
                assert_never(seen)

        if changed:
            await self._save(event.crossing_id)
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

    async def _save(self, crossing_id: str) -> None:
        """Saves the crossing document, with a few quick retries. If it still fails the node gets a
        503 and the event stays "pushed, not written", so the resend saves without pushing again."""
        reading = self._tracker.reading(crossing_id)
        if reading is None:
            return
        now = datetime.now(UTC)
        doc = CrossingDoc(
            state=reading.state,
            since=reading.since,
            stopped_at=reading.stopped_at,
            detected_at=reading.detected_at,
            clear_since=reading.clear_since,
            last_reading_at=now,  # the server's clock, not the node's (backend guide, section 6)
            sensor=DEFAULT_SENSOR,
            node_ids=self._node_ids,
            alert_mode=self._alert_mode,
            updated_at=now,
        )
        for delay in (*self._save_retry_delays, None):
            try:
                await self._crossings.save_state(crossing_id, doc)
                return
            except Exception:
                if delay is None:
                    logger.exception("saving crossings/%s failed; the node will resend", crossing_id)
                    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "not saved yet, retry") from None
                logger.warning("saving crossings/%s failed; retrying", crossing_id)
                await asyncio.sleep(delay)
