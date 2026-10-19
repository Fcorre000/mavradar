"""The contract as Pydantic models: the node's messages and the Firestore documents.

A typed copy of contract/schemas/. tests/test_contract.py checks it against every example in
contract/, so change contract/ first and this file in the same PR.

Message models validate decoded JSON. Firestore models validate what the Firestore SDK returns,
so their timestamps arrive as datetimes.
"""

import re
from collections.abc import Hashable, Mapping
from datetime import datetime
from enum import StrEnum
from typing import Annotated, ClassVar, Literal, Self, cast
from uuid import UUID

from pydantic import (
    AfterValidator,
    AllowInfNan,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    SerializationInfo,
    SerializerFunctionWrapHandler,
    Strict,
    StrictBool,
    StrictFloat,
    StrictInt,
    model_serializer,
    model_validator,
)
from pydantic.alias_generators import to_camel

# 08 section 4 and contract/timing.json
HEARTBEAT_INTERVAL_S = 30
NODE_OFFLINE_AFTER_S = 90
NODE_CHECK_EVERY_S = 60
APPROACHING_MAX_AGE_S = 60
CLEARED_MAX_AGE_S = 600
BLOCKAGE_CHECKS_MIN = (1, 3, 5)
FOLLOW_SYNC_S = 60

# Blockages needed before typicalMin is shown (x-typicalMinSamples in history-summary)
TYPICAL_MIN_SAMPLES = 5


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
    """What a node reports about itself in a heartbeat."""

    DETECTING = "detecting"
    CALIBRATING = "calibrating"
    FAULTED = "faulted"


class AlertMode(StrEnum):
    LOG_ONLY = "logOnly"
    BLOCKED_AND_CLEARED = "blockedAndCleared"
    ALL = "all"


class Platform(StrEnum):
    ANDROID = "android"
    IOS = "ios"


class NodeSide(StrEnum):
    AT_CROSSING = "atCrossing"
    EAST = "east"
    WEST = "west"


class NodeOnline(StrEnum):
    """What the server decides about a node, stored in nodes/{nodeId}."""

    ONLINE = "online"
    CALIBRATING = "calibrating"
    OFFLINE = "offline"


# RFC 3339, as the schema's date-time format checks it, and the same pattern as the node's
# parse_time. Pydantic alone also takes date-only strings, a space for the T, times without
# seconds, offsets without a colon, and numbers.
_RFC3339 = re.compile(
    r"\d{4}-(0[1-9]|1[0-2])-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)",
    re.ASCII,
)


def _require_str(v: object) -> object:
    """A message time must be an RFC 3339 string with an offset; Pydantic parses it next."""
    if isinstance(v, datetime):
        return v  # built in Python, not decoded JSON; AwareDatetime still checks the offset
    if not isinstance(v, str):
        raise ValueError("time must be a string")
    # The schema's checker upper-cases first, so a lowercase t or z passes there too.
    if not _RFC3339.fullmatch(v.upper()):
        raise ValueError("time must be RFC 3339 with an offset, like 2026-10-08T21:14:03.250Z")
    return v


def _hyphenated_uuid(v: object) -> object:
    # Pydantic's UUID also takes 32 bare hex digits, braces and urn:uuid:, the schema doesn't.
    # Uppercase hex passes, as it does in the schema's checker.
    if isinstance(v, UUID):
        return v  # built in Python, not decoded JSON
    if not isinstance(v, str):
        raise ValueError("eventId must be a string")
    try:
        ok = len(v) == 36 and str(UUID(v)) == v.lower()
    except ValueError:
        ok = False
    if not ok:
        raise ValueError("eventId must be a hyphenated UUID")
    return v


def _json_integer(v: object) -> object:
    # JSON Schema counts 5.0 as an integer and true as no number at all. Lax Literal[1, 3, 5]
    # takes True as 1.
    if isinstance(v, bool):
        raise ValueError("expected a number, not true or false")
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _unique[T: Hashable](items: list[T]) -> list[T]:
    # Pydantic has no uniqueItems for lists.
    if len(set(items)) != len(items):
        raise ValueError("items must be unique")
    return items


IsoTime = Annotated[AwareDatetime, BeforeValidator(_require_str)]
# A Firestore Timestamp, which the SDK returns as an aware datetime (DatetimeWithNanoseconds).
# Strict, so a string or a Unix number stored by mistake is rejected, not parsed.
# Write Firestore with model_dump(by_alias=True) (python mode); a JSON dump turns these into strings.
FirestoreTime = Annotated[AwareDatetime, Strict()]
# A JSON number. An int stays an int, since StrictFloat can't hold a huge one the schema allows,
# and NaN and infinity can't be written as JSON.
Number = StrictInt | Annotated[StrictFloat, AllowInfNan(False)]
Integer = Annotated[StrictInt, BeforeValidator(_json_integer)]
# Pydantic's patterns use Rust regex, where $ is the very end. Python's re would also let a
# final newline through.
CrossingId = Annotated[str, Field(pattern=r"^[0-9]{6}[A-Z]$")]
HhMm = Annotated[str, Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")]


class ContractModel(BaseModel):
    """Base for every contract model: camelCase on the wire, snake_case in Python."""

    # populate_by_name also lets the API take snake_case keys, which the node never sends. The guide
    # requires it, and Pyright needs the Python names to construct models.
    model_config = ConfigDict(extra="forbid", frozen=True, alias_generator=to_camel, populate_by_name=True)

    # Aliases of optional fields the schema lets you leave out but not set to null. A default
    # of None alone would accept an explicit null.
    NOT_NULL: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="before")
    @classmethod
    def _reject_null(cls, data: object) -> object:
        # Raw input, so it may not be an object at all; Pydantic rejects that next.
        if not isinstance(data, Mapping):
            return data
        d = cast(Mapping[object, object], data)
        for name, field in cls.model_fields.items():
            if field.alias in cls.NOT_NULL and any(k in d and d[k] is None for k in (field.alias, name)):
                raise ValueError(f"{field.alias} may be left out but not null")
        return d

    @model_serializer(mode="wrap")
    def _drop_unset_not_null(self, handler: SerializerFunctionWrapHandler, info: SerializationInfo) -> object:
        # Leave out a NOT_NULL field that is None, so a dump is valid against the schema again.
        out: object = handler(self)
        if not isinstance(out, dict):
            return out
        d = cast(dict[str, object], out)
        for name, field in type(self).model_fields.items():
            if field.alias in self.NOT_NULL and getattr(self, name) is None:
                d.pop(field.alias if info.by_alias else name, None)
        return d


# Messages from the node (contract/schemas/*.schema.json)


class TrainIn(ContractModel):
    """What the detector measured, for tuning."""

    NOT_NULL = frozenset({"speedMps", "direction", "rangeM", "confidence"})

    speed_mps: Number | None = Field(default=None, ge=0)
    direction: Direction | None = None
    range_m: Number | None = Field(default=None, ge=0)
    confidence: Number | None = Field(default=None, ge=0, le=1)


class CrossingEventIn(ContractModel):
    """POST /events. event_id is made by the node and kept for every retry (OQ6)."""

    NOT_NULL = frozenset({"train", "classifierVersion"})

    schema_version: Annotated[Literal[1], BeforeValidator(_json_integer)]
    event_id: Annotated[UUID, BeforeValidator(_hyphenated_uuid)]
    node_id: str = Field(min_length=1)
    crossing_id: CrossingId
    from_state: ReportedState
    to_state: ReportedState
    occurred_at: IsoTime
    log_only: StrictBool
    train: TrainIn | None = None
    classifier_version: str | None = None


class HeartbeatIn(ContractModel):
    """POST /heartbeats. signal_dbm may be left out or null; both mean no reading."""

    NOT_NULL = frozenset({"bufferedEvents"})

    schema_version: Annotated[Literal[1], BeforeValidator(_json_integer)]
    node_id: str = Field(min_length=1)
    sent_at: IsoTime
    status: NodeStatus
    state: ReportedState
    log_only: StrictBool
    battery_voltage: Number
    enclosure_temp_c: Number
    uptime_sec: Integer = Field(ge=0)
    signal_dbm: Number | None = None
    software_version: str
    map_version: str
    buffered_events: Integer | None = Field(default=None, ge=0)


# Firestore documents (contract/schemas/firestore/)


class SensorDoc(ContractModel):
    name: str = Field(min_length=1)
    battery_ok: StrictBool


class CrossingDoc(ContractModel):
    """crossings/{usdotId}"""

    state: ReportedState
    since: FirestoreTime | None
    stopped_at: FirestoreTime | None
    detected_at: FirestoreTime | None
    clear_since: FirestoreTime | None
    last_reading_at: FirestoreTime
    sensor: SensorDoc
    node_ids: list[Annotated[str, Field(min_length=1)]] = Field(max_length=2)
    alert_mode: AlertMode
    updated_at: FirestoreTime


class BlockageEventDoc(ContractModel):
    """crossings/{usdotId}/events/{blockageId}"""

    start: FirestoreTime
    end: FirestoreTime
    duration_min: Number = Field(ge=0)
    stopped: StrictBool


class LongestDoc(ContractModel):
    start: FirestoreTime
    duration_min: Number = Field(ge=0)
    stopped: StrictBool


class HistorySummaryDoc(ContractModel):
    """crossings/{usdotId}/summary/{range}. The typical times are None below TYPICAL_MIN_SAMPLES."""

    days: Annotated[Literal[7, 30], BeforeValidator(_json_integer)]
    count: Integer = Field(ge=0)
    typical_min: Integer | None = Field(ge=1)
    typical_stopped_min: Integer | None = Field(ge=1)
    longest: LongestDoc | None
    hours: list[Annotated[Number, Field(ge=0)]] = Field(min_length=24, max_length=24)
    per_day: list[Annotated[Integer, Field(ge=0)]]
    updated_at: FirestoreTime

    @model_validator(mode="after")
    def _one_value_per_day(self) -> Self:
        if len(self.per_day) != self.days:
            raise ValueError(f"perDay must have {self.days} values, has {len(self.per_day)}")
        return self


class QuietHoursDoc(ContractModel):
    start: HhMm
    end: HhMm


class AlertTypesDoc(ContractModel):
    approaching: StrictBool
    blocked: StrictBool
    stopped: StrictBool
    cleared: StrictBool


class CommuteWindowDoc(ContractModel):
    """days are ISO weekdays, 1 = Monday. Times of day are in the device's time_zone."""

    days: Annotated[list[Annotated[Integer, Field(ge=1, le=7)]], Field(min_length=1), AfterValidator(_unique)]
    start: HhMm
    end: HhMm


class DeviceDoc(ContractModel):
    """devices/{fcmToken}. The token is the document ID, never a field."""

    NOT_NULL = frozenset({"subscriptions", "alertTypes", "minBlockMin", "timeZone"})

    uid: str = Field(min_length=1)
    platform: Platform
    updated_at: FirestoreTime
    subscriptions: Annotated[list[CrossingId], Field(max_length=20), AfterValidator(_unique)] | None = None
    quiet_hours: QuietHoursDoc | None = None
    alert_types: AlertTypesDoc | None = None
    min_block_min: Annotated[Literal[1, 3, 5], BeforeValidator(_json_integer)] | None = None
    commute_windows: list[CommuteWindowDoc] | None = None
    time_zone: Annotated[str, Field(pattern=r"^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$")] | None = None


class NodeHealthDoc(ContractModel):
    NOT_NULL = frozenset({"bufferedEvents"})

    battery_voltage: Number
    enclosure_temp_c: Number
    uptime_sec: Integer = Field(ge=0)
    signal_dbm: Number | None = None
    buffered_events: Integer | None = Field(default=None, ge=0)


class NodeDoc(ContractModel):
    """nodes/{nodeId}. No field holds the node's coordinates."""

    crossing_id: CrossingId
    side: NodeSide
    last_seen_at: FirestoreTime
    status: NodeOnline
    health: NodeHealthDoc
    flags: list[str]
    software_version: str
    map_version: str


# Each schema name in contract/ and the model for its top-level object
MODELS: dict[str, type[ContractModel]] = {
    "crossing-event": CrossingEventIn,
    "heartbeat": HeartbeatIn,
    "crossing": CrossingDoc,
    "blockage-event": BlockageEventDoc,
    "history-summary": HistorySummaryDoc,
    "device": DeviceDoc,
    "node": NodeDoc,
}
