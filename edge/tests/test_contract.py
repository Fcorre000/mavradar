"""The node's copy of the contract must agree with contract/ at the repo root.

Every example file is checked, so a new one is picked up without editing this test.
"""

import json
import math
from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import TypeAlias, cast

import pytest
from jsonschema import Draft202012Validator
from jsonschema.protocols import Validator

from mavradar_edge.contract import (
    HEARTBEAT_INTERVAL_S,
    ContractError,
    CrossingEvent,
    Heartbeat,
    format_time,
    parse_time,
)

CONTRACT = Path(__file__).resolve().parents[2] / "contract"
NAMES = ("crossing-event", "heartbeat")
CLASSES: dict[str, type[CrossingEvent] | type[Heartbeat]] = {
    "crossing-event": CrossingEvent,
    "heartbeat": Heartbeat,
}


Json: TypeAlias = str | int | float | bool | None | dict[str, "Json"] | list["Json"]


def load(path: Path) -> Json:
    return cast(Json, json.loads(path.read_text()))


def load_object(path: Path) -> dict[str, Json]:
    data = load(path)
    assert isinstance(data, dict)
    return data


def validator(name: str) -> Validator:
    # Typed as the protocol: the class's own stub leaves is_valid partly untyped.
    schema = load_object(CONTRACT / "schemas" / f"{name}.schema.json")
    return Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)


def is_valid(name: str, instance: Json) -> bool:
    return validator(name).is_valid(instance)


EXAMPLES = [
    (name, path) for name in NAMES for path in sorted((CONTRACT / "examples" / name).glob("*/*.json"))
]
VALID = [(name, path) for name, path in EXAMPLES if path.parent.name == "valid"]


def example_id(case: tuple[str, Path]) -> str:
    return str(case[1].relative_to(CONTRACT / "examples"))


@pytest.mark.parametrize(("name", "path"), EXAMPLES, ids=[example_id(c) for c in EXAMPLES])
def test_schema_agrees_with_folder(name: str, path: Path) -> None:
    assert is_valid(name, load(path)) == (path.parent.name == "valid")


@pytest.mark.parametrize(("name", "path"), EXAMPLES, ids=[example_id(c) for c in EXAMPLES])
def test_from_dict_agrees_with_folder(name: str, path: Path) -> None:
    if path.parent.name == "valid":
        CLASSES[name].from_dict(load(path))
    else:
        with pytest.raises(ContractError):
            CLASSES[name].from_dict(load(path))


@pytest.mark.parametrize(("name", "path"), VALID, ids=[example_id(c) for c in VALID])
def test_valid_examples_round_trip(name: str, path: Path) -> None:
    example = load(path)
    assert CLASSES[name].from_dict(example).to_dict() == example


@pytest.mark.parametrize("cls", [CrossingEvent, Heartbeat])
@pytest.mark.parametrize("data", [[], "x", None, 3])
def test_from_dict_rejects_non_object(cls: type[CrossingEvent] | type[Heartbeat], data: object) -> None:
    with pytest.raises(ContractError):
        cls.from_dict(data)


def test_heartbeat_without_signal_dbm_is_none() -> None:
    # signalDbm is optional in the schema, but to_dict always writes it.
    example = load_object(CONTRACT / "examples" / "heartbeat" / "valid" / "detecting.json")
    del example["signalDbm"]
    assert is_valid("heartbeat", example)
    heartbeat = Heartbeat.from_dict(example)
    assert heartbeat.signal_dbm is None
    assert heartbeat.to_dict()["signalDbm"] is None


def test_format_time() -> None:
    assert format_time(datetime(2026, 10, 8, 21, 14, 3, 250000, tzinfo=UTC)) == "2026-10-08T21:14:03.250Z"
    assert (
        format_time(datetime(2026, 10, 8, 16, 14, 3, 250000, tzinfo=timezone(timedelta(hours=-5))))
        == "2026-10-08T21:14:03.250Z"
    )
    assert format_time(datetime(2026, 10, 8, 21, 14, 30, tzinfo=UTC)) == "2026-10-08T21:14:30.000Z"
    with pytest.raises(ContractError):
        format_time(datetime(2026, 10, 8, 21, 14, 3))


@pytest.mark.parametrize(
    "value",
    [
        "2026-10-08",
        "2026-10-08 21:14:03.250Z",
        "2026-10-08T21:14Z",
        "2026-10-08T21:14:03.250",
        "2026-02-30T21:14:03.250Z",
        "20261008T211403Z",
        1760000000,
        None,
    ],
)
def test_times_the_schema_rejects(value: Json) -> None:
    # Python's fromisoformat is looser than the schema's date-time format.
    example = load_object(CONTRACT / "examples" / "heartbeat" / "valid" / "detecting.json")
    example["sentAt"] = value
    assert not is_valid("heartbeat", example)
    with pytest.raises(ContractError):
        Heartbeat.from_dict(example)
    with pytest.raises(ContractError):
        parse_time(value)


def test_parse_time_accepts_offsets() -> None:
    assert parse_time("2026-10-08T16:14:03.250-05:00") == datetime(2026, 10, 8, 21, 14, 3, 250000, tzinfo=UTC)


def test_timing_matches_contract() -> None:
    timing = load_object(CONTRACT / "timing.json")
    assert HEARTBEAT_INTERVAL_S == timing["heartbeatSec"]


def test_huge_ints_agree_with_schema() -> None:
    # A huge int is a finite JSON number: no OverflowError, and range checks still apply.
    event = load_object(CONTRACT / "examples" / "crossing-event" / "valid" / "blocked-with-train.json")
    for train, valid in (
        ({"speedMps": 10**400}, True),
        ({"confidence": 10**400}, False),
        ({"speedMps": -(10**400)}, False),
    ):
        event["train"] = dict(train)
        assert is_valid("crossing-event", event) == valid
        if valid:
            CrossingEvent.from_dict(event)
        else:
            with pytest.raises(ContractError):
                CrossingEvent.from_dict(event)
    heartbeat = load_object(CONTRACT / "examples" / "heartbeat" / "valid" / "detecting.json")
    heartbeat["batteryVoltage"] = 10**400
    assert is_valid("heartbeat", heartbeat)
    assert Heartbeat.from_dict(heartbeat).battery_voltage == 10**400


def event() -> CrossingEvent:
    return CrossingEvent.from_dict(load(CONTRACT / "examples" / "crossing-event" / "valid" / "minimal.json"))


def heartbeat() -> Heartbeat:
    return Heartbeat.from_dict(load(CONTRACT / "examples" / "heartbeat" / "valid" / "detecting.json"))


@pytest.mark.parametrize(
    "message",
    [
        lambda: replace(event(), crossing_id="794980d"),
        lambda: replace(heartbeat(), uptime_sec=-1),
        lambda: replace(heartbeat(), enclosure_temp_c=math.nan),
    ],
    ids=["bad-crossing-id", "negative-uptime", "nan-temperature"],
)
def test_to_dict_refuses_what_the_schema_rejects(message: Callable[[], CrossingEvent | Heartbeat]) -> None:
    with pytest.raises(ContractError):
        message().to_dict()
