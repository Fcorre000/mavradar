"""The server's copy of the contract must agree with contract/ at the repo root.

Every example file is checked, so a new one is picked up without editing this test.
"""

import json
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import cast, get_args

import pytest
from jsonschema import Draft202012Validator
from jsonschema.protocols import Validator
from pydantic import ValidationError

from app.contract import (
    APPROACHING_MAX_AGE_S,
    BLOCKAGE_CHECKS_MIN,
    CLEARED_MAX_AGE_S,
    FOLLOW_SYNC_S,
    HEARTBEAT_INTERVAL_S,
    MODELS,
    NODE_CHECK_EVERY_S,
    NODE_OFFLINE_AFTER_S,
    TYPICAL_MIN_SAMPLES,
    ContractModel,
)

CONTRACT = Path(__file__).resolve().parents[2] / "contract"

type Json = str | int | float | bool | None | dict[str, Json] | list[Json]
type Schema = dict[str, Json]


def load(path: Path) -> Json:
    return cast(Json, json.loads(path.read_text()))


def load_object(path: Path) -> dict[str, Json]:
    data = load(path)
    assert isinstance(data, dict)
    return data


def schema_path(name: str) -> Path:
    (path,) = CONTRACT.glob(f"schemas/**/{name}.schema.json")
    return path


def schema(name: str) -> Schema:
    return load_object(schema_path(name))


def is_firestore(name: str) -> bool:
    return schema_path(name).parent.name == "firestore"


def validator(name: str) -> Validator:
    # Typed as the protocol: the class's own stub leaves is_valid partly untyped.
    return Draft202012Validator(schema(name), format_checker=Draft202012Validator.FORMAT_CHECKER)


def is_valid(name: str, instance: Json) -> bool:
    return validator(name).is_valid(instance)


def resolve(node: Schema, root: Schema) -> Schema:
    """node with a local "#/$defs/..." $ref replaced by its target, keeping siblings like description."""
    ref = node.get("$ref")
    if not isinstance(ref, str):
        return node
    assert ref.startswith("#/"), f"only local refs are expected: {ref}"
    target: Json = root
    for part in ref.removeprefix("#/").split("/"):
        assert isinstance(target, dict)
        target = target[part]
    assert isinstance(target, dict)
    rest = {k: v for k, v in node.items() if k != "$ref"}
    return {**resolve(target, root), **rest}


def json_kind(value: object) -> str:
    match value:
        case None:
            return "null"
        case bool():
            return "boolean"
        case int():
            return "integer"
        case float():
            return "number"
        case str():
            return "string"
        case list():
            return "array"
        case _:
            return "object"


def kind_matches(node: Schema, value: object) -> bool:
    types = node.get("type")
    if types is None:
        return True
    names = [types] if isinstance(types, str) else cast(list[str], types)
    kind = json_kind(value)
    return kind in names or (kind == "integer" and "number" in names)


def firestore_values(value: Json, node: Schema, root: Schema) -> object:
    """value with every string the schema tags x-firestore: timestamp turned into a datetime,
    as the Firestore SDK hands the server a Timestamp. Strings that don't parse stay strings,
    so the model is what rejects them."""
    node = resolve(node, root)
    if node.get("x-firestore") == "timestamp" and isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    branches = node.get("oneOf")
    if isinstance(branches, list):
        for branch in branches:
            assert isinstance(branch, dict)
            if kind_matches(resolve(branch, root), value):
                return firestore_values(value, branch, root)
        return value
    properties = node.get("properties")
    if isinstance(value, dict) and isinstance(properties, dict):
        return {
            k: firestore_values(v, cast(Schema, properties[k]), root) if k in properties else v
            for k, v in value.items()
        }
    items = node.get("items")
    if isinstance(value, list) and isinstance(items, dict):
        return [firestore_values(v, items, root) for v in value]
    return value


def model_input(name: str, data: Json) -> object:
    """What the model gets: messages as decoded JSON, Firestore documents with real datetimes."""
    if not is_firestore(name):
        return data
    root = schema(name)
    return firestore_values(data, root, root)


def test_firestore_values_finds_every_timestamp() -> None:
    # The models would also parse the strings, so check the helper really hands them datetimes.
    week = model_input("history-summary", load(CONTRACT / "examples/history-summary/valid/week.json"))
    assert isinstance(week, dict)
    longest = cast(dict[str, object], week)["longest"]
    assert isinstance(longest, dict)
    assert isinstance(cast(dict[str, object], longest)["start"], datetime)
    crossing = model_input("crossing", load(CONTRACT / "examples/crossing/valid/blocked.json"))
    assert isinstance(crossing, dict)
    c = cast(dict[str, object], crossing)
    keys = ("since", "stoppedAt", "detectedAt", "clearSince", "lastReadingAt", "updatedAt")
    assert {k: type(c[k]) for k in keys} == {
        "since": datetime,
        "stoppedAt": type(None),
        "detectedAt": datetime,
        "clearSince": datetime,
        "lastReadingAt": datetime,
        "updatedAt": datetime,
    }


def model_accepts(name: str, data: Json) -> bool:
    try:
        MODELS[name].model_validate(model_input(name, data))
    except ValidationError:
        return False
    return True


NAMES = sorted(p.name.removesuffix(".schema.json") for p in CONTRACT.glob("schemas/**/*.schema.json"))
EXAMPLES = [
    (name, path) for name in NAMES for path in sorted((CONTRACT / "examples" / name).glob("*/*.json"))
]


def example_id(case: tuple[str, Path]) -> str:
    return str(case[1].relative_to(CONTRACT / "examples"))


def test_every_schema_has_a_model_and_examples() -> None:
    assert len(NAMES) == 7
    assert set(MODELS) == set(NAMES)
    assert sorted(p.name for p in (CONTRACT / "examples").iterdir() if p.is_dir()) == NAMES
    for name in NAMES:
        assert list((CONTRACT / "examples" / name).glob("valid/*.json")), name


@pytest.mark.parametrize(("name", "path"), EXAMPLES, ids=[example_id(c) for c in EXAMPLES])
def test_schema_agrees_with_folder(name: str, path: Path) -> None:
    assert is_valid(name, load(path)) == (path.parent.name == "valid")


@pytest.mark.parametrize(("name", "path"), EXAMPLES, ids=[example_id(c) for c in EXAMPLES])
def test_model_agrees_with_folder(name: str, path: Path) -> None:
    data = model_input(name, load(path))
    if path.parent.name == "valid":
        MODELS[name].model_validate(data)
    else:
        with pytest.raises(ValidationError):
            MODELS[name].model_validate(data)


# Pairs each model with its schema object, then each nested model with the schema object it
# stands for, found through $ref, oneOf branches and array items. allOf holds partial
# constraints (history-summary's if/then on perDay), not objects, so it isn't followed.


def nested_model(annotation: object) -> type[ContractModel] | None:
    if isinstance(annotation, type) and issubclass(annotation, ContractModel):
        return annotation
    for arg in get_args(annotation):
        if (found := nested_model(arg)) is not None:
            return found
    return None


def object_schema(node: Schema, root: Schema) -> Schema | None:
    node = resolve(node, root)
    if "properties" in node:
        return node
    branches = node.get("oneOf")
    for branch in branches if isinstance(branches, list) else []:
        assert isinstance(branch, dict)
        if (found := object_schema(branch, root)) is not None:
            return found
    items = node.get("items")
    if isinstance(items, dict):
        return object_schema(items, root)
    return None


def properties(node: Schema) -> dict[str, Schema]:
    props = node["properties"]
    assert isinstance(props, dict)
    return cast(dict[str, Schema], props)


def model_schema_pairs(
    model: type[ContractModel], node: Schema, root: Schema
) -> Iterator[tuple[type[ContractModel], Schema]]:
    yield model, node
    props = properties(node)
    for field in model.model_fields.values():
        assert field.alias is not None
        if field.alias not in props:
            continue  # the alias test reports it
        sub_model = nested_model(field.annotation)
        sub_schema = object_schema(props[field.alias], root)
        assert (sub_model is None) == (sub_schema is None), f"{model.__name__}.{field.alias}"
        if sub_model is not None and sub_schema is not None:
            yield from model_schema_pairs(sub_model, sub_schema, root)


def pairs(name: str) -> list[tuple[type[ContractModel], Schema]]:
    root = schema(name)
    return list(model_schema_pairs(MODELS[name], root, root))


def nullable(node: Schema, root: Schema) -> bool:
    node = resolve(node, root)
    types = node.get("type")
    if types == "null" or (isinstance(types, list) and "null" in types):
        return True
    branches = node.get("oneOf")
    return isinstance(branches, list) and any(isinstance(b, dict) and nullable(b, root) for b in branches)


@pytest.mark.parametrize("name", NAMES)
def test_aliases_match_schema(name: str) -> None:
    for model, node in pairs(name):
        aliases = {f.alias for f in model.model_fields.values()}
        assert aliases == set(properties(node)), model.__name__


@pytest.mark.parametrize("name", NAMES)
def test_required_and_not_null_match_schema(name: str) -> None:
    # A Python default of None also accepts an explicit null, so every field the schema lets
    # you leave out but not set to null has to be in NOT_NULL.
    root = schema(name)
    for model, node in pairs(name):
        required = node.get("required", [])
        assert isinstance(required, list)
        fields = model.model_fields.values()
        assert {f.alias for f in fields if f.is_required()} == set(required), model.__name__
        optional = {k: v for k, v in properties(node).items() if k not in required}
        assert model.NOT_NULL == {k for k, v in optional.items() if not nullable(v, root)}, model.__name__


@pytest.mark.parametrize("name", NAMES)
@pytest.mark.parametrize("data", [[], [1, 2], "x", None, 3])
def test_model_rejects_non_object(name: str, data: Json) -> None:
    with pytest.raises(ValidationError):
        MODELS[name].model_validate(data)


MISSING = object()
UUID = "0b9e7f42-5c1d-4a8e-b3f6-7d2a9c4e1b58"
TWENTY = [f"7949{i:02d}D" for i in range(20)]

# (id, schema name, valid example, path to the value, new value or MISSING to delete it,
# what the schema says). Each runs through both the schema and the model.
EDGES: list[tuple[str, str, str, tuple[str | int, ...], object, bool]] = [
    ("huge-speed", "crossing-event", "blocked-with-train", ("train", "speedMps"), 10**400, True),
    ("huge-confidence", "crossing-event", "blocked-with-train", ("train", "confidence"), 10**400, False),
    ("huge-negative-speed", "crossing-event", "blocked-with-train", ("train", "speedMps"), -(10**400), False),
    ("huge-battery-voltage", "heartbeat", "detecting", ("batteryVoltage",), 10**400, True),
    ("huge-duration", "blockage-event", "stopped", ("durationMin",), 10**400, True),
    ("huge-hour-average", "history-summary", "week", ("hours",), [10**400] * 24, True),
    ("confidence-is-boolean", "crossing-event", "blocked-with-train", ("train", "confidence"), True, False),
    ("speed-is-int", "crossing-event", "blocked-with-train", ("train", "speedMps"), 11, True),
    ("speed-null", "crossing-event", "blocked-with-train", ("train", "speedMps"), None, False),
    ("direction-null", "crossing-event", "blocked-with-train", ("train", "direction"), None, False),
    ("train-empty", "crossing-event", "blocked-with-train", ("train",), {}, True),
    ("classifier-null", "crossing-event", "blocked-with-train", ("classifierVersion",), None, False),
    ("log-only-int", "crossing-event", "blocked-with-train", ("logOnly",), 1, False),
    ("schema-version-true", "crossing-event", "minimal", ("schemaVersion",), True, False),
    ("schema-version-float", "crossing-event", "minimal", ("schemaVersion",), 1.0, True),
    ("node-id-empty", "crossing-event", "minimal", ("nodeId",), "", False),
    ("event-id-uppercase", "crossing-event", "minimal", ("eventId",), UUID.upper(), True),
    ("event-id-braces", "crossing-event", "minimal", ("eventId",), f"{{{UUID}}}", False),
    ("event-id-urn", "crossing-event", "minimal", ("eventId",), f"urn:uuid:{UUID}", False),
    ("event-id-number", "crossing-event", "minimal", ("eventId",), 3, False),
    ("uptime-whole-float", "heartbeat", "detecting", ("uptimeSec",), 5.0, True),
    ("uptime-fraction", "heartbeat", "detecting", ("uptimeSec",), 5.5, False),
    ("signal-dbm-absent", "heartbeat", "detecting", ("signalDbm",), MISSING, True),
    ("signal-dbm-null", "heartbeat", "detecting", ("signalDbm",), None, True),
    ("signal-dbm-boolean", "heartbeat", "detecting", ("signalDbm",), False, False),
    ("buffered-events-absent", "heartbeat", "detecting", ("bufferedEvents",), MISSING, True),
    ("sent-at-with-offset", "heartbeat", "detecting", ("sentAt",), "2026-10-08T16:14:30.000-05:00", True),
    ("sent-at-lowercase", "heartbeat", "detecting", ("sentAt",), "2026-10-08t21:14:30.000z", True),
    ("sent-at-no-millis", "heartbeat", "detecting", ("sentAt",), "2026-10-08T21:14:30Z", True),
    ("node-ids-empty-string", "crossing", "blocked", ("nodeIds",), [""], False),
    ("sensor-name-empty", "crossing", "blocked", ("sensor", "name"), "", False),
    ("battery-ok-string", "crossing", "blocked", ("sensor", "batteryOk"), "true", False),
    ("last-reading-null", "crossing", "blocked", ("lastReadingAt",), None, False),
    ("stopped-at-set", "crossing", "blocked", ("stoppedAt",), "2026-10-08T21:20:00.000Z", True),
    ("days-float", "history-summary", "week", ("days",), 7.0, True),
    ("days-true", "history-summary", "week", ("days",), True, False),
    ("count-negative", "history-summary", "week", ("count",), -1, False),
    ("per-day-negative", "history-summary", "week", ("perDay",), [1, 2, 1, 0, 2, 1, -1], False),
    ("longest-start-not-a-date", "history-summary", "week", ("longest", "start"), "yesterday", False),
    ("longest-empty", "history-summary", "week", ("longest",), {}, False),
    ("min-block-true", "device", "with-preferences", ("minBlockMin",), True, False),
    ("min-block-float", "device", "with-preferences", ("minBlockMin",), 3.0, True),
    ("min-block-null", "device", "with-preferences", ("minBlockMin",), None, False),
    ("alert-types-null", "device", "with-preferences", ("alertTypes",), None, False),
    ("alert-types-missing-one", "device", "with-preferences", ("alertTypes", "cleared"), MISSING, False),
    ("time-zone-null", "device", "with-preferences", ("timeZone",), None, False),
    ("time-zone-spaces", "device", "with-preferences", ("timeZone",), "America/New York", False),
    ("quiet-hours-null", "device", "with-preferences", ("quietHours",), None, True),
    ("quiet-hours-no-colon", "device", "with-preferences", ("quietHours", "start"), "2200", False),
    ("commute-windows-null", "device", "with-preferences", ("commuteWindows",), None, True),
    ("commute-windows-empty", "device", "with-preferences", ("commuteWindows",), [], True),
    ("commute-days-empty", "device", "with-preferences", ("commuteWindows", 0, "days"), [], False),
    ("commute-day-repeated", "device", "with-preferences", ("commuteWindows", 0, "days"), [1, 1], False),
    (
        "commute-day-repeated-as-float",
        "device",
        "with-preferences",
        ("commuteWindows", 0, "days"),
        [1, 1.0],
        False,
    ),
    ("commute-day-8", "device", "with-preferences", ("commuteWindows", 0, "days"), [8], False),
    ("subscriptions-empty", "device", "today", ("subscriptions",), [], True),
    ("subscriptions-twenty", "device", "today", ("subscriptions",), TWENTY, True),
    ("subscription-lowercase", "device", "today", ("subscriptions",), ["794980d"], False),
    ("updated-at-null", "device", "today", ("updatedAt",), None, False),
    ("health-signal-absent", "node", "at-crossing", ("health", "signalDbm"), MISSING, True),
    ("health-signal-null", "node", "at-crossing", ("health", "signalDbm"), None, True),
    ("health-buffered-absent", "node", "at-crossing", ("health", "bufferedEvents"), MISSING, True),
    ("health-uptime-boolean", "node", "at-crossing", ("health", "uptimeSec"), True, False),
    ("flags-number", "node", "at-crossing", ("flags",), [1], False),
    ("flags-set", "node", "at-crossing", ("flags",), ["battery-low"], True),
]


def edited(name: str, example: str, where: tuple[str | int, ...], value: object) -> dict[str, Json]:
    """A valid example with the value at where (keys and list indexes) replaced, or deleted."""
    data = load_object(CONTRACT / "examples" / name / "valid" / f"{example}.json")
    parent = cast(Json, data)
    for key in where[:-1]:
        if isinstance(parent, list) and isinstance(key, int):
            parent = parent[key]
        elif isinstance(parent, dict) and isinstance(key, str):
            parent = parent[key]
        else:
            raise AssertionError(f"{where}: no {key!r}")
    last = where[-1]
    if isinstance(parent, list) and isinstance(last, int):
        if value is MISSING:
            del parent[last]
        else:
            parent[last] = cast(Json, value)
    elif isinstance(parent, dict) and isinstance(last, str):
        if value is MISSING:
            del parent[last]
        else:
            parent[last] = cast(Json, value)
    else:
        raise AssertionError(f"{where}: no {last!r}")
    return data


@pytest.mark.parametrize(
    ("name", "example", "where", "value", "valid"), [e[1:] for e in EDGES], ids=[e[0] for e in EDGES]
)
def test_edges_agree_with_schema(
    name: str, example: str, where: tuple[str | int, ...], value: object, valid: bool
) -> None:
    data = edited(name, example, where, value)
    assert is_valid(name, data) == valid
    assert model_accepts(name, data) == valid


@pytest.mark.parametrize(
    "value",
    [
        "2026-10-08",
        "2026-10-08 21:14:03Z",
        "2026-10-08T21:14Z",
        "2026-10-08T21:14:03.250",
        "2026-10-08T21:14:03.250+0530",
        "2026-10-08T21:14:03,250Z",
        "2026-10-08T23:59:60Z",
        "2026-10-08T21:14:03+24:00",
        "2026-02-30T21:14:03.250Z",
        "20261008T211403Z",
        1760000000,
        None,
    ],
)
def test_times_the_schema_rejects(value: Json) -> None:
    # Pydantic's datetime parser is looser than the schema's date-time format, as is Python's
    # fromisoformat; IsoTime checks the same RFC 3339 pattern as the node's parse_time first.
    data = edited("heartbeat", "detecting", ("sentAt",), value)
    assert not is_valid("heartbeat", data)
    assert not model_accepts("heartbeat", data)


@pytest.mark.parametrize(
    ("name", "example", "where", "value"),
    [
        ("crossing-event", "minimal", ("crossingId",), "794980D\n"),
        ("crossing-event", "minimal", ("occurredAt",), "2026-10-08T21:13:41.080Z\n"),
        ("device", "with-preferences", ("quietHours", "start"), "22:00\n"),
        ("device", "with-preferences", ("timeZone",), "America/Chicago\n"),
    ],
    ids=["crossing-id", "occurred-at", "quiet-hours", "time-zone"],
)
def test_trailing_newline_is_rejected(
    name: str, example: str, where: tuple[str | int, ...], value: str
) -> None:
    # Python's jsonschema matches patterns with re.search, where $ also matches before a final
    # newline, so it lets these through. ajv in the app and the node's fullmatch don't.
    assert not model_accepts(name, edited(name, example, where, value))


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_numbers_are_rejected(value: float) -> None:
    # JSON can't carry them, so a schema check never sees one; the node refuses them too.
    assert not model_accepts("heartbeat", edited("heartbeat", "detecting", ("batteryVoltage",), value))
    assert not model_accepts("node", edited("node", "at-crossing", ("health", "enclosureTempC"), value))


def test_null_is_rejected_by_python_name_too() -> None:
    data = edited("heartbeat", "detecting", ("bufferedEvents",), MISSING)
    data["buffered_events"] = None
    assert not model_accepts("heartbeat", data)


def test_timing_matches_contract() -> None:
    timing = load_object(CONTRACT / "timing.json")
    checked = {
        "heartbeatSec": HEARTBEAT_INTERVAL_S,
        "nodeOfflineSec": NODE_OFFLINE_AFTER_S,
        "nodeCheckSec": NODE_CHECK_EVERY_S,
        "approachingMaxAgeSec": APPROACHING_MAX_AGE_S,
        "clearedMaxAgeSec": CLEARED_MAX_AGE_S,
        "followSyncSec": FOLLOW_SYNC_S,
    }
    for key, value in checked.items():
        assert value == timing[key], key
    blockage_checks = timing["blockageCheckMin"]
    assert isinstance(blockage_checks, list)
    assert BLOCKAGE_CHECKS_MIN == tuple(blockage_checks)
    # Freshness thresholds are the app's alone. A new key has to be placed on one side or the other.
    app_only = {"appDelayedSec", "appUnknownSec"}
    keys = {k for k in timing if not k.startswith("$")}
    assert keys == set(checked) | {"blockageCheckMin"} | app_only


def test_typical_min_samples_matches_contract() -> None:
    assert TYPICAL_MIN_SAMPLES == schema("history-summary")["x-typicalMinSamples"]
