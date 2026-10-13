# Python Backend Guide

How we write `server/` so a Python service stays fast, strict and easy to debug. Read this before writing server code. The blueprint (`docs/artifacts/blueprint/`, especially 07 to 09) says *what* to build; this says *how* to write it.

## Why Python (decided 2026-10-13)

We looked at rewriting the backend in Rust and decided to stay with Python and FastAPI:

- **Firebase support.** The Firebase Admin SDK officially supports Node.js, Java, Python and Go, but not Rust. Push notifications are the most important call we make, and in Python they're one official function.
- **Speed doesn't decide this.** We handle about 6,000 requests a day. Alert speed depends on the network and on FCM, not on our code, and one always-warm Cloud Run instance removes cold starts. Rust would save a few milliseconds and a dollar or two a month.
- **Team and schedule.** The node is already Python, the team knows it, and the blueprint assumes it.

What we wanted from Rust was its strictness: the compiler catching a missed state or an unhandled error. Most of that is available in Python if we use the tools below and make CI enforce them. That's the point of this guide.

Revisit only if someone on the team is already fluent in async Rust, we grow to many crossings with heavy traffic, or we drop the always-warm instance.

---

## 1. Tooling (set up in S1)

| Tool | What it does for us |
| --- | --- |
| **uv** | Installs dependencies from `pyproject.toml` and pins exact versions in `uv.lock`. Everyone and the Docker image get the same packages. |
| **Ruff** | Linter and formatter in one. Run `ruff check` and `ruff format`. |
| **Pyright, strict mode** | Static type checking. This is our "compiler". Set `typeCheckingMode = "strict"` in `pyproject.toml`. |
| **pytest** | Tests. Use `pytest-asyncio` (or anyio) for async code. |
| **pre-commit** | Runs Ruff, Pyright and a secret scanner (gitleaks) before each commit. This also covers the pre-push secret check we wanted. |

**CI (GitHub Actions) must fail the pull request** if Ruff, Pyright or the unit tests fail. A type checker that only runs when someone remembers to run it doesn't protect anything.

Python version: use 3.12 for the server image. The node runs the Pi's own Python (3.11 on Raspberry Pi OS Bookworm; check with `python3 --version`), so nothing in `edge/`, including `edge/mavradar_edge/contract.py`, can use a newer feature. The server's Pydantic `contract.py` only runs in the server image.

## 2. Strict types: get the Rust benefits in Python

**Every request body is a Pydantic v2 model.** Bad input gets rejected with a 422 before it reaches our logic.

```python
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool
from pydantic.alias_generators import to_camel

class ContractModel(BaseModel):
    """Base for every contract model: camelCase on the wire, snake_case in Python."""
    model_config = ConfigDict(extra="forbid", frozen=True, alias_generator=to_camel, populate_by_name=True)

class TrainIn(ContractModel):
    speed_mps: float | None = Field(default=None, ge=0)
    direction: Literal["toward", "away"] | None = None
    range_m: float | None = Field(default=None, ge=0)
    confidence: float | None = Field(default=None, ge=0, le=1)

class CrossingEventIn(ContractModel):
    schema_version: Literal[1]
    event_id: UUID
    node_id: str = Field(min_length=1)
    crossing_id: str = Field(pattern=r"^[0-9]{6}[A-Z]$")
    from_state: CrossingState
    to_state: CrossingState
    occurred_at: datetime
    log_only: StrictBool
    train: TrainIn | None = None
    classifier_version: str | None = None
```

- `extra="forbid"` rejects fields we didn't define, so a typo in the node's payload fails loudly.
- `frozen=True` makes events immutable once parsed.
- `alias_generator=to_camel` keeps the JSON in the contract's camelCase (`eventId`, `toState`, `occurredAt`) while Python uses snake_case. Without it, `extra="forbid"` would reject every real event.
- **Don't set `strict=True` on the whole model.** FastAPI validates the parsed JSON body in Python mode, where strict mode rejects ISO date strings and enum values, so every request would fail with a 422. Make single fields strict where coercion would be wrong instead: `log_only` is `StrictBool` so `"false"` or `1` can't sneak through as a boolean.
- These models live in `server/app/contract.py` and match `contract/schemas/`. Change the contract there first, in a PR everyone reviews.

**States are an Enum, and every `match` is exhaustive.** This is the closest thing to Rust's compiler-checked `match`:

```python
from enum import StrEnum
from typing import assert_never

class CrossingState(StrEnum):
    CLEAR = "clear"
    APPROACHING = "approaching"
    BLOCKED = "blocked"
    STOPPED = "stopped"
    SENSOR_OFFLINE = "sensorOffline"

def alert_for(state: CrossingState) -> AlertKind | None:
    match state:
        case CrossingState.BLOCKED:
            return AlertKind.BLOCKED
        case CrossingState.STOPPED:
            return AlertKind.STOPPED
        case CrossingState.CLEAR:
            return AlertKind.CLEARED
        case CrossingState.APPROACHING | CrossingState.SENSOR_OFFLINE:
            return None
        case _:
            assert_never(state)  # Pyright fails here if a state is missing
```

If someone adds a sixth state and forgets a branch, Pyright fails the build.

**Make "missing" and "failed" explicit.**

- Use `X | None` for anything that can be absent, and handle the `None` case. Pyright strict won't let you skip it.
- For calls that can fail in expected ways (FCM, Firestore), return a small result type, not a bare exception that someone forgets to catch:

```python
@dataclass(frozen=True)
class PushResult:
    sent: int
    failed: int
    invalid_tokens: list[str]
```

**Rules:**

- No `Any` in our own code. No `# type: ignore` without a comment saying why.
- Domain code (`app/domain/`) is pure functions with no I/O. It's the easiest code to test and the most important to get right.

## 3. Async and concurrency

FastAPI runs on an event loop, so blocking calls need care.

- **Route handlers are `async def`.**
- **The Firebase Admin messaging calls are blocking.** Wrap them: `await asyncio.to_thread(messaging.send_each_for_multicast, msg)`. Never call a blocking SDK function directly inside an `async def`, or every other request waits.
- **For Firestore, use the async client** (`firebase_admin.firestore_async` or `google.cloud.firestore.AsyncClient`).
- **Protect in-memory state.** The SubscriptionMap, EventLog and open blockages are shared by every request. Do any check-and-set, like "is this event ID new? mark it as seen", in one step with no `await` in between, or under an `asyncio.Lock`. Otherwise two resends of the same event can both get through and alert twice.
- **One process.** Run uvicorn with `--workers 1`. Each extra worker would get its own copy of the in-memory maps, and they would disagree. Cloud Run handles concurrency, and `max-instances=1` keeps it to one copy (see blueprint 08, section 5).

## 4. Cloud Run rules

- **Finish everything before you respond.** With request-based billing, the server gets almost no CPU after the response is sent. That means:
  - no FastAPI `BackgroundTasks` for real work
  - no fire-and-forget `asyncio.create_task`
  - the order is always: push, finish the writes, then reply
  - anything delayed goes through Cloud Tasks, and anything periodic goes through Cloud Scheduler
- **Build clients once.** Create the Firebase app, the Firestore client and the FCM client in the FastAPI `lifespan`, not per request.
- **No key files.** On Cloud Run the service uses its attached service account through Application Default Credentials. Locally, use `gcloud auth application-default login` or the emulator. A `serviceAccountKey.json` should never exist in the repo or the image.
- **Small image:**
  - `python:3.12-slim`, multi-stage build, `uv sync --frozen --no-dev`
  - run as a non-root user
  - turn on Cloud Run's startup CPU boost, so redeploys come up fast
- **Health and shutdown.** `GET /healthz` returns quickly with no database call. On SIGTERM, finish in-flight requests. Cloud Run gives about 10 seconds.

## 5. The hot path: timeouts, retries, errors

- **Set timeouts on every outbound call.** Use the Firebase app's `httpTimeout` option, and timeouts on Firestore calls. A hung call must fail fast, not stall an alert. Start with a few seconds and adjust after measuring.
- **FCM errors:**
  - "unregistered" and "invalid argument" responses mean the token is dead. Collect those tokens and delete them after the writes.
  - 429 and 5xx get a short, bounded retry with backoff.
  - Never retry forever.
- **If a Firestore write fails, return 503.** The node resends, the EventLog recognizes the event ID, and the server finishes the writes without a second push (blueprint SD3).
- **Measure latency on every event.** Log the time between receiving the event, sending the push and finishing the writes. That's how we show SRS 5.1 (alert latency) is met.

## 6. Security

- **Node keys** come from Secret Manager. Compare them with `hmac.compare_digest`, never `==`.
- **The `/tasks/*` routes** only accept requests carrying a Google-signed OIDC token from our scheduler service account. Verify it with `google.oauth2.id_token.verify_oauth2_token`, and check both the audience and the service account email.
- **Distrust the sensor's clock.** Use the server's receive time for freshness and offline checks (blueprint UC2).
- **Limit request body size** and reject anything that doesn't match the contract.
- **Never log secrets.** If you log a push token, log only the last 6 characters.

## 7. Logging

- Log JSON lines to stdout. Cloud Logging picks them up and makes the fields searchable.
- Every log line about an event includes `event_id`, `node_id` and `crossing_id`, so one event can be traced end to end.
- Log levels:
  - `INFO` for each event and alert
  - `WARNING` for retries and pruned tokens
  - `ERROR` only for things a person should look at

## 8. Testing

| Layer | How |
| --- | --- |
| Domain (state machine, alert rules) | Plain pytest, table-driven: every legal and illegal state change has a row. Fast, no I/O. |
| Services | In-memory repositories (`repositories/memory.py`), a fake FCM client and `FakeTaskQueue`. |
| Firestore | Integration tests against the Firestore emulator (`FIRESTORE_EMULATOR_HOST`). |
| FCM | Dry-run mode (`dry_run=True`) in staging, so messages are validated without reaching phones. |
| Contract | Both server and node validate every file in `contract/examples/`: valid ones pass, invalid ones fail. |
| Order of operations | A test fails if Firestore is touched before the push (blueprint S2). |

Aim for full branch coverage on `app/domain/` and the alert rules. Coverage elsewhere matters less than these.

## 9. What not to do

- Don't read Firestore in the hot path. Use the in-memory maps.
- Don't create SDK clients per request.
- Don't use `BackgroundTasks` or `create_task` for work that must finish.
- Don't run more than one uvicorn worker.
- Don't call blocking SDK functions directly in `async def`.
- Don't use `Any` or untyped `dict`s for data that has a contract.
- Don't commit keys, `.env` files or deployment coordinates.

## Checklist for every server PR

- [ ] Ruff, Pyright (strict) and unit tests pass in CI
- [ ] New request or response shapes are Pydantic models on `ContractModel` (camelCase aliases, no extras), and the contract was updated first if it changed
- [ ] Any new `match` on an Enum ends with `assert_never`
- [ ] Outbound calls have timeouts, and expected failures are handled
- [ ] Nothing runs after the response is sent
- [ ] Tests cover the new branches, with in-memory fakes or the emulator
