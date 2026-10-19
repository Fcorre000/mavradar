"""The messages the node sends to the ingest API: CrossingEvent and Heartbeat.

A typed copy of contract/schemas/{crossing-event,heartbeat}.schema.json, with no schema library
at runtime. tests/test_contract.py checks it against every example in contract/, so change
contract/ first and this file in the same PR.
"""

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Self, TypeVar, cast
from uuid import UUID

# 08 section 4 and contract/timing.json
SCHEMA_VERSION = 1
HEARTBEAT_INTERVAL_S = 30


class ContractError(ValueError):
    """A message the schema would reject."""


class ReportedState(StrEnum):
    CLEAR = "clear"
    APPROACHING = "approaching"
    BLOCKED = "blocked"
    STOPPED = "stopped"
    SENSOR_OFFLINE = "sensorOffline"


class Direction(StrEnum):
    TOWARD = "toward"
    AWAY = "away"


class NodeStatus(StrEnum):
    DETECTING = "detecting"
    CALIBRATING = "calibrating"
    FAULTED = "faulted"


# RFC 3339, as the schema's date-time format checks it. fromisoformat alone also takes
# date-only strings, a space for the T, and times without seconds or an offset.
_RFC3339 = re.compile(
    r"\d{4}-(0[1-9]|1[0-2])-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)",
    re.ASCII,
)
_CROSSING_ID = re.compile(r"[0-9]{6}[A-Z]", re.ASCII)


def format_time(t: datetime) -> str:
    """UTC with milliseconds, like 2026-10-08T21:14:03.250Z."""
    if t.tzinfo is None or t.utcoffset() is None:
        raise ContractError("time has no UTC offset")
    return t.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_time(s: object) -> datetime:
    """An RFC 3339 time with an offset. Takes `object` so a wrong type is a ContractError."""
    if not isinstance(s, str):
        raise ContractError("time is not a string")
    # The schema's checker upper-cases first, so a lowercase t or z passes there too.
    s = s.upper()
    if not _RFC3339.fullmatch(s):
        raise ContractError(f"time is not RFC 3339: {s!r}")
    try:
        t = datetime.fromisoformat(s)
    except ValueError as e:
        raise ContractError(f"time is not a real date: {s!r}") from e
    if t.tzinfo is None:
        raise ContractError(f"time has no UTC offset: {s!r}")
    return t


# Readers for one field of a decoded JSON object. Each raises ContractError, never
# KeyError or TypeError, and treats bool as not a number (Python says True is an int).


def _object(data: object, where: str) -> Mapping[str, object]:
    if not isinstance(data, Mapping):
        raise ContractError(f"{where}: expected an object")
    m = cast(Mapping[object, object], data)
    if not all(isinstance(k, str) for k in m):
        raise ContractError(f"{where}: keys must be strings")
    return cast(Mapping[str, object], m)


def _keys(d: Mapping[str, object], required: set[str], optional: set[str], where: str) -> None:
    if unknown := set(d) - required - optional:
        raise ContractError(f"{where}: unknown fields {sorted(unknown)}")
    if missing := required - set(d):
        raise ContractError(f"{where}: missing fields {sorted(missing)}")


def _str(d: Mapping[str, object], key: str, min_length: int = 0) -> str:
    v = d[key]
    if not isinstance(v, str) or len(v) < min_length:
        raise ContractError(f"{key}: expected a string of at least {min_length} characters")
    return v


def _bool(d: Mapping[str, object], key: str) -> bool:
    v = d[key]
    if not isinstance(v, bool):
        raise ContractError(f"{key}: expected true or false")
    return v


def _number(
    d: Mapping[str, object], key: str, minimum: float | None = None, maximum: float | None = None
) -> float:
    v = d[key]
    # Non-finite floats can't be written as JSON, so they are never valid here. Only floats
    # can be non-finite (math.isfinite overflows on a huge int).
    if (
        isinstance(v, bool)
        or not isinstance(v, int | float)
        or (isinstance(v, float) and not math.isfinite(v))
    ):
        raise ContractError(f"{key}: expected a number")
    if (minimum is not None and v < minimum) or (maximum is not None and v > maximum):
        raise ContractError(f"{key}: {v} is out of range")
    return v


def _int(d: Mapping[str, object], key: str, minimum: int) -> int:
    v = d[key]
    # JSON Schema counts 5.0 as an integer.
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, bool) or not isinstance(v, int):
        raise ContractError(f"{key}: expected an integer")
    if v < minimum:
        raise ContractError(f"{key}: {v} is below {minimum}")
    return v


_E = TypeVar("_E", bound=StrEnum)


def _enum(d: Mapping[str, object], key: str, cls: type[_E]) -> _E:
    v = d[key]
    try:
        if isinstance(v, str):
            return cls(v)
    except ValueError:
        pass
    raise ContractError(f"{key}: expected one of {[e.value for e in cls]}")


def _uuid(d: Mapping[str, object], key: str) -> str:
    # The canonical hyphenated form. Uppercase hex passes, as it does in the schema's checker.
    v = _str(d, key)
    try:
        ok = len(v) == 36 and str(UUID(v)) == v.lower()
    except ValueError:
        ok = False
    if not ok:
        raise ContractError(f"{key}: expected a hyphenated UUID")
    return v


def _schema_version(d: Mapping[str, object]) -> None:
    v = d["schemaVersion"]
    if isinstance(v, bool) or v != SCHEMA_VERSION:
        raise ContractError(f"schemaVersion: expected {SCHEMA_VERSION}")


def _present(d: Mapping[str, object], key: str) -> bool:
    """True if an optional key is there. Present means not null: the schema has no null for it."""
    if key not in d:
        return False
    if d[key] is None:
        raise ContractError(f"{key}: may be left out but not null")
    return True


@dataclass(frozen=True)
class Train:
    """What the detector measured, for tuning."""

    speed_mps: float | None = None
    direction: Direction | None = None
    range_m: float | None = None
    confidence: float | None = None

    def to_dict(self) -> dict[str, object]:
        out: dict[str, object] = {}
        if self.speed_mps is not None:
            out["speedMps"] = self.speed_mps
        if self.direction is not None:
            out["direction"] = self.direction.value
        if self.range_m is not None:
            out["rangeM"] = self.range_m
        if self.confidence is not None:
            out["confidence"] = self.confidence
        return out

    @classmethod
    def from_dict(cls, data: object) -> Self:
        d = _object(data, "train")
        _keys(d, set(), {"speedMps", "direction", "rangeM", "confidence"}, "train")
        return cls(
            speed_mps=_number(d, "speedMps", minimum=0) if _present(d, "speedMps") else None,
            direction=_enum(d, "direction", Direction) if _present(d, "direction") else None,
            range_m=_number(d, "rangeM", minimum=0) if _present(d, "rangeM") else None,
            confidence=_number(d, "confidence", 0, 1) if _present(d, "confidence") else None,
        )


@dataclass(frozen=True)
class CrossingEvent:
    """A state change the node saw. event_id is made once and kept for every retry (OQ6)."""

    event_id: str
    node_id: str
    crossing_id: str
    from_state: ReportedState
    to_state: ReportedState
    occurred_at: datetime
    log_only: bool
    train: Train | None = None
    classifier_version: str | None = None

    def to_dict(self) -> dict[str, object]:
        out: dict[str, object] = {
            "schemaVersion": SCHEMA_VERSION,
            "eventId": self.event_id,
            "nodeId": self.node_id,
            "crossingId": self.crossing_id,
            "fromState": self.from_state.value,
            "toState": self.to_state.value,
            "occurredAt": format_time(self.occurred_at),
            "logOnly": self.log_only,
        }
        if self.train is not None:
            out["train"] = self.train.to_dict()
        if self.classifier_version is not None:
            out["classifierVersion"] = self.classifier_version
        # Never send what the schema rejects: the constructor doesn't check.
        type(self).from_dict(out)
        return out

    @classmethod
    def from_dict(cls, data: object) -> Self:
        d = _object(data, "crossing event")
        required = {"schemaVersion", "eventId", "nodeId", "crossingId", "fromState", "toState"}
        required |= {"occurredAt", "logOnly"}
        _keys(d, required, {"train", "classifierVersion"}, "crossing event")
        _schema_version(d)
        crossing_id = _str(d, "crossingId")
        if not _CROSSING_ID.fullmatch(crossing_id):
            raise ContractError(f"crossingId: {crossing_id!r} is not a USDOT crossing ID")
        return cls(
            event_id=_uuid(d, "eventId"),
            node_id=_str(d, "nodeId", min_length=1),
            crossing_id=crossing_id,
            from_state=_enum(d, "fromState", ReportedState),
            to_state=_enum(d, "toState", ReportedState),
            occurred_at=parse_time(d["occurredAt"]),
            log_only=_bool(d, "logOnly"),
            train=Train.from_dict(d["train"]) if _present(d, "train") else None,
            classifier_version=_str(d, "classifierVersion") if _present(d, "classifierVersion") else None,
        )


@dataclass(frozen=True)
class Heartbeat:
    """Sent every HEARTBEAT_INTERVAL_S. signal_dbm is None when the modem has no reading."""

    node_id: str
    sent_at: datetime
    status: NodeStatus
    state: ReportedState
    log_only: bool
    battery_voltage: float
    enclosure_temp_c: float
    uptime_sec: int
    signal_dbm: float | None
    software_version: str
    map_version: str
    buffered_events: int | None = None

    def to_dict(self) -> dict[str, object]:
        out: dict[str, object] = {
            "schemaVersion": SCHEMA_VERSION,
            "nodeId": self.node_id,
            "sentAt": format_time(self.sent_at),
            "status": self.status.value,
            "state": self.state.value,
            "logOnly": self.log_only,
            "batteryVoltage": self.battery_voltage,
            "enclosureTempC": self.enclosure_temp_c,
            "uptimeSec": self.uptime_sec,
            "signalDbm": self.signal_dbm,
            "softwareVersion": self.software_version,
            "mapVersion": self.map_version,
        }
        if self.buffered_events is not None:
            out["bufferedEvents"] = self.buffered_events
        # Never send what the schema rejects: the constructor doesn't check.
        type(self).from_dict(out)
        return out

    @classmethod
    def from_dict(cls, data: object) -> Self:
        d = _object(data, "heartbeat")
        required = {"schemaVersion", "nodeId", "sentAt", "status", "state", "logOnly", "batteryVoltage"}
        required |= {"enclosureTempC", "uptimeSec", "softwareVersion", "mapVersion"}
        _keys(d, required, {"signalDbm", "bufferedEvents"}, "heartbeat")
        _schema_version(d)
        # signalDbm may be left out or null; both mean no reading.
        signal_dbm = _number(d, "signalDbm") if d.get("signalDbm") is not None else None
        return cls(
            node_id=_str(d, "nodeId", min_length=1),
            sent_at=parse_time(d["sentAt"]),
            status=_enum(d, "status", NodeStatus),
            state=_enum(d, "state", ReportedState),
            log_only=_bool(d, "logOnly"),
            battery_voltage=_number(d, "batteryVoltage"),
            enclosure_temp_c=_number(d, "enclosureTempC"),
            uptime_sec=_int(d, "uptimeSec", minimum=0),
            signal_dbm=signal_dbm,
            software_version=_str(d, "softwareVersion"),
            map_version=_str(d, "mapVersion"),
            buffered_events=_int(d, "bufferedEvents", minimum=0) if _present(d, "bufferedEvents") else None,
        )
