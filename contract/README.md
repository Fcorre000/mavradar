# Contract

The one written definition of what the field node sends the server, what the server stores in Firestore, and the timing rules. The node (`edge/`), the server (`server/`) and the app (`app/`) each keep their own copy in code, and each side has a test that fails when its copy drifts from this folder.

`docs/artifacts/blueprint/08_design_class_diagrams.md` section 4 describes this folder.

## The rule

Change the contract here first, in a PR everyone reviews, and update every side in that same PR.

## What's here

| Path | What it is |
|---|---|
| `schemas/crossing-event.schema.json` | `POST /events` body: one state change seen by a node |
| `schemas/heartbeat.schema.json` | `POST /heartbeats` body: a node's health and current state, every 30 s |
| `schemas/firestore/` | Firestore document schemas (`crossings`, `events`, `summary`, `devices`, `nodes`) |
| `examples/<name>/valid/` | Examples that must pass the schema `schemas/**/<name>.schema.json` and each side's code |
| `examples/<name>/invalid/` | Examples that must fail. Each is a valid example with one thing wrong, and the file name says what |
| `timing.json` | Timing rules every side shares: heartbeat interval, offline and freshness thresholds, alert age limits, blockage checks, follow sync |

Schemas are JSON Schema 2020-12, with `additionalProperties: false` on every object. Message times are ISO 8601 UTC with milliseconds, like `2026-10-08T21:14:03.250Z`. In the Firestore schemas, a timestamp is a `date-time` string tagged `"x-firestore": "timestamp"`; each side's test turns those into its own Timestamp type.

No file here holds a node's coordinates, a node key, an FCM token or any other secret.

Adding an example is enough to test it: every side's test picks up new files in `examples/` on its own.

## Running the contract tests

```bash
cd edge && uv run pytest
cd server && uv run pytest
cd app && npx jest contract
```

To check the examples against the schemas alone, from the repo root:

```bash
uvx check-jsonschema --schemafile contract/schemas/heartbeat.schema.json contract/examples/heartbeat/valid/*.json
```

## Device fields and the Firestore rules

The device schema also lists the preference fields A3 will write (`alertTypes`, `minBlockMin`, `commuteWindows`, `timeZone`). Until A3 updates `firestore.rules`, the rules only allow `uid`, `platform`, `subscriptions`, `quietHours` and `updatedAt` on a device document.
