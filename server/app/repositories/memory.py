"""In-memory repositories, for tests and local runs."""

from collections.abc import Iterable

from app.domain.crossing_state import AlertKind
from app.repositories.base import AlertLog, ToldRecord


class MemoryAlertLog:
    def __init__(self) -> None:
        self._told: dict[str, dict[str, frozenset[AlertKind]]] = {}

    def who_was_told(self, crossing_id: str) -> ToldRecord:
        return dict(self._told.get(crossing_id, {}))

    def mark_told(self, crossing_id: str, tokens: Iterable[str], kind: AlertKind) -> None:
        told = self._told.setdefault(crossing_id, {})
        for token in tokens:
            told[token] = told.get(token, frozenset()) | {kind}

    def close_blockage(self, crossing_id: str) -> None:
        self._told.pop(crossing_id, None)


class MemoryRepositories:
    """Holds the in-memory repositories. Built once by the lifespan, so their data lives as
    long as the process."""

    def __init__(self) -> None:
        self.alert_log: AlertLog = MemoryAlertLog()
