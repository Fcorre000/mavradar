# 07 Design Patterns

Phase 6 of the blueprint. Patterns come out of the sequence diagrams, not the other way round. Every pattern here names the diagram and messages that call for it, the problem it solves there, the simpler alternative that was considered, and what it costs. A candidate with no diagram behind it was dropped. Some candidates were tested and rejected; their cards stay, so the reasoning isn't lost.

Message numbers refer to [05_sequence_diagrams.md](05_sequence_diagrams.md) (for example, "SD2 messages 15 and 16").

## Summary

| Pattern | Component | Applied to | Verdict | Motivated by |
| --- | --- | --- | --- | --- |
| [State](#state-detector) | edge | Detector | Adopt | 06 edge detector; SD1 messages 3 to 6 |
| [Strategy](#strategy-trainclassifier) | edge | TrainClassifier | Adopt, small | SD1 message 4 |
| [Adapter](#adapter-radarsource) | edge | RadarSource | Adopt | SD1 messages 1 to 3; SD10 messages 4 and 5 |
| [Strategy](#strategy-transport) | edge | Transport, under the Uplink | Adopt, small | SD1 messages 9 to 16; SD5 messages 5 and 6 |
| [Outbox](#outbox-eventbuffer) | edge | EventBuffer | Adopt | SD1 messages 6 to 16 |
| [Controller (GRASP)](#controller-ingestcontroller) | server | IngestController | Adopt | SD2 message 1; SD5 message 5; SD4 message 5, SD6 message 1, SD8 message 5 (the scheduled calls) |
| [Idempotent Receiver](#idempotent-receiver-eventlog) | server | EventLog | Adopt | SD2 messages 8 to 12 and 24; SD3 message 10; SD1 message 16 |
| [Facade](#facade-notificationservice) | server | NotificationService | Adopt | SD2 messages 19 to 23; SD4 messages 11, 19, 24; SD6 messages 13 and 14 |
| [Repository](#repository-firestore-access) | server | CrossingRepository, TokenRegistry, AlertLog, EventLog | Adopt | SD3; SD5 messages 18 to 21; SD6 messages 6 to 8; SD8 |
| [Adapter](#adapter-taskqueue) | server | TaskQueue over Cloud Tasks | Adopt, small | SD4 messages 2 to 5 |
| [Scheduled sync](#scheduled-sync-subscriptionmap) | server | SubscriptionMap, refreshed once a minute | Adopt (replaced Observer, D5) | SD8 messages 5 to 13; SD2 messages 16 and 17 |
| [Strategy, as a list of rules](#strategy-alertpolicy-rules) | server | AlertPolicy | Adopt | SD2 messages 15 to 18; SD4 messages 8 to 10, 16 to 18, 21 to 23; SD6 messages 9 to 12 |
| [Chain of Responsibility](#chain-of-responsibility-ingest-pipeline) | server | The ingest pipeline | **Rejected**: a plain ordered function | SD2 and SD3 |
| [Singleton](#singleton-warm-instance-state) | server | Warm-instance state | **Avoided**: dependency injection instead | SD2, SD4, SD5, SD6, SD8 |
| [Strategy and Adapter](#strategy-and-adapter-crossingsource-existing) | app | CrossingSource | Existing, keep | SD9 messages 7 to 10 |
| [Observer](#observer-store-existing) | app | Store with `useSyncExternalStore` | Existing, keep | SD9 messages 6 and 10 |
| [Facade](#facade-registerdevice-existing) | app | `registerDevice()` | Existing, keep | SD7 messages 2 to 16 |
| [Strategy for local alerts](#local-alerts-only-on-demo-data-oq10) | app | Alert delivery | Settles OQ10, no new class | SD2 (server side) vs the app's store |
| [State in the app](#state-in-the-app) | app | Crossing state mapping | **Rejected**: keep pure functions | SD9 messages 11 and 12 |

---

## Edge (Python, `edge/`)

### State: Detector

```
Pattern: State (Detector)
Component: edge
Motivated by: 06_state_machines.md, edge detector; SD1 messages 3 to 6
Problem: each detector state looks for different evidence. Tracking checks echo
  strength, duration and direction; TrainAtCrossing watches for the train stopping
  or its tail leaving; TrainStopped watches for motion. One long if/else on the
  current state would mix all of that, and every new rule would touch every branch.
Solution sketch: Detector holds a current DetectorState. Each state class
  implements on_detection(track, ctx) -> DetectorState and decides its own exits.
  A state change emits a CrossingEvent (06, "Which changes produce a CrossingEvent").
Alternative considered: a transition table (dict of state and condition to next
  state). Simpler to print, but the conditions differ so much per state that the
  table would just point at per-state functions, which is State without the name.
Cost: about seven small classes. Each fits on one screen, and each is testable alone.
Test seam: feed a recorded track to one state and assert the next state and event.
Portability: the classes take tracks in and return states and events. No SQLite,
  serial or HTTP inside, so they port to an ESP32-S3 (a stated goal).
```

### Strategy: TrainClassifier

```
Pattern: Strategy (TrainClassifier)
Component: edge
Motivated by: SD1 message 4 ("compare with BackgroundMap and current track")
Problem: "is this a train?" is the decision log-only weeks exist to tune
  (D1, 5.3 detection accuracy). The rules will change many times, and the team
  wants to compare a new rule against the current one on the same live data.
Solution sketch: TrainClassifier.classify(track, background_map) -> Verdict
  (not a train, train approaching, train present, train stopped). The State
  classes ask the classifier; they don't hold thresholds themselves.
  RuleBasedClassifier first. In log-only mode a second, shadow classifier can
  run on the same tracks and only log its verdicts.
Alternative considered: thresholds inside the State classes. Fine for one rule
  set, but every tuning change would edit the state machine.
Cost: one interface, one class to start.
Test seam: a fake classifier lets State tests force verdicts.
```

### Adapter: RadarSource

```
Pattern: Adapter (RadarSource)
Component: edge
Motivated by: SD1 messages 1 to 3; SD10 messages 4 and 5
Problem: the OPS243-C speaks its own serial protocol (JSON lines over USB, set up
  by command strings). The Detector and Calibrator should see Detections and range
  frames, not serial output.
Solution sketch: RadarSource protocol with detections() and range_frames().
  Ops243Source adapts the real radar over serial. ReplaySource reads a recorded
  log and plays it back in real time or faster.
Alternative considered: parse serial output inside the Detector. It would tie
  detection to the hardware and make testing need a radar.
Cost: one interface, two implementations.
Test seam: ReplaySource is the whole test strategy. The detector can be built
  and tested in Sprint 3 before the radar arrives, from recorded or synthetic logs.
Portability: porting to an ESP32-S3 means a new adapter, not a new detector.
```

### Strategy: Transport

```
Pattern: Strategy (Transport, under the Uplink)
Component: edge
Motivated by: SD1 messages 9 to 16; SD5 messages 5 and 6
Problem: the uplink is a swappable transport (Amendment 001). Host Wi-Fi, a
  point-to-point bridge, Ethernet and Cat-M all give the Pi an IP address, so
  today they are all one HTTPS client. LoRa would need a gateway and a different
  shape. Tests need to make the network fail on demand.
Solution sketch: Transport.post(path, body) -> Response, with a status and no
  exception for network errors. HttpsTransport now. The Uplink owns retries and
  the buffer; the Transport only moves bytes.
Alternative considered: Bridge, so link types and message kinds vary
  independently. Overkill: there is one message format (JSON over HTTPS) and only
  the link varies, and today it doesn't even vary in code.
Cost: one interface and one class. Its main value right now is the test seam.
Test seam: FakeTransport returns 200, 401, 422, timeouts or nothing on a script,
  which drives every branch of SD1.
```

### Outbox: EventBuffer

```
Pattern: Outbox (store and forward), not GoF
Component: edge
Motivated by: SD1 messages 6 to 16
Problem: an event must survive the link dropping, the server restarting, and the
  node rebooting, and must be sent exactly once from the node's point of view.
Solution sketch: the Detector writes each CrossingEvent to the SQLite EventBuffer
  before any send (message 6). A separate Uplink loop sends the oldest pending
  event, deletes it only on an acknowledgement or a permanent rejection (messages
  11 and 13), and otherwise backs off and retries with the same eventId
  (message 16). The server's Idempotent Receiver makes "at least once" safe.
Alternative considered: send first, buffer only on failure. Loses events when the
  node crashes mid-send, and puts the network inside the detection loop.
Cost: SQLite on the Pi (already planned) and one loop. On an ESP32 the buffer would
  be flash storage instead, behind the same small interface.
Test seam: an in-memory buffer for unit tests; a real SQLite file for a
  power-cut test.
```

---

## Server (FastAPI, `server/`)

### Controller: IngestController

```
Pattern: Controller (GRASP)
Component: server
Motivated by: SD2 message 1 and SD5 message 5 (each node use case enters here);
  SD4 message 5, SD6 message 1 and SD8 message 5 (the calls from Cloud Tasks and
  Cloud Scheduler, D5)
Problem: something has to receive each system event from the outside and decide
  which objects do the work, without doing the work itself.
Solution sketch: one thin route handler per use case: POST /events (UC1) and
  POST /heartbeats (UC2) for nodes, and POST /tasks/blockage-check,
  /tasks/check-nodes and /tasks/sync-devices for Google's schedulers. Each reads
  top to bottom like its sequence diagram and delegates every step.
Alternative considered: put the logic in the route functions. Fast to start, but
  untestable without HTTP and impossible to read against the diagrams.
Cost: none worth counting.
Test seam: call the handler with fakes for every collaborator.
```

### Idempotent Receiver: EventLog

```
Pattern: Idempotent Receiver (enterprise integration pattern), not GoF
Component: server
Motivated by: SD2 messages 8 to 12 and 24; SD3 message 10; SD1 message 16 (the
  retry that makes it necessary)
Problem: the node's Outbox sends at least once. A retry after a lost
  acknowledgement must not alert anyone twice. And because the server writes
  before it acknowledges (D5), a retry can also arrive after the push went out
  but the writes failed; that retry must finish the writes without pushing again.
Solution sketch: EventLog tracks each eventId through three states: new, pushed,
  done. check_and_mark(event_id) answers which one; mark_pushed after the push
  (SD2 message 24) and mark_done after the writes (SD3 message 10). Done means
  acknowledge and stop; pushed means skip the push and redo the writes. Recent
  ids live in memory and reload from the CrossingEvent log at startup.
Alternative considered: dedupe on the content (crossing, state, time). Fragile:
  two real changes can look alike, and clocks drift. A two-state log (seen or
  not) was the first draft; it would have lost the writes after a failure.
Cost: an eventId the node generates (OQ6), and a small in-memory map.
```

### Facade: NotificationService

```
Pattern: Facade (NotificationService)
Component: server
Motivated by: SD2 messages 19 to 23; SD4 messages 11, 19 and 24; SD6 messages 13 and 14
Problem: three callers (the hot path, the blockage checks, offline detection)
  would otherwise each know FCM HTTP v1, 500-token batching, channel ids, the
  high-priority and Time Sensitive flags, retries, and reading back invalid tokens.
Solution sketch: NotificationService.send(alert, tokens, channel) -> DeliveryReport
  (sent count, invalid tokens, failures). The channel decides the priority and
  the Time Sensitive flag, so service-status can never come out urgent.
Alternative considered: call the FCM client directly from each caller.
Cost: one class; nearly zero.
Test seam: a fake NotificationService records calls in controller and check tests.
  FCM's own dry-run mode tests the real one without delivering anything.
```

### Repository: Firestore access

```
Pattern: Repository
Component: server
Motivated by: SD3 (CrossingRepository, AlertLog, TokenRegistry, EventLog);
  SD5 messages 18 to 21; SD6 messages 6 to 8; SD8 messages 1, 2, 6 to 8
Problem: Firestore paths, document shapes, Timestamps and retries would otherwise
  spread across every service. Amendment 002 (4.2) already requires the token
  registry behind an interface, so multi-site work is additive.
Solution sketch: CrossingRepository (crossing documents, BlockageEvents, summary),
  TokenRegistry (device documents: load all, fetch changed since, delete), AlertLog
  (alerts and open blockage records), EventLog's persistence (the CrossingEvent
  log), NodeRepository (node health). Each takes and returns domain objects.
  Keys are USDOT crossing IDs (8.1).
Alternative considered: call the Firestore client from the services. Ties the hot
  path to the SDK and makes the Postgres "phase 2" in the architecture diagram a
  rewrite instead of a new implementation.
Cost: five small classes with in-memory twins for tests.
Test seam: in-memory repositories; the Firestore emulator for integration tests.
```

### Adapter: TaskQueue

```
Pattern: Adapter (TaskQueue over Cloud Tasks)
Component: server
Motivated by: SD4 messages 2 to 5
Problem: the blockage checks are Cloud Tasks (D5). BlockageChecks shouldn't know
  the Cloud Tasks client, queue paths, identity tokens or retry settings, and
  Cloud Tasks has no local emulator, so tests need a stand-in.
Solution sketch: TaskQueue.schedule(path, body, at) -> None. CloudTasksQueue
  creates an HTTP task with a Google-signed identity token for the scheduler's
  service account. FakeTaskQueue records tasks so a test can "fire" them.
Alternative considered: call the Cloud Tasks client from BlockageChecks. Works,
  but then no test can run the blockage flow without Google.
Cost: one interface, two small classes.
Test seam: FakeTaskQueue; fire each recorded task by calling the handler directly.
```

### Scheduled sync: SubscriptionMap

```
Pattern: Scheduled sync (a cache refreshed on a timer), not GoF. Replaced Observer (D5).
Component: server
Motivated by: SD8 messages 5 to 13; SD2 messages 16 and 17
Problem: the hot path must find a crossing's followers with no database read
  (a settled decision), yet follows change at any time. The first design used
  Observer: an always-open Firestore listener pushing changes into the map. With
  request-based billing the server has no CPU between requests, so a listener
  can't be relied on.
Solution sketch: at startup TokenRegistry loads every device into the map. Once a
  minute Cloud Scheduler calls /tasks/sync-devices; TokenRegistry.changed_since
  (last_sync) queries devices whose updatedAt is newer, and each one is upserted.
  SubscriptionMap answers followers(crossing_id) from memory, as before.
Alternative considered: keep the Observer listener with always-on CPU (about $45
  a month instead of about $5 to $10, D5), or read Firestore on every event
  (adds a read before every push, which the design rules out).
Cost: a follow or unfollow takes up to a minute to reach the server. About 1,440
  small reads a day.
Test seam: call the sync handler with an in-memory TokenRegistry.
```

### Strategy: AlertPolicy rules

```
Pattern: Strategy, as an ordered list of rules
Component: server
Motivated by: SD2 messages 15 to 18; SD4 messages 8 to 10, 16 to 18, 21 to 23;
  SD6 messages 9 to 12
Problem: who gets an alert depends on many independent conditions: the crossing's
  alert mode (D1, OQ19), the log-only flag, each device's alert types, quiet hours,
  commute windows and minimum blockage, lateness (OQ17), and what the device was
  already told (SD4). They will keep changing, and each needs its own tests.
Solution sketch: AlertRule.allows(alert, device, context) -> bool, one small class
  per condition. AlertPolicy.recipients(...) runs the list in order and returns the
  tokens plus the channel (train-alerts for train kinds, service-status otherwise).
  status unknown notes use a shorter list that skips types and quiet hours, as the
  app's shouldDeliver does today.
Alternative considered: one function with every condition inline. Readable at
  three conditions, not at nine, and hard to test one rule alone.
Cost: about nine tiny classes, each a few lines.
Test seam: test each rule alone, and the list order once.
```

### Chain of Responsibility: ingest pipeline

```
Pattern: Chain of Responsibility (rejected)
Component: server
Motivated by: SD2 and SD3 (authenticate, validate, dedupe, apply, pick
  recipients, push, write, acknowledge)
Problem considered: model each step as a handler that processes and passes on.
Why rejected: the steps aren't interchangeable handlers. They are a fixed
  sequence with early exits (401, 422, duplicate, retry later), and the order is
  the design (push before any write, acknowledge last). A chain hides that order
  in wiring, which is the opposite of what a five-person student team needs.
Chosen instead: a plain ordered function in the controller that reads like SD2
  and SD3. Authentication uses a FastAPI dependency (Depends), which is the
  framework's own mechanism for that one step.
```

### Singleton: warm-instance state

```
Pattern: Singleton (avoided)
Component: server
Motivated by: the in-memory state in SD2 (EventLog, CrossingTracker,
  SubscriptionMap), SD4 (AlertLog's open blockages), SD5 and SD6 (NodeMonitor)
Problem: this state must exist once per warm Cloud Run instance, which tempts
  module-level globals or Singletons.
Why avoided: a Singleton can't be swapped in tests, and hidden global state makes
  restart behavior (startup reloads in SD6 and SD8) hard to test.
Chosen instead: create each object once in FastAPI's lifespan handler, keep them
  on app.state, and hand them to handlers through Depends. Tests override the
  dependencies with fakes.
Note: memory survives between requests even with request-based billing; only
  the CPU pauses (D5). Cloud Run can still start a second instance under load,
  and each would hold its own copy of this state. That is safe for the
  SubscriptionMap, but two instances would disagree about a crossing's current
  state (CrossingTracker), could each accept the same retried event (EventLog),
  and would each run offline checks. So the service runs with max-instances=1
  (OQ20). The blockage checks no longer live in memory at all; they are Cloud
  Tasks. Phase 7 records what would move out of memory to scale.
```

---

## App (React Native, `app/`, already partly built)

These describe the code as it is. Nothing here asks for a redesign.

### Strategy and Adapter: CrossingSource (existing)

```
Pattern: Strategy and Adapter (CrossingSource), existing
Component: app
Motivated by: SD9 messages 7 to 10
What it is: CrossingSource (data/source.ts) is one interface with two
  implementations. DemoEngine and FirestoreSource are interchangeable strategies,
  and screens never know which is active. FirestoreSource is also an Adapter: it
  turns Firestore documents and Timestamps into the app's SourceSnapshot.
Keep: yes. OQ11 adds a history method next to subscribe() (Phase 7).
```

### Observer: Store (existing)

```
Pattern: Observer (Store with useSyncExternalStore), existing
Component: app
Motivated by: SD9 messages 6 and 10
What it is: CrossingSource.subscribe(listener) pushes snapshots into the Store,
  and screens subscribe to the Store through useSyncExternalStore, reading only
  the slice they need.
Keep: yes. Selectors must keep returning stable references (a lesson already
  learned in this codebase).
```

### Facade: registerDevice (existing)

```
Pattern: Facade (registerDevice), existing
Component: app
Motivated by: SD7 messages 2 to 16
What it is: one call hides permissions, notification channels, the push token,
  anonymous sign-in and the merge write. CLAUDE.md requires it to stay the single
  entry point, so the iOS token decision (OQ14) changes one function.
Keep: yes. OQ9 adds the alert preferences to what it writes.
```

### Local alerts only on demo data (OQ10)

```
Question: OQ10, should the app raise its own alerts on live data?
Motivated by: SD2 and SD4 (the server sends every live alert) against the app's
  store, which runs the alert rules on every snapshot (state/actions.ts onSnapshot)
Recommendation: local alerts only when source.kind is 'demo'. On live data the
  server is the only sender; otherwise every live alert arrives twice, both on
  train-alerts.
Pattern: none needed. CrossingSource.kind already says which strategy is active;
  the change is a one-line guard in onSnapshot, not a new class.
```

### State in the app

```
Pattern: State (rejected for the app)
Component: app
Motivated by: SD9 messages 11 and 12
Question from the brief: should the app's crossing state mapping mirror the edge's
  State classes, or stay as pure functions with tests (the current style)?
Recommendation: stay as pure functions. The app doesn't run the crossing state
  machine; it displays a state someone else decided. effectiveState() is a pure
  function of a reading, the clock and the connection, and stepAlerts() is a pure
  step from one memory to the next. Both are fully covered by Jest today. State
  classes would add objects with no behavior of their own.
```

## What this phase changes in the open questions

- **OQ10** gets its recommendation confirmed by the diagrams: local alerts on demo data only. Settled.
- **OQ20 (new), from the Singleton card:** run the Cloud Run service at **max-instances 1**. The current crossing state, the dedupe log, node last-seen times and open blockage records all live in one instance's memory, and a second instance would disagree with the first. One instance easily carries one crossing and a few hundred phones; Phase 7 records what would have to move out of memory to scale out.
- **Revised after Phase 7 by [D5](00_README.md#decisions):** request-based billing turned the in-process timers into Cloud Tasks (the TaskQueue card) and the Firestore listener into a scheduled sync (the Scheduled sync card, replacing Observer). The cards above already reflect that.
