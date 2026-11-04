"""In-memory repositories, for tests and local runs."""

from collections.abc import Iterable

from app.contract import CrossingDoc
from app.domain.crossing_state import AlertKind
from app.repositories.base import Repositories, ToldRecord


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


class MemoryCrossingRepository:
    def __init__(self) -> None:
        self.docs: dict[str, CrossingDoc] = {}
        self.fail_next = 0  # tests set this to make the next writes fail

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        if self.fail_next:
            self.fail_next -= 1
            raise ConnectionError("Firestore unavailable")
        self.docs[crossing_id] = doc


def memory_repositories() -> Repositories:
    return Repositories(alert_log=MemoryAlertLog(), crossings=MemoryCrossingRepository())
