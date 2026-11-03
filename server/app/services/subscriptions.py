"""SubscriptionMap: which devices follow which crossing, in memory (SD2 messages 16 and 17).

Answers from memory, so the hot path reads nothing from Firestore. Empty at startup for now: S3
loads every device at startup and S6 syncs changes once a minute (07, Scheduled sync card).
"""

from collections.abc import Iterable
from dataclasses import dataclass

from app.contract import DeviceDoc


@dataclass(frozen=True)
class Device:
    token: str  # the FCM push token, which is also the device document's ID
    doc: DeviceDoc


class SubscriptionMap:
    def __init__(self) -> None:
        self._devices: dict[str, DeviceDoc] = {}
        self._followers: dict[str, set[str]] = {}  # crossing ID -> tokens

    def followers(self, crossing_id: str) -> list[Device]:
        return [Device(token, self._devices[token]) for token in sorted(self._followers.get(crossing_id, ()))]

    def upsert(self, token: str, doc: DeviceDoc) -> None:
        self.drop([token])
        self._devices[token] = doc
        for crossing_id in doc.subscriptions or ():
            self._followers.setdefault(crossing_id, set()).add(token)

    def drop(self, tokens: Iterable[str]) -> None:
        for token in tokens:
            doc = self._devices.pop(token, None)
            for crossing_id in (doc.subscriptions or ()) if doc else ():
                self._followers[crossing_id].discard(token)
