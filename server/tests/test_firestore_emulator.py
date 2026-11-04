"""What actually lands in Firestore, against the local emulator (09 S3 done-when). Run from the repo
root with: firebase emulators:exec --only firestore "cd server && uv run pytest -m emulator"
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import cast
from uuid import uuid4

import pytest
from google.cloud.firestore import AsyncClient

from app.contract import AlertMode, CrossingDoc, ReportedState, SensorDoc
from app.repositories.firestore import FirestoreCrossingRepository

pytestmark = [pytest.mark.emulator, pytest.mark.anyio]

SCHEMA = Path(__file__).parents[2] / "contract/schemas/firestore/crossing.schema.json"
# Every field app/src/data/firestore-mapping.ts toReading() reads.
APP_READS = {"state", "since", "stoppedAt", "detectedAt", "clearSince", "lastReadingAt", "sensor"}
T = datetime(2026, 11, 4, 20, 14, 3, 250000, tzinfo=UTC)


def blocked_doc() -> CrossingDoc:
    return CrossingDoc(
        state=ReportedState.BLOCKED,
        since=T,
        stopped_at=None,
        detected_at=T,
        clear_since=None,
        last_reading_at=T,
        sensor=SensorDoc(name="Crossing node", battery_ok=True),
        node_ids=["node-a"],
        alert_mode=AlertMode.BLOCKED_AND_CLEARED,
        updated_at=T,
    )


async def save_and_read(doc: CrossingDoc) -> dict[str, object]:
    client = AsyncClient(project="mavradar-4a74a")
    crossing_id = f"9{uuid4().int % 10**5:05d}T"  # a fresh, valid-looking ID per test
    await FirestoreCrossingRepository(client).save_state(crossing_id, doc)
    ref = client.collection("crossings").document(crossing_id)
    snapshot = await ref.get()  # pyright: ignore[reportUnknownMemberType]  (untyped transaction arg)
    data = snapshot.to_dict()
    assert data is not None
    return data


async def test_the_document_has_exactly_the_contracts_fields() -> None:
    data = await save_and_read(blocked_doc())

    schema = cast(dict[str, dict[str, object]], json.loads(SCHEMA.read_text()))
    assert set(data) == set(schema["properties"])
    assert APP_READS <= set(data)
    assert data["sensor"] == {"name": "Crossing node", "batteryOk": True}


async def test_times_are_firestore_timestamps_and_empty_ones_are_null() -> None:
    data = await save_and_read(blocked_doc())

    # Stored as Timestamps (read back as datetimes), never as text, so the app's .toMillis() works.
    assert data["since"] == T
    assert isinstance(data["lastReadingAt"], datetime)
    assert data["stoppedAt"] is None and data["clearSince"] is None


async def test_it_reads_back_into_the_contract_model() -> None:
    data = await save_and_read(blocked_doc())

    assert CrossingDoc.model_validate(data) == blocked_doc()
