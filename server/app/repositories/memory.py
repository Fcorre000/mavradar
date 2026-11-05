"""In-memory repositories, for tests and local runs. The stores can be told to fail their next
writes (`fail_next`), to exercise the 503 path."""

from collections.abc import Iterable
from datetime import datetime
from uuid import UUID

from app.contract import BlockageEventDoc, CrossingDoc, HistorySummaryDoc
from app.domain.crossing_state import AlertKind
from app.repositories.base import AlertRecord, EventRecord, Repositories, SummaryRange, ToldRecord


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


class _Flaky:
    def __init__(self) -> None:
        self.fail_next = 0  # tests set this to make the next writes fail

    def _maybe_fail(self) -> None:
        if self.fail_next:
            self.fail_next -= 1
            raise ConnectionError("Firestore unavailable")


class MemoryCrossingRepository(_Flaky):
    def __init__(self) -> None:
        super().__init__()
        self.docs: dict[str, CrossingDoc] = {}
        self.blockages: dict[str, dict[UUID, BlockageEventDoc]] = {}
        self.summaries: dict[tuple[str, SummaryRange], HistorySummaryDoc] = {}

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        self._maybe_fail()
        self.docs[crossing_id] = doc

    async def add_blockage(self, crossing_id: str, blockage_id: UUID, doc: BlockageEventDoc) -> None:
        self._maybe_fail()
        self.blockages.setdefault(crossing_id, {})[blockage_id] = doc

    async def recent_blockages(self, crossing_id: str, since: datetime) -> list[BlockageEventDoc]:
        self._maybe_fail()
        return [doc for doc in self.blockages.get(crossing_id, {}).values() if doc.start >= since]

    async def save_summary(self, crossing_id: str, range_: SummaryRange, doc: HistorySummaryDoc) -> None:
        self._maybe_fail()
        self.summaries[(crossing_id, range_)] = doc


class MemoryEventStore(_Flaky):
    def __init__(self) -> None:
        super().__init__()
        self.records: dict[UUID, EventRecord] = {}

    async def append(self, record: EventRecord) -> None:
        self._maybe_fail()
        self.records[record.event.event_id] = record


class MemoryAlertRecords(_Flaky):
    def __init__(self) -> None:
        super().__init__()
        self.alerts: dict[UUID, AlertRecord] = {}
        self.blockages: dict[str, tuple[datetime | None, ToldRecord]] = {}

    async def record_alert(self, event_id: UUID, record: AlertRecord) -> None:
        self._maybe_fail()
        self.alerts[event_id] = record

    async def save_blockage(self, crossing_id: str, since: datetime | None, told: ToldRecord) -> None:
        self._maybe_fail()
        self.blockages[crossing_id] = (since, dict(told))

    async def delete_blockage(self, crossing_id: str) -> None:
        self._maybe_fail()
        self.blockages.pop(crossing_id, None)


def memory_repositories() -> Repositories:
    return Repositories(
        alert_log=MemoryAlertLog(),
        crossings=MemoryCrossingRepository(),
        events=MemoryEventStore(),
        alert_records=MemoryAlertRecords(),
    )
