"""The repository protocols (blueprint 08, section 2).

Routes and services depend on these protocols, never on a storage implementation. memory.py has the
in-memory versions, used by tests; firestore.py has the Firestore ones.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Protocol

from app.contract import CrossingDoc
from app.domain.crossing_state import AlertKind

# push token -> the alert kinds that phone was sent during the current blockage
ToldRecord = Mapping[str, frozenset[AlertKind]]


class AlertLog(Protocol):
    """Who was told what about each crossing's current blockage (SD4). Kept in memory so the hot
    path reads nothing from Firestore; S3 also writes it there, so a restart can reload it."""

    def who_was_told(self, crossing_id: str) -> ToldRecord: ...

    def mark_told(self, crossing_id: str, tokens: Iterable[str], kind: AlertKind) -> None: ...

    def close_blockage(self, crossing_id: str) -> None:
        """The train has cleared: forget who was told, so the next train starts fresh."""
        ...


class CrossingRepository(Protocol):
    """crossings/{usdotId}, the document the app shows (SD3 messages 1 and 2)."""

    async def save_state(self, crossing_id: str, doc: CrossingDoc) -> None:
        """Replaces the whole document. Raises if the write fails."""
        ...


@dataclass
class Repositories:
    """Built once by the lifespan. Tests swap in the in-memory ones."""

    alert_log: AlertLog
    crossings: CrossingRepository
