# T1 Shared Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the node-to-server messages and the Firestore documents down once in `contract/`, and give the node, the server and the app each a typed copy plus a test that fails when the copy drifts.

**Architecture:** `contract/` holds JSON Schemas, example files sorted into `valid/` and `invalid/`, and `timing.json`. Each side runs every example through both the schema and its own code and expects the folder's verdict, so a new example file is picked up by all three sides without editing a test. Each side also checks its timing constants against `timing.json`.

**Tech Stack:** JSON Schema 2020-12; Python 3.11+ (node: dataclasses, no runtime deps), Python 3.12 + Pydantic v2 (server); uv, pytest, `jsonschema[format-nongpl]`, Ruff, strict Pyright; Jest + `ajv` (2020 draft) + `ajv-formats` in the Expo app.

**Spec:** `docs/superpowers/specs/2026-10-19-shared-contract-design.md`

## Global Constraints

- No field holds a node's coordinates, and no example contains a node key, FCM token or any other secret.
- Nothing in `edge/` may need Python newer than 3.11 or any runtime dependency (`dependencies = []`).
- Every schema uses `additionalProperties: false` at every object level.
- Message times are ISO 8601 UTC with milliseconds, like `2026-10-08T21:14:03.250Z`; examples always use that form.
- Crossing IDs in examples are `794980D` (Cooper St). Node IDs are `node-a`.
- Firestore timestamp fields are `format: date-time` strings tagged `"x-firestore": "timestamp"`.
- Example folders are `contract/examples/<name>/valid/` and `contract/examples/<name>/invalid/`, where `<name>` is the schema file name without `.schema.json`. Invalid file names say what is wrong.
- No change to `firestore.rules`, no CI workflow, no endpoints, no switch to `FirestoreSource`.
- No em dashes in docs or comments.
- Python commands run from `edge/` or `server/` with `uv run`; app commands run from `app/` with Node 22 (`export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`).

## Review Focus

1. **Booleans where numbers belong** (`"speedMps": true`, `"uptimeSec": true`): JSON Schema rejects them, but Python's `isinstance(True, int)` and Pydantic's lax mode accept them. Invalid examples `speed-is-boolean.json` (Task 1) and `uptime-is-boolean.json` (Task 1) make every side agree.
2. **Explicit null for a field that may be absent but not null** (`"train": null`, `"bufferedEvents": null`): the schema rejects it; a Python default of `None` accepts it. Invalid examples `train-null.json` and `buffered-events-null.json` (Task 1); handled in `from_dict` (Task 3) and `ContractModel` (Task 4).
3. **Times that aren't ISO strings with an offset** (`"occurredAt": 1760000000`, `"2026-10-08T21:14:03"`): Pydantic accepts both. Invalid examples `occurred-at-number.json` and `occurred-at-no-offset.json` (Task 1); `IsoTime` (Task 4). The node's `format_time` refuses naive datetimes and converts other offsets to `Z` (Task 3 test).
4. **A UUID without hyphens** (`"6f1c2a9e3b7d4f0a9a512d8e4b7c1f03"`): Pydantic's `UUID` accepts it, the schema's `uuid` format doesn't. Invalid example `event-id-no-hyphens.json` (Task 1).
5. **The wrong shape entirely** (`"train": [1, 2]`, a body that is a JSON array): must give `ContractError` on the node and a `ValidationError` on the server, never a `KeyError` or `TypeError`. Invalid example `train-not-object.json` (Task 1); `test_from_dict_rejects_non_object` (Task 3).

---

### Task 1: Message schemas, timing and examples

**Files:**
- Create: `contract/schemas/crossing-event.schema.json`, `contract/schemas/heartbeat.schema.json`
- Create: `contract/timing.json`, `contract/README.md`
- Create: `contract/examples/crossing-event/{valid,invalid}/*.json`, `contract/examples/heartbeat/{valid,invalid}/*.json`
- Modify: `CLAUDE.md` (repo layout table: add a `contract/` row)

**Interfaces:**
- Produces: the two schema files, the example folders, and `timing.json` with exactly these keys:
  `{"heartbeatSec": 30, "nodeOfflineSec": 90, "nodeCheckSec": 60, "appDelayedSec": 30, "appUnknownSec": 90, "approachingMaxAgeSec": 60, "clearedMaxAgeSec": 600, "blockageCheckMin": [1, 3, 5], "followSyncSec": 60}`

- [ ] **Step 1: Copy the two schemas** from `docs/artifacts/blueprint/08_design_class_diagrams.md` section 4 unchanged (CrossingEvent and Heartbeat blocks), each with a `"$id"` of `"https://mavradar.app/contract/<name>.schema.json"`.

- [ ] **Step 2: Write the valid examples.**
  - `crossing-event/valid/blocked-with-train.json`: the section 4 example.
  - `crossing-event/valid/minimal.json`: required fields only, `fromState: "clear"`, `toState: "approaching"`.
  - `heartbeat/valid/detecting.json`: every field, `signalDbm: -87`, `bufferedEvents: 0`.
  - `heartbeat/valid/no-signal.json`: `signalDbm: null`, no `bufferedEvents`, `status: "calibrating"`.

- [ ] **Step 3: Write the invalid examples.** Each is a valid example with one thing wrong.
  - `crossing-event/invalid/`: `missing-event-id`, `extra-field`, `bad-to-state` (`"parked"`), `bad-crossing-id` (`"794980d"`), `event-id-not-uuid` (`"abc"`), `event-id-no-hyphens`, `log-only-string` (`"false"`), `negative-speed`, `speed-is-boolean`, `train-null`, `train-not-object` (`[1, 2]`), `occurred-at-number`, `occurred-at-no-offset`, `schema-version-2`, `latitude-field` (`"latitude": 32.7`).
  - `heartbeat/invalid/`: `missing-sent-at`, `negative-uptime`, `uptime-is-boolean`, `bad-status` (`"sleeping"`), `log-only-string`, `buffered-events-null`, `latitude-field`.

- [ ] **Step 4: Write `contract/timing.json`** with the keys in Interfaces, and a `"$comment"` pointing to 08 section 4.

- [ ] **Step 5: Verify every example against its schema**

Run (repo root):
```bash
for n in crossing-event heartbeat; do
  uvx check-jsonschema --schemafile contract/schemas/$n.schema.json contract/examples/$n/valid/*.json || echo "VALID FAILED: $n"
  for f in contract/examples/$n/invalid/*.json; do
    uvx check-jsonschema -q --schemafile contract/schemas/$n.schema.json "$f" >/dev/null 2>&1 && echo "INVALID PASSED: $f"
  done
done
```
Expected: two `ok -- validation done` lines and no `FAILED` or `PASSED` lines.

- [ ] **Step 6: Write `contract/README.md`**: what each folder and `timing.json` is; the rule "Change the contract here first, in a PR everyone reviews, and update every side in that same PR"; the three test commands (`cd edge && uv run pytest`, `cd server && uv run pytest`, `cd app && npx jest contract`); and a note that `firestore.rules` allows only `uid`, `platform`, `subscriptions`, `quietHours`, `updatedAt` on devices until A3. Add the `contract/` row to the CLAUDE.md layout table.

- [ ] **Step 7: Commit**

```bash
git add contract CLAUDE.md
git commit -m "Contract: event and heartbeat schemas, examples and timing"
```

---

### Task 2: Firestore document schemas and examples

**Files:**
- Create: `contract/schemas/firestore/{crossing,blockage-event,history-summary,device,node}.schema.json`
- Create: `contract/examples/{crossing,blockage-event,history-summary,device,node}/{valid,invalid}/*.json`
- Modify: `docs/artifacts/blueprint/08_design_class_diagrams.md` section 4 (pointer line; summary table)

**Interfaces:**
- Consumes: the conventions from Task 1.
- Produces: five schemas. Each repeats its small definitions in its own `$defs` (no cross-file `$ref`): `timestamp` = `{"type": "string", "format": "date-time", "x-firestore": "timestamp"}`, `crossingId` = pattern `^[0-9]{6}[A-Z]$`, `reportedState` enum, `hhmm` = pattern `^([01][0-9]|2[0-3]):[0-5][0-9]$`.

- [ ] **Step 1: Write the schemas.** "Required" lists every field unless marked optional. "or null" means `["<type>", "null"]` (or `oneOf` with `null` for objects).
  - `crossing`: `state` reportedState; `since`, `stoppedAt`, `detectedAt`, `clearSince` timestamp or null; `lastReadingAt` timestamp; `sensor` `{name: string minLength 1, batteryOk: boolean}`; `nodeIds` array of string minLength 1, `maxItems: 2`; `alertMode` enum `logOnly`, `blockedAndCleared`, `all`; `updatedAt` timestamp.
  - `blockage-event`: `start`, `end` timestamp; `durationMin` number minimum 0; `stopped` boolean.
  - `history-summary`: root keyword `"x-typicalMinSamples": 5`; `days` enum `[7, 30]`; `count` integer minimum 0; `typicalMin`, `typicalStoppedMin` integer minimum 1 or null (description: null below 5 blockages); `longest` `{start: timestamp, durationMin: number minimum 0, stopped: boolean}` or null; `hours` 24 numbers minimum 0 (`minItems` and `maxItems` 24); `perDay` integers minimum 0, with `if days const 7 then perDay minItems/maxItems 7` and the same for 30; `updatedAt` timestamp.
  - `device`: required `uid` (string minLength 1), `platform` (enum `android`, `ios`), `updatedAt` timestamp. Optional: `subscriptions` (array of crossingId, `maxItems: 20`, `uniqueItems`); `quietHours` (`{start: hhmm, end: hhmm}` or null); `alertTypes` (`{approaching, blocked, stopped, cleared}` all boolean, all required); `minBlockMin` enum `[1, 3, 5]`; `commuteWindows` (array of `{days: integer 1 to 7, minItems 1, uniqueItems; start: hhmm; end: hhmm}`, or null); `timeZone` (string, pattern `^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$`). Description of `days`: ISO weekdays, 1 = Monday.
  - `node`: `crossingId`; `side` enum `atCrossing`, `east`, `west`; `lastSeenAt` timestamp; `status` enum `online`, `calibrating`, `offline`; `health` `{batteryVoltage: number, enclosureTempC: number, uptimeSec: integer minimum 0}` plus optional `signalDbm` (number or null) and `bufferedEvents` (integer minimum 0); `flags` array of string; `softwareVersion`, `mapVersion` string.

- [ ] **Step 2: Write the valid examples.**
  - `crossing/valid/`: `blocked.json` (`since`, `detectedAt`, `clearSince` set, `stoppedAt: null`, `alertMode: "blockedAndCleared"`, `nodeIds: ["node-a"]`), `clear.json` (all four nullable times null except `clearSince`), `no-nodes.json` (`nodeIds: []`, `state: "sensorOffline"`).
  - `blockage-event/valid/stopped.json`.
  - `history-summary/valid/`: `week.json` (`days: 7`, numbers set), `month-sparse.json` (`days: 30`, `typicalMin` and `typicalStoppedMin` null, `longest: null`, `count: 2`).
  - `device/valid/`: `today.json` (`uid`, `platform`, `updatedAt`, `subscriptions: ["794980D"]`), `with-preferences.json` (every optional field set, `commuteWindows: [{"days": [1,2,3,4,5], "start": "07:00", "end": "09:00"}]`, `timeZone: "America/Chicago"`).
  - `node/valid/at-crossing.json`.

- [ ] **Step 3: Write the invalid examples.**
  - `crossing/invalid/`: `bad-alert-mode`, `three-node-ids`, `missing-sensor`, `since-not-a-date` (`"yesterday"`), `extra-field`.
  - `blockage-event/invalid/`: `negative-duration`, `missing-end`.
  - `history-summary/invalid/`: `hours-23-values`, `per-day-wrong-length` (`days: 7`, 8 values), `typical-zero`, `days-14`.
  - `device/invalid/`: `twenty-one-subscriptions`, `bad-platform` (`"web"`), `quiet-hours-25`, `commute-day-zero`, `min-block-2`, `extra-field` (`"email"`), `missing-uid`.
  - `node/invalid/`: `latitude-field`, `bad-side` (`"north"`), `negative-buffered-events`.

- [ ] **Step 4: Verify** with the Task 1 Step 5 loop over `crossing blockage-event history-summary device node`, using `contract/schemas/firestore/$n.schema.json`.
Expected: five `ok -- validation done` lines and no `FAILED` or `PASSED` lines.

- [ ] **Step 5: Update 08 section 4.** Under the heading, add: "The source is now `contract/` at the repo root; this section describes it. Change `contract/` first." Replace the `summary/{range}` table with the Task 2 `history-summary` fields, and its closing line with "Same fields as the app's `BlockageStats` in `app/src/domain/stats.ts`, without the event list."

- [ ] **Step 6: Commit**

```bash
git add contract docs/artifacts/blueprint/08_design_class_diagrams.md
git commit -m "Contract: Firestore document schemas and examples"
```

---

### Task 3: Node contract (`edge/`)

**Files:**
- Create: `edge/pyproject.toml`, `edge/uv.lock` (generated), `edge/mavradar_edge/__init__.py`, `edge/mavradar_edge/contract.py`
- Test: `edge/tests/test_contract.py`

**Interfaces:**
- Consumes: `contract/examples/{crossing-event,heartbeat}/`, the two message schemas, `contract/timing.json`.
- Produces (`mavradar_edge.contract`), for E1 to E4:
  - `SCHEMA_VERSION = 1`, `HEARTBEAT_INTERVAL_S = 30` (comment: 08 section 4 and `contract/timing.json`)
  - `class ContractError(ValueError)`
  - `class ReportedState(StrEnum)`: `CLEAR, APPROACHING, BLOCKED, STOPPED, SENSOR_OFFLINE = "sensorOffline"`; `class Direction(StrEnum)`: `TOWARD, AWAY`; `class NodeStatus(StrEnum)`: `DETECTING, CALIBRATING, FAULTED`
  - `def format_time(t: datetime) -> str` and `def parse_time(s: str) -> datetime`
  - `@dataclass(frozen=True) class Train`: `speed_mps: float | None = None`, `direction: Direction | None = None`, `range_m: float | None = None`, `confidence: float | None = None`
  - `@dataclass(frozen=True) class CrossingEvent`: `event_id: str`, `node_id: str`, `crossing_id: str`, `from_state: ReportedState`, `to_state: ReportedState`, `occurred_at: datetime`, `log_only: bool`, `train: Train | None = None`, `classifier_version: str | None = None`
  - `@dataclass(frozen=True) class Heartbeat`: `node_id: str`, `sent_at: datetime`, `status: NodeStatus`, `state: ReportedState`, `log_only: bool`, `battery_voltage: float`, `enclosure_temp_c: float`, `uptime_sec: int`, `signal_dbm: float | None`, `software_version: str`, `map_version: str`, `buffered_events: int | None = None`
  - Each class has `def to_dict(self) -> dict[str, object]` (camelCase, adds `schemaVersion: 1`, omits optional fields that are `None`, always writes `signalDbm`) and `@classmethod def from_dict(cls, data: object) -> Self` that raises `ContractError` for anything the schema would reject.

- [ ] **Step 1: Write `edge/pyproject.toml`.** `name = "mavradar-edge"`, `requires-python = ">=3.11"`, `dependencies = []`; dependency group `dev = ["pytest>=8", "jsonschema[format-nongpl]>=4.23", "types-jsonschema", "ruff>=0.6", "pyright>=1.1.380"]`; `[tool.uv] package = false`; `[tool.pytest.ini_options] pythonpath = ["."]`, `testpaths = ["tests"]`; `[tool.ruff] target-version = "py311"`, `line-length = 110`, lint `select = ["E", "F", "I", "UP", "B"]`; `[tool.pyright] typeCheckingMode = "strict"`, `pythonVersion = "3.11"`, `include = ["mavradar_edge", "tests"]`. Run `uv sync`.

- [ ] **Step 2: Write the failing tests** in `edge/tests/test_contract.py`. `CONTRACT = Path(__file__).resolve().parents[2] / "contract"`. Parametrize over `sorted((CONTRACT / "examples" / name).glob("*/*.json"))` for `name` in `crossing-event`, `heartbeat`, with `ids` set to the relative path. Validator: `Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)`.

```python
def test_schema_agrees_with_folder(name, path): ...      # is_valid(example) == (path.parent.name == "valid")
def test_from_dict_agrees_with_folder(name, path): ...   # valid: no raise; invalid: pytest.raises(ContractError)
def test_valid_examples_round_trip(name, path): ...      # valid only: CLASS[name].from_dict(ex).to_dict() == ex
def test_from_dict_rejects_non_object():                 # [], "x", None, 3 -> ContractError, for both classes
def test_format_time():
    assert format_time(datetime(2026, 10, 8, 21, 14, 3, 250000, tzinfo=UTC)) == "2026-10-08T21:14:03.250Z"
    assert format_time(datetime(2026, 10, 8, 16, 14, 3, 250000, tzinfo=timezone(timedelta(hours=-5)))) == "2026-10-08T21:14:03.250Z"
    with pytest.raises(ContractError): format_time(datetime(2026, 10, 8, 21, 14, 3))
def test_timing_matches_contract():
    assert HEARTBEAT_INTERVAL_S == json.loads((CONTRACT / "timing.json").read_text())["heartbeatSec"]
```

- [ ] **Step 3: Run to see them fail**

Run: `uv run pytest -q`
Expected: collection error, `ModuleNotFoundError: No module named 'mavradar_edge'`.

- [ ] **Step 4: Implement `edge/mavradar_edge/contract.py`** with the Interfaces above. `from_dict` reads a `Mapping`, rejects unknown keys, rejects `None` for optional keys that are present, rejects `bool` where a number is expected, checks the UUID as the canonical hyphenated form (`str(UUID(s)) == s.lower()` and length 36), the crossing ID pattern, minimums and enums, and requires `schemaVersion == 1`. `parse_time` uses `datetime.fromisoformat` (which accepts `Z` on 3.11) and rejects results without an offset. Python 3.11 features only.

- [ ] **Step 5: Run the tests, lint and types**

Run: `uv run pytest -q && uv run ruff check && uv run ruff format --check && uv run pyright`
Expected: all tests pass; `All checks passed!`; `0 errors, 0 warnings, 0 informations`.

- [ ] **Step 6: Commit**

```bash
git add edge/pyproject.toml edge/uv.lock edge/mavradar_edge edge/tests
git commit -m "Node: contract dataclasses checked against contract/"
```

---

### Task 4: Server contract (`server/`)

**Files:**
- Create: `server/pyproject.toml`, `server/uv.lock` (generated), `server/app/__init__.py`, `server/app/contract.py`
- Test: `server/tests/test_contract.py`

**Interfaces:**
- Consumes: every schema and example in `contract/`, and `contract/timing.json`.
- Produces (`app.contract`), for S1 to S6:
  - Timing, one block with a comment pointing to 08 section 4: `HEARTBEAT_INTERVAL_S = 30`, `NODE_OFFLINE_AFTER_S = 90`, `NODE_CHECK_EVERY_S = 60`, `APPROACHING_MAX_AGE_S = 60`, `CLEARED_MAX_AGE_S = 600`, `BLOCKAGE_CHECKS_MIN = (1, 3, 5)`, `FOLLOW_SYNC_S = 60`, and `TYPICAL_MIN_SAMPLES = 5`.
  - Enums (`StrEnum`): `ReportedState`, `Direction`, `NodeStatus` (`detecting`, `calibrating`, `faulted`), `AlertMode`, `Platform`, `NodeSide`, `NodeOnline` (`online`, `calibrating`, `offline`).
  - `IsoTime = Annotated[AwareDatetime, BeforeValidator(_require_str)]` for message times; Firestore models use plain `AwareDatetime`.
  - `class ContractModel(BaseModel)` exactly as in `docs/PYTHON_BACKEND_GUIDE.md` section 2, plus `NOT_NULL: ClassVar[frozenset[str]] = frozenset()` and a `model_validator(mode="before")` that rejects a `None` value for any alias in `NOT_NULL`.
  - Messages: `TrainIn`, `CrossingEventIn`, `HeartbeatIn` (fields as in the guide; `event_id: UUID` with a before-validator requiring the hyphenated 36-character form; numbers `StrictFloat`, integers `StrictInt`, booleans `StrictBool`; `CrossingEventIn.NOT_NULL = {"train", "classifierVersion"}`, `HeartbeatIn.NOT_NULL = {"bufferedEvents"}`).
  - Firestore: `SensorDoc`, `CrossingDoc`, `BlockageEventDoc`, `LongestDoc`, `HistorySummaryDoc`, `QuietHoursDoc`, `AlertTypesDoc`, `CommuteWindowDoc`, `DeviceDoc`, `NodeHealthDoc`, `NodeDoc`, one field per schema property.
  - `MODELS: dict[str, type[ContractModel]]` mapping each schema name to its top-level model (`"crossing-event": CrossingEventIn`, ..., `"node": NodeDoc`).

- [ ] **Step 1: Write `server/pyproject.toml`.** Same layout as Task 3 Step 1 with `name = "mavradar-server"`, `requires-python = ">=3.12"`, `dependencies = ["pydantic>=2.9"]`, Ruff `target-version = "py312"`, Pyright `pythonVersion = "3.12"`, `include = ["app", "tests"]`. Run `uv sync`.

- [ ] **Step 2: Write the failing tests** in `server/tests/test_contract.py`. Schemas are found with `CONTRACT.glob(f"schemas/**/{name}.schema.json")`. A helper `firestore_values(value, schema)` walks the schema and turns every string under a property tagged `x-firestore: timestamp` (including inside `longest` and nullable `oneOf` branches) into a `datetime`; Firestore examples go through it before `model_validate`, message examples don't.

```python
def test_schema_agrees_with_folder(name, path): ...     # all seven names
def test_model_agrees_with_folder(name, path): ...      # valid: MODELS[name].model_validate(...) ok; invalid: pytest.raises(ValidationError)
def test_aliases_match_schema(name): ...                # recursively: {f.alias for f in model.model_fields.values()} == set(schema["properties"]) for every nested model/object pair
def test_timing_matches_contract():                     # each constant == timing.json value; BLOCKAGE_CHECKS_MIN == tuple(timing["blockageCheckMin"])
def test_typical_min_samples_matches_contract():        # TYPICAL_MIN_SAMPLES == history-summary schema["x-typicalMinSamples"]
```

- [ ] **Step 3: Run to see them fail**

Run: `uv run pytest -q`
Expected: collection error, `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 4: Implement `server/app/contract.py`** with the Interfaces above. `history-summary`'s `perDay` length must equal `days` (a `model_validator(mode="after")`), and `nodeIds`, `subscriptions`, `hours` and `commuteWindows[].days` get the schema's length and uniqueness limits through `Field`.

- [ ] **Step 5: Run the tests, lint and types**

Run: `uv run pytest -q && uv run ruff check && uv run ruff format --check && uv run pyright`
Expected: all tests pass; `All checks passed!`; `0 errors, 0 warnings, 0 informations`.

- [ ] **Step 6: Commit**

```bash
git add server/pyproject.toml server/uv.lock server/app server/tests
git commit -m "Server: Pydantic contract models checked against contract/"
```

---

### Task 5: App contract test (`app/`)

**Files:**
- Create: `app/src/data/firestore-mapping.ts`, `app/src/lib/device-doc.ts`
- Modify: `app/src/data/firestore-source.ts` (import `toReading` from the new file; delete its local copy and `ms`)
- Modify: `app/src/lib/push.ts:73-82` (build the payload with `devicePayload`)
- Modify: `app/src/domain/types.ts:6` (runtime list of states)
- Modify: `app/package.json` (dev dependencies)
- Test: `app/src/domain/__tests__/contract.test.ts`

**Interfaces:**
- Consumes: `contract/schemas/firestore/{crossing,blockage-event,history-summary,device}.schema.json`, their examples, `contract/timing.json`.
- Produces:
  - `types.ts`: `export const REPORTED_STATES = ['clear', 'approaching', 'blocked', 'stopped', 'sensorOffline'] as const;` and `export type ReportedState = (typeof REPORTED_STATES)[number];`
  - `firestore-mapping.ts`: `export function toReading(crossingId: string, d: DocumentData): CrossingReading`, where timestamps are anything with `toMillis(): number`. No import of `@/lib/firebase`, so Jest can load it.
  - `device-doc.ts`: `export function devicePayload<T>(uid: string, platform: string, updatedAt: T, subscriptions?: string[]): { uid: string; platform: string; updatedAt: T; subscriptions?: string[] }`, keeping today's `slice(0, 20)`. `registerDevice()` calls it with `serverTimestamp()`.

- [ ] **Step 1: Add the dev dependencies**

Run: `npm install --save-dev ajv@^8.17.1 ajv-formats@^3.0.1`
Expected: both appear under `devDependencies`; no native modules change.

- [ ] **Step 2: Write the failing test** `app/src/domain/__tests__/contract.test.ts`. `CONTRACT = path.resolve(__dirname, '../../../../contract')`. Ajv: `new Ajv2020({ allErrors: true, allowUnionTypes: true })` from `ajv/dist/2020`, `addFormats(ajv)`, and `ajv.addKeyword('x-firestore')`, `ajv.addKeyword('x-typicalMinSamples')`. Examples are read with `fs` and listed with `describe.each`.

```ts
describe.each(['crossing', 'blockage-event', 'history-summary', 'device'])('%s examples', (name) => {
  it.each(examples(name))('%s matches its folder', (file, ex, valid) => expect(validate(name)(ex)).toBe(valid));
});
it.each(examples('crossing', 'valid'))('%s maps to a CrossingReading', (_f, ex) => {
  const ts = (iso: string | null) => (iso ? { toMillis: () => Date.parse(iso) } : null);
  expect(toReading('794980D', { ...ex, since: ts(ex.since), stoppedAt: ts(ex.stoppedAt), detectedAt: ts(ex.detectedAt), clearSince: ts(ex.clearSince), lastReadingAt: ts(ex.lastReadingAt) }))
    .toEqual({ crossingId: '794980D', state: ex.state, since: ex.since && Date.parse(ex.since), stoppedAt: ex.stoppedAt && Date.parse(ex.stoppedAt), detectedAt: ex.detectedAt && Date.parse(ex.detectedAt), clearSince: ex.clearSince && Date.parse(ex.clearSince), lastReadingAt: Date.parse(ex.lastReadingAt), sensorName: ex.sensor.name, sensorBatteryOk: ex.sensor.batteryOk });
});
it('ReportedState matches the contract', () => expect([...REPORTED_STATES]).toEqual(schema('crossing').$defs.reportedState.enum));
it('what registerDevice writes is a valid device document', () => {
  expect(validate('device')(devicePayload('anon-uid', 'android', '2026-10-08T21:14:03.250Z', ['794980D']))).toBe(true);
  expect(validate('device')(devicePayload('anon-uid', 'ios', '2026-10-08T21:14:03.250Z'))).toBe(true);
});
it('freshness thresholds match the contract', () => {
  expect(Freshness.liveMaxSeconds).toBe(timing.appDelayedSec);
  expect(Freshness.delayedMaxSeconds).toBe(timing.appUnknownSec);
});
it('typical-time sample floor matches the contract', () => expect(TYPICAL_MIN_SAMPLES).toBe(schema('history-summary')['x-typicalMinSamples']));
```

- [ ] **Step 3: Run to see it fail**

Run: `npx jest contract`
Expected: FAIL, cannot find module `@/data/firestore-mapping` (and `@/lib/device-doc`).

- [ ] **Step 4: Implement** `firestore-mapping.ts`, `device-doc.ts`, `REPORTED_STATES`, and switch `firestore-source.ts` and `push.ts` to them, with the signatures in Interfaces. Move the shape comment from `firestore-source.ts` to `firestore-mapping.ts` and point it at `contract/schemas/firestore/crossing.schema.json`.

- [ ] **Step 5: Run the whole app suite, types and lint**

Run: `npm test --silent && npx tsc --noEmit && npm run lint`
Expected: all suites pass, including `contract.test.ts`; `tsc` prints nothing; lint shows only the existing `react-hooks/set-state-in-effect` error in `src/hooks/use-color-scheme.web.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/package-lock.json app/src/data app/src/lib/device-doc.ts app/src/lib/push.ts app/src/domain/types.ts app/src/domain/__tests__/contract.test.ts
git commit -m "App: contract test for the Firestore documents it reads and writes"
```
