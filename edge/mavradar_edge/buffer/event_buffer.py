"""EventBuffer: the node's outbox (07, Outbox card; SD1 messages 6 to 16).

Every CrossingEvent is stored here before any send, and leaves only when the server has answered
for it (accepted, or rejected for good). So an event survives the link dropping, the server being
down and the node losing power, and a retry always carries the eventId it was stored with.

Detection and the uplink run in two threads and share nothing but this buffer.
"""

import json
import sqlite3
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

from mavradar_edge.contract import CrossingEvent


@dataclass(frozen=True)
class Pending:
    """An event waiting to be sent: its body exactly as it was stored. Not parsed back into a
    CrossingEvent, so a row an older version wrote can't jam the queue; the server judges it."""

    event_id: str
    body: Mapping[str, object]


class EventBuffer(Protocol):
    def store(self, event: CrossingEvent) -> None:
        """Returns once the event is safely kept. Storing the same eventId again changes nothing."""
        ...

    def oldest_pending(self) -> Pending | None: ...

    def delete(self, event_id: str) -> None: ...

    def count(self) -> int:
        """How many events are waiting (the heartbeat's bufferedEvents)."""
        ...


class MemoryEventBuffer:
    """For tests. Gone when the process ends."""

    def __init__(self) -> None:
        self._events: dict[str, Mapping[str, object]] = {}  # dicts keep insertion order
        self._lock = threading.Lock()

    def store(self, event: CrossingEvent) -> None:
        with self._lock:
            self._events.setdefault(event.event_id, event.to_dict())

    def oldest_pending(self) -> Pending | None:
        with self._lock:
            for event_id, body in self._events.items():
                return Pending(event_id, body)
            return None

    def delete(self, event_id: str) -> None:
        with self._lock:
            self._events.pop(event_id, None)

    def count(self) -> int:
        with self._lock:
            return len(self._events)


class SqliteEventBuffer:
    """One small SQLite file on the node's disk.

    Each thread gets its own connection: SQLite connections aren't for sharing. WAL lets the
    uplink read while detection writes, and synchronous=FULL makes store() return only after the
    event is on disk, which is what lets it survive a power cut.
    """

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        with self._connection() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS events ("
                "seq INTEGER PRIMARY KEY AUTOINCREMENT, "  # arrival order: the oldest goes first
                "event_id TEXT NOT NULL UNIQUE, "
                "body TEXT NOT NULL)"
            )

    def _connection(self) -> sqlite3.Connection:
        db = cast(sqlite3.Connection | None, getattr(self._local, "db", None))
        if db is None:
            db = sqlite3.connect(self._path, timeout=5)
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA synchronous=FULL")
            self._local.db = db
        return db

    def store(self, event: CrossingEvent) -> None:
        body = json.dumps(event.to_dict(), separators=(",", ":"))
        with self._connection() as db:  # commits on leaving the block
            db.execute("INSERT OR IGNORE INTO events (event_id, body) VALUES (?, ?)", (event.event_id, body))

    def oldest_pending(self) -> Pending | None:
        row = cast(
            tuple[str, str] | None,
            self._connection().execute("SELECT event_id, body FROM events ORDER BY seq LIMIT 1").fetchone(),
        )
        if row is None:
            return None
        return Pending(row[0], cast(dict[str, object], json.loads(row[1])))

    def delete(self, event_id: str) -> None:
        with self._connection() as db:
            db.execute("DELETE FROM events WHERE event_id = ?", (event_id,))

    def count(self) -> int:
        row = cast(tuple[int], self._connection().execute("SELECT COUNT(*) FROM events").fetchone())
        return row[0]

    def close(self) -> None:
        """Closes this thread's connection."""
        db = cast(sqlite3.Connection | None, getattr(self._local, "db", None))
        if db is not None:
            db.close()
            self._local.db = None
