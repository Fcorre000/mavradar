"""What actually lands in Firestore, against the local emulator (09 S3 done-when). Run from the repo
root with: firebase emulators:exec --only firestore "cd server && uv run pytest -m emulator"
"""

import base64
import json
import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast
from uuid import uuid4

import httpx2
import pytest
from google.cloud.firestore import AsyncClient
from google.cloud.firestore_v1.base_query import FieldFilter

from app.contract import (
    AlertMode,
    BlockageEventDoc,
    CrossingDoc,
    CrossingEventIn,
    HistorySummaryDoc,
    ReportedState,
    SensorDoc,
)
from app.domain.crossing_state import AlertKind
from app.domain.stats import Blockage, blockage_summary
from app.repositories.base import AlertRecord, EventRecord
from app.repositories.firestore import FirestoreAlertRecords, FirestoreCrossingRepository, FirestoreEventStore

pytestmark = pytest.mark.emulator

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


@pytest.mark.anyio
async def test_the_document_has_exactly_the_contracts_fields() -> None:
    data = await save_and_read(blocked_doc())

    schema = cast(dict[str, dict[str, object]], json.loads(SCHEMA.read_text()))
    assert set(data) == set(schema["properties"])
    assert APP_READS <= set(data)
    assert data["sensor"] == {"name": "Crossing node", "batteryOk": True}


@pytest.mark.anyio
async def test_times_are_firestore_timestamps_and_empty_ones_are_null() -> None:
    data = await save_and_read(blocked_doc())

    # Stored as Timestamps (read back as datetimes), never as text, so the app's .toMillis() works.
    assert data["since"] == T
    assert isinstance(data["lastReadingAt"], datetime)
    assert data["stoppedAt"] is None and data["clearSince"] is None


@pytest.mark.anyio
async def test_it_reads_back_into_the_contract_model() -> None:
    data = await save_and_read(blocked_doc())

    assert CrossingDoc.model_validate(data) == blocked_doc()


# The server-only records (S3 group 2)


def an_event() -> CrossingEventIn:
    return CrossingEventIn(
        schema_version=1,
        event_id=uuid4(),
        node_id="node-a",
        crossing_id="794980D",
        from_state=ReportedState.CLEAR,
        to_state=ReportedState.BLOCKED,
        occurred_at=T,
        log_only=True,
    )


async def read(client: AsyncClient, path: str) -> dict[str, object] | None:
    ref = client.document(path)
    snapshot = await ref.get()  # pyright: ignore[reportUnknownMemberType]  (untyped transaction arg)
    return snapshot.to_dict()


@pytest.mark.anyio
async def test_a_resend_rewrites_the_same_history_document() -> None:
    client = AsyncClient(project="mavradar-4a74a")
    store = FirestoreEventStore(client)
    event = an_event()

    await store.append(EventRecord(event, T, applied=True))
    await store.append(EventRecord(event, T, applied=True))  # the resend

    data = await read(client, f"crossingEvents/{event.event_id}")
    assert data is not None and data["eventId"] == str(event.event_id) and data["receivedAt"] == T
    events = client.collection("crossingEvents")
    same_id = FieldFilter("eventId", "==", str(event.event_id))
    matching = events.where(filter=same_id)  # pyright: ignore[reportUnknownMemberType]  (untyped value arg)
    assert len([doc async for doc in matching.stream()]) == 1


@pytest.mark.anyio
async def test_alert_and_blockage_records_land_at_their_paths() -> None:
    client = AsyncClient(project="mavradar-4a74a")
    store = FirestoreAlertRecords(client)
    event_id = uuid4()
    crossing = f"9{uuid4().int % 10**5:05d}B"

    alert = AlertRecord(
        "794980D", AlertKind.CLEARED, "train-alerts", delivered=3, dead=1, failed=0, sent_at=T
    )
    await store.record_alert(event_id, alert)
    await store.save_blockage(crossing, T, {"token-a": frozenset({AlertKind.BLOCKED, AlertKind.STOPPED})})

    logged = await read(client, f"alerts/{event_id}")
    assert logged is not None and (logged["kind"], logged["delivered"], logged["dead"]) == ("cleared", 3, 1)
    blockage = await read(client, f"blockages/{crossing}")
    assert blockage is not None and blockage["told"] == {"token-a": ["blocked", "stopped"]}

    await store.delete_blockage(crossing)
    assert await read(client, f"blockages/{crossing}") is None


# The rules: an app user can read crossings, never the server's records


def app_user_token() -> str:
    """An unsigned ID token for a signed-in anonymous user. Only the emulator accepts these."""

    def part(value: dict[str, object]) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    now = int(time.time())
    claims: dict[str, object] = {
        "iss": "https://securetoken.google.com/mavradar-4a74a",
        "aud": "mavradar-4a74a",
        "sub": "app-user",
        "user_id": "app-user",
        "iat": now,
        "exp": now + 3600,
        "auth_time": now,
        "firebase": {"sign_in_provider": "anonymous", "identities": {}},
    }
    return f"{part({'alg': 'none', 'typ': 'JWT'})}.{part(claims)}."


def app_user_reads(path: str) -> int:
    host = os.environ["FIRESTORE_EMULATOR_HOST"]
    url = f"http://{host}/v1/projects/mavradar-4a74a/databases/(default)/documents/{path}"
    return httpx2.get(url, headers={"Authorization": f"Bearer {app_user_token()}"}).status_code


@pytest.mark.parametrize("path", ["blockages/794980D", "crossingEvents/any", "alerts/any"])
def test_app_users_cannot_read_the_servers_records(path: str) -> None:
    assert app_user_reads(path) == 403


def test_app_users_can_read_crossings() -> None:
    # Allowed, so a missing document is 404 rather than 403: proof the rules let this one through.
    assert app_user_reads("crossings/000000Z") == 404


# History: finished blockages and summaries (S3 group 3)


@pytest.mark.anyio
async def test_history_records_land_where_the_app_reads_them() -> None:
    client = AsyncClient(project="mavradar-4a74a")
    store = FirestoreCrossingRepository(client)
    crossing = f"9{uuid4().int % 10**5:05d}H"
    blockage_id = uuid4()
    old = BlockageEventDoc(
        start=T - timedelta(days=40), end=T - timedelta(days=40), duration_min=3, stopped=False
    )
    recent = BlockageEventDoc(start=T, end=T + timedelta(minutes=15), duration_min=15, stopped=True)

    await store.add_blockage(crossing, uuid4(), old)
    await store.add_blockage(crossing, blockage_id, recent)
    await store.add_blockage(crossing, blockage_id, recent)  # the resend

    stored = await read(client, f"crossings/{crossing}/events/{blockage_id}")
    assert stored is not None and stored["start"] == T and stored["durationMin"] == 15
    assert await store.recent_blockages(crossing, T - timedelta(days=30)) == [
        recent
    ]  # one, and not the old one

    summary = blockage_summary([Blockage(T, 15, True)], T + timedelta(hours=1), 7)
    await store.save_summary(crossing, "7d", summary)
    saved = await read(client, f"crossings/{crossing}/summary/7d")
    assert saved is not None and HistorySummaryDoc.model_validate(saved) == summary
