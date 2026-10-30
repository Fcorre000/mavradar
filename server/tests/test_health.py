"""The S1 skeleton: /health answers, the lifespan builds objects once, and tests can swap them."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_settings
from app.config import Settings
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    # Entering the client runs the lifespan, like a real startup.
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_health_answers_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_settings_can_be_swapped(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(version="test-1.2.3")

    response = client.get("/health")

    assert response.json() == {"status": "ok", "version": "test-1.2.3"}


def test_lifespan_builds_repositories_once(client: TestClient) -> None:
    built = app.state.repositories

    client.get("/health")
    client.get("/health")

    assert app.state.repositories is built
