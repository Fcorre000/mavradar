# MavRadar Handoff: Design Blueprint (Use Cases to Design Patterns)

For: a Claude Code session in the `mavradar` repo
Written: 2026-10-08, end of Sprint 2 (official end Oct 12)
Output folder: `docs/artifacts/blueprint/`

## 0. Why this exists

The frontend is being designed, but no backend or edge code has been written yet. `server/` and `edge/` are only READMEs. Before Sprint 3 turns code-heavy, the team wants a blueprint, so five people don't each invent their own structure and leave a spaghetti repo behind.

The method is the Agile Unified Methodology (Kung) chain the team already knows from the design patterns course:

```
SRS requirements -> use cases -> traceability matrix -> domain model
  -> expanded use cases -> scenario tables -> sequence diagrams
  -> design patterns -> design class diagram + module map -> build order
```

This is a **design session, not a coding session.** The only files written are markdown docs under `docs/artifacts/blueprint/`. Interface signatures and pseudocode may appear inside those docs; nothing goes into `app/src`, `server/`, or `edge/`.

The output also feeds the course's next deliverables. The Architectural Design Spec and Detailed Design Spec come after the SRS (due Oct 23), and use cases, sequence diagrams and class diagrams go straight into them.

## 1. Read first

1. `CLAUDE.md` (root). The hard rules and the settled decisions are binding here.
2. `docs/MAVRADAR_HANDOFF.md`, then amendments 001 to 003 in order. The amendments win where they disagree.
3. `docs/artifacts/MavRadar_Architecture_Diagram.png`: the current software architecture picture.
4. The SRS draft. It lives in Confluence: page "MavRadar SRS: Work Split and Draft" (ID `18776065`, in the Course Deliverables folder, space `SCRUM` on traintrackingproject.atlassian.net). If this session has no Atlassian access, use Appendix A, which lists every requirement ID, name and priority.
5. Existing code that already encodes design decisions. The blueprint must describe these as they are, or flag a deliberate change. It must not invent a parallel design.
   - `app/src/data/source.ts`: the `CrossingSource` interface. `DemoEngine` implements it today; `FirestoreSource` replaces it later, and screens never know which one is active.
   - `app/src/domain/types.ts`: `ReportedState` (`clear | approaching | blocked | stopped | sensorOffline`), `CrossingReading`, `BlockageEvent`, `SourceSnapshot`.
   - `app/src/domain/freshness.ts`, `alerts.ts`, `copy.ts`, `clusters.ts`, and their Jest tests.
   - `app/src/lib/push.ts`: `registerDevice()`, the single token-registration entry point.
   - `app/src/state/store.ts`: the external store read through `useSyncExternalStore`.
   - `firestore.rules`: the `crossings/{usdotId}`, `crossings/{usdotId}/events/{eventId}` and `devices/{fcmToken}` shapes.
   - `server/README.md` and `edge/README.md`: the hot path, the swappable transport, and the SQLite buffer.

## 2. Settled decisions (do not relitigate)

These come from `CLAUDE.md` and the handoffs. Diagrams must respect them.

- The push goes first and the Firestore write after. A database write never blocks a notification. Latency is the tiebreaker.
- Pushes use FCM HTTP v1 **token multicast, not topics**. Subscriptions come from an in-memory crossing-to-token map on the warm Cloud Run instance, kept fresh by a Firestore snapshot listener, so the hot path does no Firestore read.
- Cloud Run runs in `us-central1` with `min-instances=1`. It is not Cloud Functions. The FCM credential stays off the Pi.
- Firebase Anonymous Auth, no accounts. Device docs are keyed on the push token, not the uid. The token registry sits behind an interface (Amendment 002, 4.2).
- Data is keyed by USDOT crossing ID. A BlockageEvent log exists from the first deploy.
- Two notification channels: `train-alerts` carries only real train events; `service-status` carries everything else (node offline, degraded detection, tests).
- On the edge, the uplink is a swappable transport, and events survive dropouts in a local SQLite buffer until the ingest API acknowledges them.
- The node starts in log-only mode: it detects and logs but sends no public alerts until the detection and false-alarm rates are measured.
- Edge hardware is a Pi Zero 2 W for now. A later port to an ESP32-S3 is possible once detection is tuned. Keep the detection core free of Linux-only assumptions, so the state machine and rules could be ported.

## 3. Rules for this session

- Work on a branch, e.g. `docs/blueprint`. The team does not push to main; this lands through a PR. Commit or push only when Fernando says so.
- Draw every diagram in **Mermaid** (`sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `flowchart`), so GitHub renders it with no tooling. Mermaid has no use case diagram type, so draw that one as a `flowchart LR` with actors on the outside and use cases as rounded nodes inside a subgraph boundary.
- Validate the Mermaid before calling a phase done. If `npx -y @mermaid-js/mermaid-cli` works on this machine (Chrome is installed), render each file once. Otherwise say the diagrams were not render-checked.
- Every artifact must trace both ways: SRS requirement, then use case ID, then expanded-use-case step, then sequence diagram, then class or module. The traceability matrix in `00_README.md` is the single place requirement numbers appear next to use case IDs, because SRS numbering may still shift before Oct 23.
- Stop at each **GATE** below, summarize what changed, and wait for Fernando before starting the next phase.
- Don't put the field unit's deployment coordinates anywhere. In any siting note, assume the node is 50+ ft from the nearest rail.
- Writing style: no em dashes, concise, human tone. Use "The system shall..." wording only when restating a requirement.
- When something is a judgment call, write it as an open question in the doc with your recommendation. Don't silently decide it.

## 4. Output files

```
docs/artifacts/blueprint/
  00_README.md                 index, how to read, traceability matrix, open questions
  01_use_cases.md              actors, use case list, use case diagram
  02_domain_model.md           conceptual class diagram (no methods)
  03_expanded_use_cases.md     two-column expanded use cases, nontrivial steps marked
  04_scenario_tables.md        scenario descriptions + tables for nontrivial steps
  05_sequence_diagrams.md      one sequence diagram per nontrivial step, failure paths included
  06_state_machines.md         crossing state, node freshness, edge detector
  07_design_patterns.md        one justification card per pattern
  08_design_class_diagrams.md  per component: classes, interfaces, module map
  09_build_order.md            Sprint 3 candidate tasks in dependency order
```

## 5. The plan, phase by phase

### Phase 0: Inventory (no files yet)

Read section 1, then write a short list of what the existing app code already decides, plus any place where the docs and the code disagree. Report it in chat before Phase 1.

### Phase 1: Actors, use cases, traceability

Actors (verify and adjust):

| Actor | Kind | Notes |
| --- | --- | --- |
| App User | Primary, human | Driver, student, commuter. No account. |
| City Staff | Primary, human | Uses the dashboard. Paying customer in the market model. |
| Sensor Node | Primary, system | Starts the most important use cases. |
| Maintainer | Primary, human | Team member who tunes and services the node. |
| Clock | Time trigger | Only if offline detection is server-side (see Open Question 2). |
| FCM, Firestore | Secondary | Supporting systems, not use case starters. |

A Kung use case starts with an actor, ends with that actor, and completes a business task for that actor. Starting list to verify against the SRS:

| ID | Use case | Actor | SRS reqs | Depth |
| --- | --- | --- | --- | --- |
| UC1 | Report Crossing Event | Sensor Node | 3.1, 3.2, 3.3, 5.1 | Full |
| UC2 | Report Node Health | Sensor Node | 5.7, 7.1 | Full |
| UC3 | Detect Offline Node | Clock (or folded into UC6) | 5.7, 3.4 | Full, after OQ2 |
| UC4 | Follow a Crossing | App User | 3.6, 3.3, 3.5 | Full |
| UC5 | Set Quiet Hours | App User | 3.6 | Brief |
| UC6 | View Crossing Status | App User | 3.4, 6.6 | Brief (mockup covers it) |
| UC7 | Open Train Alert | App User | 3.3, 3.4 | Full (deep link from notification) |
| UC8 | View Blockage History | App User, City Staff | 3.8, 3.7 | Brief |
| UC9 | Calibrate Background Map | Maintainer | 3.2, 5.3 | Full (edge-only) |
| UC10 | Update Node Software | Maintainer | 7.2 | Brief, later |

"Receive Train Alert" is deliberately not a use case of its own, because the user doesn't start it. The alert is a postcondition of UC1, and the user's own action is UC7.

Deliverables:
- `01_use_cases.md`: actors, the list, and the use case diagram.
- The traceability matrix in `00_README.md`: requirements as rows, use cases as columns, an X where a use case satisfies a requirement, the SRS priority on each row, and a check that every Critical and High requirement in sections 3 and 5 is covered.

**GATE 1.**

### Phase 2: Domain model

`02_domain_model.md`: a conceptual `classDiagram` with attributes, associations and multiplicities, and no methods. Candidates: Crossing, SensorNode, Detection (raw radar track), CrossingEvent (state transition), BlockageEvent, Heartbeat, Device, Subscription, QuietHours, Alert.

Reuse the names in `domain/types.ts` where they already exist. If the domain model needs a concept the app types lack (Heartbeat, SensorNode), note it; don't rename existing types.

**GATE 2.**

### Phase 3: Expanded use cases

`03_expanded_use_cases.md`: the full use cases (UC1, UC2, UC3, UC4, UC7, UC9) in Kung's two-column format, using the template in Appendix B.
- Mark each **nontrivial step**: one that needs background processing beyond displaying something. Only nontrivial steps go on to Phases 4 and 5.
- Include the alternate flows that matter. UC1: duplicate event, no uplink (buffered and retried), a node in log-only mode, an invalid FCM token returned. UC4: notification permission denied, offline at registration time.

**GATE 3.**

### Phase 4: Scenario tables

`04_scenario_tables.md`. For each nontrivial step:
1. A scenario description in plain sentences: who does what, with what data, to which object.
2. The Kung scenario table (Appendix B).

Use the same object names the sequence diagrams will use.

### Phase 5: Sequence diagrams and state machines

`05_sequence_diagrams.md`: one Mermaid `sequenceDiagram` per scenario table, with `alt`/`opt` blocks for the failure paths from Phase 3. The UC1 diagram is the most important file in the blueprint. It must show:
- the push to FCM before the Firestore write;
- the in-memory crossing-to-token lookup (no Firestore read in the hot path);
- `eventId` dedupe;
- channel selection (`train-alerts` vs `service-status`);
- pruning of invalid tokens after the FCM response;
- the node's SQLite buffer and the ack.

`06_state_machines.md`:
- Crossing state machine (`clear`, `approaching`, `blocked`, `stopped`, `sensorOffline`), with every legal transition and what triggers it.
- The app's freshness rule (Live, Delayed, Unknown), matched to `freshness.ts`.
- The edge detector's states, including log-only mode and calibration.

**GATE 4** (covers Phases 4 and 5 together).

### Phase 6: Design patterns

`07_design_patterns.md`: patterns must come out of the sequence diagrams, not be picked first. Every pattern gets a justification card (Appendix B) naming the diagram and message that motivate it, the alternative considered, and the cost. A pattern with no diagram behind it is dropped.

Candidates to test, not to adopt blindly:

**Edge (Python):**
- **State**: the detector state machine. Detection rules live in state classes, not a long if/else chain.
- **Strategy**: the classifier rules behind one interface, so the rule-based classifier can be swapped or A/B'd in log-only mode.
- **Adapter**: a `RadarSource` interface over the OPS243-C serial protocol. A recorded-log replay source can stand in for the real radar in tests, and porting to the ESP32 means swapping one adapter.
- **Strategy or Bridge**: `Transport` (WiFi HTTP now, Cat-M if the exception is approved).
- **Outbox (store and forward)**: the SQLite buffer. Not GoF, but name it properly.

**Server (FastAPI):**
- **Controller (GRASP)**: thin route handlers, one per use case, delegating to services.
- **Facade**: a `NotificationService` that hides FCM HTTP v1, multicast batching, channel selection and token pruning.
- **Repository**: `TokenRegistry` (already required by Amendment 002, 4.2) and `CrossingRepository`.
- **Observer**: the Firestore snapshot listener that keeps the in-memory subscription map fresh.
- **Strategy**: the alert filter policy (followed crossings, quiet hours, dedupe window).
- **Chain of Responsibility** for the ingest pipeline (auth, validate, dedupe, filter, push, persist). Evaluate it honestly: a plain ordered function pipeline may be clearer for a five-person student team, and choosing that is a valid outcome.
- Watch for **Singleton** creeping in for the warm-instance cache. Prefer FastAPI dependency injection (`Depends`) so tests can swap it.

**App (already partly built):**
- `CrossingSource` is Strategy plus Adapter, and `subscribe(listener)` with `useSyncExternalStore` is Observer. Document these as existing; don't redesign them.
- `registerDevice()` is a small Facade. Keep it the single entry point (CLAUDE.md).
- Decide whether the crossing state mapping in the app should mirror the server's State classes, or stay as pure functions with tests (current style). Recommend; don't change the code.

**GATE 5.**

### Phase 7: Design class diagrams and module map

`08_design_class_diagrams.md`, per component (`edge/`, `server/`, `app/`):
- A `classDiagram` with the methods the sequence diagrams require. Each method should trace to a message in a Phase 5 diagram.
- The interfaces written out as Python `Protocol`s or TypeScript `interface`s, inside markdown code blocks only.
- The proposed folder and module layout for `server/` and `edge/`, e.g. `server/app/{api,services,repositories,domain}` and `edge/mavradar_edge/{radar,detector,transport,buffer}`. For `app/`, map the existing files and propose only minimal additions.
- A shared contract section: the JSON schema of the node-to-server event and heartbeat payloads, and the `crossings/{usdotId}` document. This is what lets edge and server be built in parallel by different people.

**GATE 6.**

### Phase 8: Build order

`09_build_order.md`: candidate Sprint 3 tasks in dependency order. Each task names its use case, the files it creates, and a definition of done that includes tests. Suggested order:
1. Shared event contract.
2. Edge replay source plus detector (testable with no hardware).
3. Server ingest and the NotificationService against the FCM dry-run mode.
4. Firestore writes.
5. `FirestoreSource` in the app.

Don't create Jira issues. Fernando decides what goes into Sprint 3.

**Done when:** all ten files exist, every Critical and High requirement in sections 3 and 5 traces to at least one sequence diagram, every pattern has a card, the Mermaid renders (or is marked unchecked), the open questions are listed in `00_README.md`, and the branch is ready for a PR.

## 6. Open questions to surface (recommend; don't decide)

1. **Where does the crossing state machine live?** Either the edge sends state transitions and the server validates them, or the edge sends raw detections and the server derives the state. Draw both as sequence diagrams for UC1. The starting lean is the edge, because it has the data and it removes a round trip, but show the tradeoff (one node versus two nodes per crossing later, when two nodes have to agree).
2. **Is offline detection server-side (UC3 with a Clock actor) or client-side** (the app's existing freshness rule on `lastReadingAt`)? A push on `service-status` needs the server side. The status screen already works client-side.
3. **Node authentication to the ingest API:** a per-node API key in Secret Manager, or something stronger? The key never goes in the repo.
4. **City dashboard (3.7):** in this semester's scope, or a brief use case only?
5. **`stopped` vs `blocked`:** confirm the difference is still meaningful for users or only for the history log.

## Appendix A: SRS requirements (draft as of Oct 8)

Priority in brackets. The source of truth is the Confluence page; numbers may shift.

- **3 Customer:** 3.1 Approaching Train Detection [Critical]; 3.2 Stopped Train Detection [Critical]; 3.3 Real-Time Push Alerts [Critical]; 3.4 Live Crossing Status Screen [Critical]; 3.5 Free Access Without an Account [High]; 3.6 Notification Preferences [Moderate]; 3.7 City Dashboard [High]; 3.8 Blockage History [High]; 3.9 Android App on Google Play [High]; 3.10 Project Web Page and Blog [Moderate]
- **4 Packaging:** 4.1 Two-Enclosure Sensor Node [Critical]; 4.2 Post Mounting Hardware [High]; 4.3 Solar Panel and Mount [High]; 4.4 Preloaded Node Software [High]; 4.5 App Distribution Through Google Play [High]; 4.6 Enclosure Labeling [Low]
- **5 Performance:** 5.1 Alert Latency [Critical] (inside the 30 to 45 s gate window); 5.2 Detection Range [Critical] (radar rated 1 to 100 m); 5.3 Detection Accuracy [High]; 5.4 Battery Autonomy [Critical]; 5.5 Solar Energy Balance [High]; 5.6 Operating Temperature [High]; 5.7 Node Heartbeat and Offline Detection [High]; 5.8 Backend Capacity [Moderate]
- **6 Safety:** 6.1 LOTO [Critical]; 6.2 NEC Wiring [Critical]; 6.3 Railroad Right-of-Way Setback [Critical]; 6.4 Battery Safety [Critical]; 6.5 Certified Radio Components [Critical]; 6.6 Informational Use Only Disclaimer [High]
- **7 Maintenance:** 7.1 Remote Health Monitoring [High]; 7.2 Remote Software Updates [Moderate]; 7.3 Installation and Maintenance Guide [High]; 7.4 Source Code Availability [High]; 7.5 Field-Replaceable Parts [Moderate]
- **8 Other:** 8.1 Multiple Nodes and Crossings [Moderate]; 8.2 Public Crossing Status API [Moderate]; 8.3 User Privacy [High]; 8.4 Cross-Platform App Codebase [High]; 8.5 Development Budget [Critical]
- **9 Future:** 9.1 Second Sensor Node; 9.2 iOS Release; 9.3 Blockage Prediction; 9.4 Dispatch System Integration; 9.5 City Pilot at Multiple Crossings; 9.6 Camera Confirmation Layer

Sections 4 and 6 are mostly hardware and process. They need no use cases, but they should appear as rows in the matrix marked "n/a (hardware/process)", so it's clear they weren't missed. 8.1 is the extensibility requirement that should shape the Repository and keying choices.

## Appendix B: Templates

### Expanded use case (Kung two-column)

```
UC1: Report Crossing Event
Actor: Sensor Node
Precondition: Node is registered and calibrated; ingest API reachable or buffer available.
Postcondition: Followers notified on train-alerts (if not log-only); crossing doc and event log updated.
Requirements: 3.1, 3.2, 3.3, 5.1

| Actor Input                                   | System Response                                  |
| --------------------------------------------- | ------------------------------------------------ |
| 1) Node detects a state change and POSTs ...  | 2) **System authenticates and validates ...**    |
|                                               | 3) **System sends push to followers ...**        |
| 5) Node receives ack and clears buffer entry. | 4) System returns ack with eventId.              |

Alternate flows:
2a) Duplicate eventId: system returns the original ack and sends nothing.
...
```

Bold marks a nontrivial step.

### Scenario table (Kung)

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | IngestController | receives | event payload | |
| 2 | IngestController | asks to verify | node key | NodeAuthenticator |
| ... | | | | |

### Pattern justification card

```
Pattern: Facade (NotificationService)
Component: server
Motivated by: 05_sequence_diagrams.md, UC1 step 3, messages 6 to 9
Problem: the controller would otherwise know FCM batching, channel ids, priority flags, and token pruning.
Solution sketch: NotificationService.notify(crossingId, alertType) -> DeliveryReport
Alternative considered: call the FCM client directly from the controller.
Cost: one extra class; nearly zero.
Test seam: a fake NotificationService records calls in controller tests.
```

## Note for the course

Generated with help from Claude (Anthropic). The syllabus requires citing AI use, so keep this line in `00_README.md`.
