"""POST /events, S2 group 1: node keys, validation and the EventLog branches of SD2.

The server side of each test holds only the hash of TEST_KEY; requests send the key itself.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import cast
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.deps import get_ingest_controller, get_settings
from app.config import NodeConfig, Settings
from app.contract import CrossingEventIn
from app.controllers.ingest import IngestController
from app.main import app
from app.services.auth import hash_key
from app.services.event_log import EventLog, EventStatus

TEST_KEY = "test-key"
EXAMPLE = Path(__file__).parents[2] / "contract/examples/crossing-event/valid/minimal.json"


def load_event() -> dict[str, object]:
    return cast(dict[str, object], json.loads(EXAMPLE.read_text()))


EVENT = load_event()
EVENT_ID = UUID(cast(str, EVENT["eventId"]))
GOOD = {"X-Node-Key": TEST_KEY}


class RecordingController(IngestController):
    """Counts the push stand-in, and can make the first few attempts fail."""

    def __init__(self, event_log: EventLog, fail_first: int = 0) -> None:
        super().__init__(event_log)
        self.alerts = 0
        self._fail_first = fail_first

    async def _alert(self, event: CrossingEventIn) -> None:
        self.alerts += 1
        if self.alerts <= self._fail_first:
            raise RuntimeError("push failed")


@pytest.fixture
def client() -> Iterator[TestClient]:
    node = NodeConfig(key_hash=hash_key(TEST_KEY), crossing_id=cast(str, EVENT["crossingId"]))
    settings = Settings(nodes={cast(str, EVENT["nodeId"]): node})
    app.dependency_overrides[get_settings] = lambda: settings
    # A failure before the push surfaces as a 500, the way the node would see it.
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


def event_log() -> EventLog:
    return cast(EventLog, app.state.event_log)


def use_controller(fail_first: int = 0) -> RecordingController:
    controller = RecordingController(event_log(), fail_first)
    app.dependency_overrides[get_ingest_controller] = lambda: controller
    return controller


# Node keys


def test_right_key_gets_in(client: TestClient) -> None:
    response = client.post("/events", headers=GOOD, json=EVENT)

    assert response.status_code == 200
    assert response.json() == {"eventId": str(EVENT_ID)}


@pytest.mark.parametrize("headers", [{"X-Node-Key": "made-up"}, {}], ids=["wrong key", "no key"])
def test_wrong_or_missing_key_gets_401(client: TestClient, headers: dict[str, str]) -> None:
    assert client.post("/events", headers=headers, json=EVENT).status_code == 401


def test_bad_key_wins_over_bad_body(client: TestClient) -> None:
    assert client.post("/events", headers={"X-Node-Key": "made-up"}, json={}).status_code == 401


def test_no_nodes_configured_means_every_key_fails(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(nodes={})

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 401


def test_raw_key_in_settings_fails_at_startup() -> None:
    with pytest.raises(ValidationError):
        NodeConfig(key_hash=TEST_KEY, crossing_id="794980D")


# Validation


def test_malformed_event_gets_422(client: TestClient) -> None:
    assert client.post("/events", headers=GOOD, json={**EVENT, "toState": "flying"}).status_code == 422


@pytest.mark.parametrize(
    "change", [{"nodeId": "node-b"}, {"crossingId": "123456Z"}], ids=["other node", "other crossing"]
)
def test_event_not_from_this_node_gets_422(client: TestClient, change: dict[str, str]) -> None:
    assert client.post("/events", headers=GOOD, json={**EVENT, **change}).status_code == 422


# EventLog branches


def test_new_event_alerts_once_and_is_done(client: TestClient) -> None:
    controller = use_controller()

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 200
    assert controller.alerts == 1
    assert event_log().check_and_mark(EVENT_ID) is EventStatus.DONE


def test_retry_after_done_acks_without_alerting_again(client: TestClient) -> None:
    controller = use_controller()
    client.post("/events", headers=GOOD, json=EVENT)

    response = client.post("/events", headers=GOOD, json=EVENT)

    assert response.status_code == 200
    assert controller.alerts == 1


def test_copy_while_first_is_in_progress_gets_503(client: TestClient) -> None:
    controller = use_controller()
    event_log().check_and_mark(EVENT_ID)  # the first copy is mid-request

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 503
    assert controller.alerts == 0


def test_pushed_but_not_written_skips_the_push(client: TestClient) -> None:
    controller = use_controller()
    event_log().check_and_mark(EVENT_ID)
    event_log().mark_pushed(EVENT_ID)

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 200
    assert controller.alerts == 0
    assert event_log().check_and_mark(EVENT_ID) is EventStatus.DONE


def test_failure_before_push_lets_the_retry_start_fresh(client: TestClient) -> None:
    controller = use_controller(fail_first=1)

    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 500
    assert client.post("/events", headers=GOOD, json=EVENT).status_code == 200
    assert controller.alerts == 2
    assert event_log().check_and_mark(EVENT_ID) is EventStatus.DONE
