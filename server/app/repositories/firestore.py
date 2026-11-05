"""The Firestore repositories. Only ever called after the push (SD3): nothing here is on the path
an alert waits for."""

from datetime import UTC, datetime
from uuid import UUID

from google.cloud.firestore import AsyncClient, AsyncDocumentReference

from app.contract import CrossingDoc
from app.repositories.base import AlertRecord, EventRecord, ToldRecord

WRITE_TIMEOUT_S = 5


class FirestoreCrossingRepository:
    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        # Python mode keeps datetimes as datetimes, so Firestore stores real Timestamps, not text.
        data = doc.model_dump(by_alias=True)
        await _set(self._client.collection("crossings").document(crossing_id), data)


async def _set(ref: AsyncDocumentReference, data: dict[str, object]) -> None:
    await ref.set(data, timeout=WRITE_TIMEOUT_S)  # pyright: ignore[reportUnknownMemberType]  (set takes a bare dict)


class FirestoreEventStore:
    """crossingEvents/{eventId}. Server-only: firestore.rules opens nothing outside crossings and
    devices to the app."""

    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def append(self, record: EventRecord) -> None:
        event = record.event
        data: dict[str, object] = event.model_dump(by_alias=True)
        data["eventId"] = str(event.event_id)  # Firestore has no UUID type
        data["receivedAt"] = record.received_at
        data["applied"] = record.applied
        await _set(self._client.collection("crossingEvents").document(str(event.event_id)), data)


class FirestoreAlertRecords:
    """alerts/{eventId} and blockages/{crossingId}. Server-only, like the event history."""

    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def record_alert(self, event_id: UUID, record: AlertRecord) -> None:
        data: dict[str, object] = {
            "crossingId": record.crossing_id,
            "kind": record.kind.value,
            "channel": record.channel,
            "delivered": record.delivered,
            "dead": record.dead,
            "failed": record.failed,
            "sentAt": record.sent_at,
        }
        await _set(self._client.collection("alerts").document(str(event_id)), data)

    async def save_blockage(self, crossing_id: str, since: datetime | None, told: ToldRecord) -> None:
        data: dict[str, object] = {
            "since": since,
            "told": {token: sorted(kind.value for kind in kinds) for token, kinds in told.items()},
            "updatedAt": datetime.now(UTC),
        }
        await _set(self._client.collection("blockages").document(crossing_id), data)

    async def delete_blockage(self, crossing_id: str) -> None:
        await self._client.collection("blockages").document(crossing_id).delete(timeout=WRITE_TIMEOUT_S)
