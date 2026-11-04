"""The Firestore repositories. Only ever called after the push (SD3): nothing here is on the path
an alert waits for."""

from google.cloud.firestore import AsyncClient

from app.contract import CrossingDoc

WRITE_TIMEOUT_S = 5


class FirestoreCrossingRepository:
    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        # Python mode keeps datetimes as datetimes, so Firestore stores real Timestamps, not text.
        data = doc.model_dump(by_alias=True)
        ref = self._client.collection("crossings").document(crossing_id)
        await ref.set(data, timeout=WRITE_TIMEOUT_S)  # pyright: ignore[reportUnknownMemberType]  (set takes a bare dict)
