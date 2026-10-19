# T1: Shared contract (design)

Jira: [SCRUM-41](https://traintrackingproject.atlassian.net/browse/SCRUM-41). Blueprint: `docs/artifacts/blueprint/09_build_order.md` (T1) and `08_design_class_diagrams.md` section 4.

## Why

The node, the server and the app are about to be built at the same time, by more than one person. They only work together if they agree on three things: what the node sends (events and heartbeats), what the server stores in Firestore, and the timing rules. T1 writes those down once, in `contract/`, and adds tests on every side that fail when a side drifts from it. After T1, E1 (node) and S1 (server) can start in parallel, and the app's live data work (A3 to A5) has a fixed target.

## Goals

- `contract/` is the single source of truth for every message and every Firestore document in section 4.
- Each side keeps its own copy in its own language, and a test on each side proves the copy matches `contract/`.
- The timing values live in one place per side and are checked against `contract/`.

## Non-goals

- No endpoints, no FastAPI app, no detector, no uplink, no Firestore writes. Those are S1 to S3 and E1 to E4.
- No change to `firestore.rules`. A3 adds the new device fields to the rules.
- No switch from `DemoEngine` to `FirestoreSource` (A5).
- No CI workflow. S1 sets up GitHub Actions; until then the tests run locally.
- The server's internal logs (event log, alert log, open blockages). Section 4 leaves their layout to the server.

## Anti-goals (would make this a failure even if the tests pass)

- Three hand-kept copies with nothing checking them against each other.
- Any field that holds a node's coordinates, or a node key or other secret in an example file.
- Anything in `edge/` that needs newer Python than 3.11 (the Pi's own Python) or a runtime dependency the Pi Zero has to install just for validation.

## What gets built

### `contract/`

```
contract/
  README.md
  timing.json
  schemas/
    crossing-event.schema.json      POST /events (08 section 4, as written)
    heartbeat.schema.json           POST /heartbeats (08 section 4, as written)
    firestore/
      crossing.schema.json          crossings/{usdotId}
      blockage-event.schema.json    crossings/{usdotId}/events/{blockageId}
      history-summary.schema.json   crossings/{usdotId}/summary/{range}
      device.schema.json            devices/{fcmToken}
      node.schema.json              nodes/{nodeId}
  examples/
    <schema name>/valid/*.json
    <schema name>/invalid/*.json    file name says what is wrong, e.g. missing-event-id.json
```

- **Schemas** are JSON Schema 2020-12 with `additionalProperties: false`. The two message schemas are copied from section 4 unchanged.
- **Firestore timestamps.** JSON has no Timestamp type, so in the Firestore schemas a timestamp field is an ISO 8601 UTC string (`format: date-time`) with the annotation `"x-firestore": "timestamp"`. Each side's test turns those fields into its own Timestamp type before checking its code against them.
- **Device document.** It lists today's fields (`uid`, `platform`, `updatedAt`, `subscriptions`, `quietHours`) and the planned A3 fields (`alertTypes`, `minBlockMin`, `commuteWindows`, `timeZone`), all optional except `uid`, `platform` and `updatedAt`, matching the merge write in `registerDevice()`. Times of day are 24-hour `"HH:MM"` strings in the phone's `timeZone`; commute `days` are ISO weekdays, 1 = Monday to 7 = Sunday, so section 4's `[1,2,3,4,5]` means weekdays. The app today only stores commute and quiet hours as on/off, so these shapes are what A3 will write. The README notes that `firestore.rules` only allows the first five until A3.
- **History summary.** Section 4 says it matches the app's `RangeStats` in `data/demo-history.ts`, which no longer exists. The app now computes `BlockageStats` in `app/src/domain/stats.ts`. The summary schema follows `BlockageStats` without its `events` list: `days`, `count`, `typicalMin` and `typicalStoppedMin` (null below `TYPICAL_MIN_SAMPLES`, 5), `longest` (`{ start, durationMin, stopped }` or null), `hours` (24 numbers), `perDay` (one number per day), `updatedAt`. Section 4 is updated to match.
- **Examples.** At least one valid example per schema, plus invalid ones covering: a missing required field, an extra field, a bad enum value, a bad crossing ID, a bad UUID, `logOnly` as the string `"false"`, a negative number where the schema says minimum 0, more than 20 subscriptions, and a node document with a latitude field. Crossing IDs in examples use `794980D`.
- **`timing.json`.** `heartbeatSec: 30`, `nodeOfflineSec: 90`, `nodeCheckSec: 60`, `appDelayedSec: 30`, `appUnknownSec: 90`, `approachingMaxAgeSec: 60`, `clearedMaxAgeSec: 600`, `blockageCheckMin: [1, 3, 5]`, `followSyncSec: 60`.
- **`README.md`.** What each file is; the rule "change the contract here first, in a PR everyone reviews, then update every side in the same PR"; how to run each side's contract test.
- **08 section 4** gets a line at the top saying `contract/` is now the source and section 4 describes it. The summary table is updated as above.

### Node: `edge/`

- `edge/pyproject.toml`: Python `>=3.11`, no runtime dependencies. Dev group: pytest, jsonschema, Ruff, Pyright (strict), managed with uv and a committed `uv.lock`. Only what the contract test needs; E1 adds the rest.
- `edge/mavradar_edge/contract.py`: frozen dataclasses `CrossingEvent`, `Train` and `Heartbeat`; a `ReportedState` enum; `to_dict()` producing the camelCase JSON; `from_dict()` that checks types, enums, the crossing ID pattern, UUIDs and minimums and raises `ContractError`. No schema library at runtime. The timing constants the node uses (heartbeat interval) are defined here with a comment pointing to section 4.
- The node never touches Firestore, so only the two message schemas apply here.
- `edge/tests/test_contract.py`: for every example under `crossing-event` and `heartbeat`, jsonschema agrees with its folder and `from_dict()` agrees with its folder; valid examples survive `from_dict()` then `to_dict()` unchanged; the constants equal `timing.json`.

### Server: `server/`

- `server/pyproject.toml`: Python 3.12, Pydantic v2 at runtime. Dev group as on the node. S1 adds FastAPI and the rest.
- `server/app/contract.py`: Pydantic models built on the guide's `ContractModel` base (camelCase aliases, `extra="forbid"`, frozen, `StrictBool` for booleans): `CrossingEventIn`, `TrainIn`, `HeartbeatIn`, and one model per Firestore document (`CrossingDoc`, `BlockageEventDoc`, `HistorySummaryDoc`, `DeviceDoc`, `NodeDoc`). Timing constants in one block with a comment pointing to section 4.
- `server/tests/test_contract.py`: for every example of every schema, jsonschema and the matching Pydantic model both agree with its folder; each model's field aliases equal its schema's property names, so a field added on one side only fails the test; the constants equal `timing.json`.

### App: `app/`

- Dev dependencies `ajv` and `ajv-formats` (JavaScript only, no native rebuild).
- `app/src/domain/__tests__/contract.test.ts`:
  - The Firestore examples the app reads (`crossing`, `blockage-event`, `history-summary`) pass or fail ajv as their folder says.
  - Each valid `crossing` example, with its timestamps turned into Timestamp-like objects, goes through `FirestoreSource`'s `toReading()` and gives the expected `CrossingReading`. `toReading()` gets exported for this.
  - The `ReportedState` values in `types.ts` equal the schema's enum.
  - The fields `registerDevice()` writes are all in the device schema.
  - `Freshness` in `constants/theme.ts` equals `appDelayedSec` and `appUnknownSec`, and `TYPICAL_MIN_SAMPLES` is what the summary schema describes.

## Done when

- Every example in `contract/examples/` passes or fails as its folder says, in pytest on the node and the server and in Jest in the app.
- The timing values are constants in one place per side and are tested against `timing.json`.
- `contract/README.md` states the change rule.
- Existing app tests still pass, along with `tsc`.

## Builder's calls

- Exact file names of examples, the wording of error messages and how `from_dict()` is organized.
- Whether the Python tests read the examples by walking `contract/examples/` or with a pytest parametrize over a glob (either is fine, as long as a new example file is picked up without editing the test).
- How Jest reaches `../contract` from `app/` (a relative `fs` read is fine).

## Calls made in planning (check these)

1. All five Firestore documents are in the contract, not just the two messages (your call).
2. The app gets a contract test too (your call).
3. Timestamps in the Firestore schemas are ISO strings tagged `x-firestore: timestamp` (my call).
4. The node validates with hand-written checks, not a schema library (my call, keeps the Pi light).
5. `timing.json` is new: one shared file that each side's constants are tested against (my call).
6. The history summary follows the app's current `BlockageStats`, not section 4's older table, and section 4 is updated (my call; the old shape points at a file that no longer exists).
7. Commute days are ISO weekdays (1 = Monday) and times of day are `"HH:MM"` in the phone's time zone (my call).
8. Python setup in `edge/` and `server/` is the minimum to run these tests; E1 and S1 add the rest (my call).
