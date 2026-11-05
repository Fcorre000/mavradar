"""The Firestore repositories. Only ever called after the push (SD3): nothing here is on the path
an alert waits for."""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from google.cloud.firestore import AsyncClient, AsyncDocumentReference
from google.cloud.firestore_v1.base_query import FieldFilter

from app.contract import BlockageEventDoc, CrossingDoc, HistorySummaryDoc
from app.repositories.base import AlertRecord, EventRecord, SummaryRange, ToldRecord

WRITE_TIMEOUT_S = 5


class FirestoreCrossingRepository:
    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        # Python mode keeps datetimes as datetimes, so Firestore stores real Timestamps, not text.
        data = doc.model_dump(by_alias=True)
        await _set(self._client.collection("crossings").document(crossing_id), data)

    async def add_blockage(self, crossing_id: str, blockage_id: UUID, doc: BlockageEventDoc) -> None:
        events = self._client.collection("crossings", crossing_id, "events")
        await _set(events.document(str(blockage_id)), doc.model_dump(by_alias=True))

    async def recent_blockages(self, crossing_id: str, since: datetime) -> list[BlockageEventDoc]:
        events = self._client.collection("crossings", crossing_id, "events")
        recent = events.where(filter=FieldFilter("start", ">=", since))  # pyright: ignore[reportUnknownMemberType]  (untyped value arg)
        return [
            BlockageEventDoc.model_validate(doc.to_dict())
            async for doc in recent.stream(timeout=WRITE_TIMEOUT_S)
        ]

    async def save_summary(self, crossing_id: str, range_: SummaryRange, doc: HistorySummaryDoc) -> None:
        summary = self._client.collection("crossings", crossing_id, "summary")
        await _set(summary.document(range_), doc.model_dump(by_alias=True))


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


# Firestore takes at most 500 writes in one batch.
BATCH_LIMIT = 500


class FirestoreTokenRegistry:
    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def remove(self, tokens: Sequence[str]) -> None:
        for start in range(0, len(tokens), BATCH_LIMIT):
            batch = self._client.batch()
            for token in tokens[start : start + BATCH_LIMIT]:
                batch.delete(self._client.collection("devices").document(token))
            await batch.commit(timeout=WRITE_TIMEOUT_S)
