# MavRadar Design Blueprint

From requirements to design patterns, before Sprint 3 turns code-heavy. The goal is one shared structure for `edge/`, `server/` and `app/`, so five people build the same system instead of five versions of it.

The method is Kung's Agile Unified Methodology, the chain the team knows from the design patterns course:

```
SRS requirements -> use cases -> traceability matrix -> domain model
  -> expanded use cases -> scenario tables -> sequence diagrams
  -> design patterns -> design class diagram + module map -> build order
```

This is design only. Interface signatures and pseudocode may appear in these files; no code goes into `app/src`, `server/` or `edge/` from this work. The brief that started it is [`../MAVRADAR_DESIGN_BLUEPRINT_HANDOFF.md`](../MAVRADAR_DESIGN_BLUEPRINT_HANDOFF.md).

## Files

| File | Contents | Status |
| --- | --- | --- |
| `00_README.md` | This index, decisions, traceability matrix, open questions | Updated each phase |
| [`01_use_cases.md`](01_use_cases.md) | Actors, use case list, use case diagram | Phase 1, done |
| [`02_domain_model.md`](02_domain_model.md) | Conceptual class diagram (no methods) | Phase 2, done |
| [`03_expanded_use_cases.md`](03_expanded_use_cases.md) | Two-column expanded use cases, nontrivial steps marked | Phase 3, done |
| [`04_scenario_tables.md`](04_scenario_tables.md) | Scenario descriptions and tables for nontrivial steps | Phase 4, done |
| [`05_sequence_diagrams.md`](05_sequence_diagrams.md) | One sequence diagram per scenario, failure paths included | Phase 5, done |
| [`06_state_machines.md`](06_state_machines.md) | Crossing state, app freshness, node liveness, edge detector | Phase 5, done |
| [`07_design_patterns.md`](07_design_patterns.md) | One justification card per pattern | Phase 6, done |
| [`08_design_class_diagrams.md`](08_design_class_diagrams.md) | Classes, interfaces, module map and the shared contract | Phase 7, done |
| [`09_build_order.md`](09_build_order.md) | Sprint 3 candidate tasks in dependency order | Phase 8, done |

## How to read it

- **Start with the use cases**, then follow one use case down the chain. UC1 (Report Crossing Event) is the spine of the whole system and the best one to follow first.
- **Requirement numbers live only in the matrix below.** Every other file names use cases (UC1), steps (UC1 step 3) and messages. SRS numbering may shift before the SRS is due on Oct 23, and this way a renumbering is one edit.
- **Every artifact traces both ways:** requirement, then use case, then expanded use case step, then sequence diagram, then class or module. If a class can't point back to a message in a sequence diagram, it doesn't belong.
- **Diagrams are Mermaid**, so GitHub renders them with no tooling.
- **Judgment calls are open questions**, each with a recommendation. Nothing in here quietly decides something the team hasn't.

## Settled decisions this builds on

From `CLAUDE.md` and the handoff with its three amendments. The diagrams respect these; they are not up for debate here.

- Push first, Firestore write after. A database write never blocks a notification. Latency is the tiebreaker.
- FCM HTTP v1 token multicast, not topics. Subscriptions come from an in-memory crossing-to-token map on the warm Cloud Run instance, so the hot path reads nothing from Firestore. (The map was to be kept fresh by a Firestore snapshot listener; D5 replaced that with a once-a-minute sync.)
- Cloud Run in `us-central1` with `min-instances=1`, not Cloud Functions. The FCM credential stays off the Pi.
- Firebase Anonymous Auth, no accounts. Device docs are keyed on the push token, not the uid. The token registry sits behind an interface.
- Data is keyed by USDOT crossing ID, with a blockage log from the first deploy.
- Two notification channels: `train-alerts` for real train events only, `service-status` for everything else.
- On the edge, the uplink is a swappable transport, and events wait in a local SQLite buffer until the ingest API acknowledges them.
- Every node starts in log-only mode: it detects and logs, but sends no public alerts until detection and false-alarm rates are measured.
- The detection core stays free of Linux-only assumptions, so it could move from the Pi Zero 2 W to an ESP32-S3 later.

## Decisions

Made during this blueprint. Each one records who decided and when.

### D1: All alert types, switched on in stages (Fernando, 2026-10-08)

MavRadar sends every kind of crossing alert: **approaching, blocked, stopped and cleared**, plus "status unknown" notes on `service-status`. They switch on in stages, per crossing:

1. **Log-only.** The node detects and logs; nobody is notified. Every node starts here.
2. **Blocked, stopped and cleared.** These can wait for a confirmed blockage (the user's minimum blockage time), so a false alarm is rare.
3. **Approaching.** This one can't wait to confirm without losing the warning it exists for, so it is switched on only once the false-alarm rate is measured and acceptable.

Why: the SRS asks for approaching alerts inside the 30 to 45 s gate window, which is what nodes spaced down the track are for (D4). But a false approaching alert spends the one-shot `train-alerts` channel, so it earns its place with data first. UC13 (Set Crossing Alert Mode) is the use case that carries this.

Consequence for the app, noted and not acted on here: its alert rules (`app/src/domain/alerts.ts`) have no `approaching` kind today.

### D2: One node per crossing now, two later (Fernando, 2026-10-08)

Everything this semester is designed, built and tested for **exactly one node** at Center St. The funded future goal is a node on each side of the crossing, working together to give early warning from both directions. The design only has to make that second node additive: node health lives on the node, a crossing can be watched by up to two nodes, and nothing assumes there is only ever one. Nothing in Sprint 3 builds two-node agreement.

This settles OQ12. It also shapes OQ1: with one node, the node's own state machine is the whole story; deciding which side owns the crossing state when two nodes disagree is future work.

### D3: City service on the back burner (Fernando, 2026-10-08)

No city dashboard work for now. The app is the focus. What cities get was never settled as a dashboard; it is more likely an open API, and that gets decided later. City Staff is out of this semester's use cases, and requirement 3.7 is deferred. The public status API (UC11) is the natural place a city service would start.

This settles OQ4.

### D4: One node goes at the crossing; two get spaced out (Fernando, 2026-10-08)

While there is only one node, it goes **at the crossing**, within radar range of it (still on private property and 50+ ft from the nearest rail). From there it sees blocked, stopped and cleared directly, which the app's trust rule needs. When a second node is funded, the two are **spaced out**, one on each side of the crossing, for early warning from both directions.

This settles OQ18. It changes the placement in Amendment 003 and `CLAUDE.md` (550 m down the track), so those need updating; see "Docs outside this blueprint to update" below. It matches the SRS draft as written.

Consequences:

- **Approaching alerts carry little warning with one node.** The radar reaches about 100 m, so a node at the crossing sees a train only a few seconds before it arrives, usually after the gates are already down. The approaching *state* still shows in the app (the SRS's status screen asks for it); whether an approaching *push* is worth sending with one node is OQ19.
- **With two spaced nodes, the crossing itself is out of view again,** so blocked and cleared become timing estimates, now from both sides (a train enters past one node and leaves past the other), and long stopped freight trains usually stay in a node's view. That is future work; the state machine already allows for it.
- **OQ1 gets easier.** A node at the crossing observes every state directly, so there is even less reason for the server to derive state from raw detections.

### D5: Request-based Cloud Run; background work as scheduled requests (Fernando, 2026-10-09)

The server runs on Cloud Run with **request-based billing, min-instances 1 and max-instances 1**. With request-based billing a Cloud Run instance gets CPU only while it handles a request, so the design has no background work at all:

- **Every write finishes before the response.** The push still goes first; then the Firestore writes; then the acknowledgement to the node (this revises OQ13). If the writes fail, the node gets "try again later" and resends; the server skips the push the second time (EventLog's new, pushed and done states).
- **Blockage checks are Cloud Tasks.** Three tasks per blockage, at 1, 3 and 5 minutes, each calling `/tasks/blockage-check`. They survive restarts, so OQ16's restart reload goes away.
- **The offline check is a Cloud Scheduler job** calling `/tasks/check-nodes` once a minute.
- **The follower map is synced once a minute** by a second Cloud Scheduler job calling `/tasks/sync-devices`, which fetches only the device documents changed since the last sync. It replaces the always-open Firestore listener from Amendment 002. The point of that rule, no database read before a push, still holds. **Trade-off:** a new follow or unfollow takes up to a minute to reach the server.
- **The 30-second `lastReadingAt` refresh stays** (OQ7), because the app's freshness rule needs it. It is free at our scale.

Why: always-on CPU (instance-based billing) needs at least 1 full vCPU, about **$44.71 a month** after the free tier. Request-based billing with one warm instance costs **at most $9.86 a month** at the idle rate, likely about $5 after the free tier. Cloud Scheduler gives 3 free jobs per billing account (we use 2), and Cloud Tasks 1 million free operations a month (we use about 5,000). Prices are us-central1, read from Google's pricing pages on 2026-10-09: cloud.google.com/run/pricing, /scheduler/pricing and /tasks/pricing, plus the Cloud Run billing settings and CPU limits docs (fractional CPU requires request-based billing; request-based billing allocates CPU "only during request processing").

This settles OQ21. It came from comparing the blueprint with the team's Confluence page "Cloud and Database Options for MavRadar", whose rule 6 ("finish the database write before the server responds") the blueprint had missed.

## Traceability matrix

Requirements are rows, use cases are columns. Requirement IDs, names and priorities come from the SRS draft in Confluence ("MavRadar SRS: Work Split and Draft", page 18776065), read on 2026-10-08.

- **X** = the use case satisfies the requirement.
- **s** = the use case supports or observes it, but doesn't satisfy it alone.
- **n/a** = hardware or process; no use case is expected. Listed so it's clear nothing was missed.

| Req | Name | Priority | Notes | UC1 | UC2 | UC3 | UC4 | UC5 | UC6 | UC7 | UC8 | UC9 | UC10 | UC11 | UC12 | UC13 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.1 | Approaching Train Detection | Critical |  | X |  |  |  |  |  |  |  |  |  |  |  | s |
| 3.2 | Stopped Train Detection | Critical |  | X |  |  |  |  |  |  |  | X |  |  |  |  |
| 3.3 | Real-Time Push Alerts | Critical |  | X |  | s | X |  |  | X |  |  |  |  |  | s |
| 3.4 | Live Crossing Status Screen | Critical |  |  | s | X |  |  | X | X |  |  |  |  |  |  |
| 3.5 | Free Access Without an Account | High |  |  |  |  | X |  | X |  |  |  |  |  |  |  |
| 3.6 | Notification Preferences | Moderate |  |  |  |  | X | X |  |  |  |  |  |  |  |  |
| 3.7 | City Dashboard | High | Deferred (D3); a city service would likely start from UC11 |  |  |  |  |  |  |  |  |  |  | s |  |  |
| 3.8 | Blockage History | High |  | X |  |  |  |  |  |  | X |  |  |  |  |  |
| 3.9 | Android App on Google Play | High | n/a (release process, see 4.5) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 3.10 | Project Web Page and Blog | Moderate | n/a (content); UC11 covers the public status page |  |  |  |  |  |  |  |  |  |  | s |  |  |
| 4.1 | Two-Enclosure Sensor Node | Critical | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4.2 | Post Mounting Hardware | High | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4.3 | Solar Panel and Mount | High | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4.4 | Preloaded Node Software | High | n/a (process) |  |  |  |  |  |  |  |  |  | s |  |  |  |
| 4.5 | App Distribution Through Google Play | High | n/a (process) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4.6 | Enclosure Labeling | Low | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 5.1 | Alert Latency | Critical |  | X |  |  |  |  |  |  |  |  |  |  |  |  |
| 5.2 | Detection Range | Critical |  | X |  |  |  |  |  |  |  | s |  |  |  |  |
| 5.3 | Detection Accuracy | High |  | X |  |  |  |  |  |  |  | X |  |  |  | X |
| 5.4 | Battery Autonomy | Critical | n/a (hardware) |  | s |  |  |  |  |  |  |  |  |  | s |  |
| 5.5 | Solar Energy Balance | High | n/a (hardware) |  | s |  |  |  |  |  |  |  |  |  | s |  |
| 5.6 | Operating Temperature | High | n/a (hardware) |  | s |  |  |  |  |  |  |  |  |  | s |  |
| 5.7 | Node Heartbeat and Offline Detection | High |  |  | X | X |  |  |  |  |  |  |  |  | s |  |
| 5.8 | Backend Capacity | Moderate |  | X |  |  |  |  | X |  |  |  |  | s |  |  |
| 6.1 | Laboratory LOTO Procedures | Critical | n/a (process) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 6.2 | NEC Wiring Compliance | Critical | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 6.3 | Railroad Right-of-Way Setback | Critical | n/a (siting) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 6.4 | Battery Safety | Critical | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 6.5 | Certified Radio Components | Critical | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 6.6 | Informational Use Only Disclaimer | High |  |  |  |  |  |  | X | X |  |  |  |  |  |  |
| 7.1 | Remote Health Monitoring | High |  |  | X |  |  |  |  |  |  |  |  |  | X |  |
| 7.2 | Remote Software Updates | Moderate |  |  |  |  |  |  |  |  |  |  | X |  |  |  |
| 7.3 | Installation and Maintenance Guide | High | n/a (document) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 7.4 | Source Code Availability | High | n/a (process) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 7.5 | Field-Replaceable Parts | Moderate | n/a (hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 8.1 | Multiple Nodes and Crossings | Moderate |  | X |  |  | X |  | X |  |  |  |  |  |  |  |
| 8.2 | Public Crossing Status API | Moderate |  |  |  |  |  |  |  |  |  |  |  | X |  |  |
| 8.3 | User Privacy | High |  |  |  |  | X | X |  |  |  |  |  |  |  |  |
| 8.4 | Cross-Platform App Codebase | High | n/a (design constraint, met by the Expo codebase) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 8.5 | Development Budget | Critical | n/a (budget) |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 9.1 | Second Sensor Node for Advance Warning | Future |  | s |  |  |  |  |  |  |  |  |  |  |  |  |
| 9.2 | iOS Release | Future |  |  |  |  | s |  |  |  |  |  |  |  |  |  |
| 9.3 | Blockage Prediction | Future |  |  |  |  |  |  |  |  | s |  |  |  |  |  |
| 9.4 | Dispatch System Integration | Future |  |  |  |  |  |  |  |  |  |  |  | s |  |  |
| 9.5 | City Pilot at Multiple Crossings | Future |  | s |  |  |  |  |  |  |  |  |  |  |  | s |
| 9.6 | Camera Confirmation Layer | Future | n/a (future hardware) |  |  |  |  |  |  |  |  |  |  |  |  |  |

### Coverage check: Critical and High in sections 3 and 5

Every Critical and High requirement in sections 3 and 5 is covered, except four that no use case can satisfy and one deferred by decision.

| Req | Priority | Covered by |
| --- | --- | --- |
| 3.1 Approaching Train Detection | Critical | UC1, gated by UC13 (D1) |
| 3.2 Stopped Train Detection | Critical | UC1, UC9 |
| 3.3 Real-Time Push Alerts | Critical | UC1, UC4, UC7 |
| 3.4 Live Crossing Status Screen | Critical | UC3, UC6, UC7 |
| 3.5 Free Access Without an Account | High | UC4, UC6 |
| 3.8 Blockage History | High | UC1 (records), UC8 (shows) |
| 5.1 Alert Latency | Critical | UC1 |
| 5.2 Detection Range | Critical | UC1 |
| 5.3 Detection Accuracy | High | UC1, UC9, UC13 |
| 5.7 Node Heartbeat and Offline Detection | High | UC2, UC3 |

### Traced to sequence diagrams

Every covered Critical and High requirement in sections 3 and 5 reaches at least one sequence diagram in [05_sequence_diagrams.md](05_sequence_diagrams.md):

| Req | Sequence diagrams |
| --- | --- |
| 3.1 Approaching Train Detection | SD1 (the node detects and sends), SD2 (alerting, gated by alert mode) |
| 3.2 Stopped Train Detection | SD1, SD10 (the background map that makes a stopped train visible) |
| 3.3 Real-Time Push Alerts | SD2, SD4 (blocked, stopped, cleared), SD7 (registering for them) |
| 3.4 Live Crossing Status Screen | SD9 (what the screen shows), SD5 and SD6 (what keeps it honest) |
| 3.5 Free Access Without an Account | SD7 (anonymous sign-in, device keyed on its token) |
| 3.8 Blockage History | SD3 (the BlockageEvent and summary writes) |
| 5.1 Alert Latency | SD2 (push before any database work), SD1 (no network wait in detection) |
| 5.2 Detection Range | SD1 |
| 5.3 Detection Accuracy | SD1 and SD10 (detection and calibration), SD2 (log-only events recorded for measurement) |
| 5.7 Node Heartbeat and Offline Detection | SD5, SD6 |

The exceptions, which no sequence diagram will reach:

- **3.7 City Dashboard (High).** Deferred by D3. The SRS should say so (or move it to section 9) before it is submitted on Oct 23, so the matrix and the SRS agree.
- **3.9 Android App on Google Play (High).** A release step, carried by 4.5 and the EAS build. It belongs in the build order (Phase 8), not in a use case.
- **5.4 Battery Autonomy (Critical), 5.5 Solar Energy Balance (High), 5.6 Operating Temperature (High).** Hardware performance, met by the power and enclosure design and verified by test. UC2 and UC12 only observe them, through the battery voltage and temperature in each heartbeat.

## Open questions

Each has a recommendation. None are decided until the team says so. OQ1 to OQ5 come from the brief, OQ6 to OQ15 came out of the Phase 0 inventory of the existing code, and OQ16 and OQ17 came out of writing the expanded use cases, OQ18 and OQ19 out of drawing the state machines, OQ20 out of the design patterns, OQ21 out of checking the blueprint against the team's Confluence research, and OQ22 out of walking through the app's class diagram after the merge.

| # | Question | Recommendation | Settle by |
| --- | --- | --- | --- |
| OQ1 | **Where does the crossing state machine live?** The edge sends state changes and the server validates them, or the edge sends raw detections and the server derives the state. | The edge. Both options are drawn (SD2 and SD2b) with a side-by-side comparison: the node wins on latency and on working through outages, and with one node (D2) there is nothing to merge. The server's CrossingTracker is where merging two nodes would go later. | Settled as recommended (Fernando, 2026-10-08) |
| OQ2 | **Is offline detection server-side** (UC3 with a Clock) **or client-side** (the app's freshness rule on `lastReadingAt`)? | Both, with different jobs. The app's freshness rule stays the safety net for what the screen shows. The server side exists because only it can push a "status unknown" note on `service-status`, and the SRS heartbeat requirement asks the backend to flag a missed report. | Settled as recommended (Fernando, 2026-10-08) |
| OQ3 | **How does a node authenticate to the ingest API?** | A per-node API key in Secret Manager, sent as a header and checked against a hash, with a way to revoke one node. The key never goes in the repo. Drawn this way in SD2 and SD5 (NodeAuthenticator). Revisit if the API is ever exposed beyond our nodes. | Settled as recommended (Fernando, 2026-10-08) |
| OQ4 | **Is the city dashboard (3.7) in this semester's scope?** | Decided: no. See D3. | Settled |
| OQ5 | **Is `stopped` vs `blocked` still meaningful to users,** or only for the history log? | Agreed: keep them as separate states. A stopped train usually means a long blockage, which is when a detour matters most. | Settled (Fernando, 2026-10-08) |
| OQ6 | **Who creates `eventId`?** Amendment 003 (4.3) says the ingest server. But dropping a node's retried POST, after a lost ack, needs the same ID on every retry, so it has to come from the node. | The node generates it (for example a UUID per event, kept with the event in the SQLite buffer). That is a deliberate change from Amendment 003 and should be recorded there. | Settled as recommended (Fernando, 2026-10-08) |
| OQ7 | **How often do heartbeats run, and how often does the crossing document's `lastReadingAt` update?** The app's freshness rule needs it refreshed at least every 30 s to stay Live, and drops to Unknown after 90 s. The architecture diagram had heartbeats every 30 to 60 s going to Cloud Logging and node health written every 5 to 10 min. | A heartbeat every 30 s, each one refreshing `lastReadingAt`. The server marks a node offline after 90 s (three missed heartbeats), matching the app. The full health snapshot goes to `nodes/{nodeId}` every 5 minutes, and the raw stream to Cloud Logging. Drawn in SD5, SD6 and the state machines. **Correction to the Phase 0 estimate:** the read cost is far lower than first stated. A phone's Firestore listener only runs while the app is open, so 300 users opening it for 2 minutes a day cost about 1,200 reads a day, not 400k to 860k. Writes are the real limit: 2,880 a day per crossing, so the free tier (20k writes a day) covers about six crossings. Revisit when the network grows. | Settled as recommended (Fernando, 2026-10-08) |
| OQ8 | **What does "event" mean?** | Agreed: two names. A CrossingEvent is a state change (what the node sends, identified by `eventId`); a BlockageEvent is a finished blockage (what History shows, stored in `crossings/{id}/events/`). | Settled (Fernando, 2026-10-08) |
| OQ9 | **Which alert preferences must the server know?** It is meant to apply quiet hours and minimum blockage time, but alert types, minimum blockage, commute windows, quiet hours and "mute today" never leave the phone. The device doc's rules only allow a `quietHours` field, and the app doesn't send even that. | Send the ones the server needs to filter (alert types, minimum blockage, quiet hours, commute windows) on the device doc, and widen the rules' field allowlist. None of them identify a person, so this stays within the privacy requirement, but say so in the SRS. "Mute today" can stay on the phone. | Settled as recommended (Fernando, 2026-10-08) |
| OQ10 | **Should the app raise its own alerts on live data?** Today the store runs the alert rules on every snapshot, whatever the data source. On live data the phone would post its own `train-alerts` notifications, marked Time Sensitive, on top of the server's pushes. | Local alerts only on demo data. On live data the server is the only sender. Confirmed by the Phase 6 diagrams: a one-line guard on `source.kind`, no new class (07). | Settled as recommended (Fernando, 2026-10-08) |
| OQ11 | **Where does real history come from?** The diagram has a precomputed `crossings/{id}/summary`, the Firestore rules don't allow reading it, `CrossingSource` has no history method, and History runs on fixed demo numbers. | A summary document the server updates after each blockage, readable under the same rule as the crossing, and a history method next to `subscribe()` on the source interface. | Team, after Phase 7 (drawn in 08: `getHistory`, the summary document, the rules change) |
| OQ12 | **One sensor per crossing, or several?** | Decided: one now, designed so a second is additive. See D2. | Settled |
| OQ13 | **When does the node get its ack?** | Revised by D5: after the push **and** after the Firestore writes. The first answer (ack before the writes) assumed the server keeps running after it responds, which request-based Cloud Run doesn't guarantee. The push still never waits on the database. | Settled, revised (Fernando, 2026-10-09) |
| OQ14 | **iOS push path** (Amendment 003, 5.2). On iOS the device token is an APNs token, which FCM v1 can't send to. | Out of scope for this blueprint, which is Android-first, but it touches `registerDevice()` and the TokenRegistry interface. Note it in Phase 7 so the interface doesn't assume one token type. | Before the first iOS build (08 keeps TokenRegistry token-agnostic) |
| OQ15 | **Delivery receipts.** The original handoff wanted the app to report back when a notification arrives, because FCM's "sent" overstates real delivery on Android. | Worth having for measuring alert latency (5.1) during the log-only weeks. A brief use case later, not a blocker. | Later, before alerts go public (09, "Later") |
| OQ16 | **Where do blocked-alert timers and per-blockage alert records live?** | Revised by D5: the timers are Cloud Tasks (three per blockage), which survive restarts. Per-blockage records stay in memory with a Firestore copy that a restarted server reloads. | Settled, revised (Fernando, 2026-10-09) |
| OQ17 | **How late is too late to alert?** An event that arrives after an outage is recorded but may be too old to alert on (UC1 1b). | Approaching: no alert if it happened more than 60 seconds ago. Blocked and stopped: alert only if the crossing is still in that state. Cleared: alert up to 10 minutes late, since it is still useful news. Confirm against measured outage lengths. | Settled as recommended (Fernando, 2026-10-08) |
| OQ18 | **Where does the first (and only) node go, and what can it see?** | Decided: at the crossing while there is one node; spaced out on each side once there are two. See D4. | Settled (Fernando, 2026-10-08) |
| OQ19 | **With one node at the crossing, is an approaching push worth sending?** The node sees a train only about 100 m out, a few seconds before it arrives and usually after the gates are down. | Keep detecting it and showing it on the status screen, but leave approaching *pushes* off (alert mode stays at blocked and cleared) until spaced nodes give real warning. A few seconds' notice can't change anyone's route, and every approaching push spends trust in the one-shot `train-alerts` channel. D1's staging allows this with no design change: it is just where the crossing's alert mode stops. | Settled as recommended (Fernando, 2026-10-08) |
| OQ20 | **How many server instances?** The current crossing state, the dedupe log, node last-seen times and open blockage records live in the instance's memory (07, Singleton card). A second instance would hold its own copy and disagree with the first. | `min-instances=1` and `max-instances=1`. One instance easily carries one crossing and a few hundred phones. 08 section 5 lists what would move to a shared store to scale out. | Settled as recommended (Fernando, 2026-10-08) |
| OQ21 | **Cloud Run billing mode.** The design's background work (timers, the follower listener, writes after the response) needs CPU between requests, which only instance-based billing gives, at about $45 a month. | Request-based billing, with every background job turned into a request from Cloud Tasks or Cloud Scheduler, at about $5 to $10 a month. See D5. | Settled (Fernando, 2026-10-09) |
| OQ22 | **Does "Mute today" work on live data?** OQ9 kept it on the phone. That works on demo data, where the phone decides every alert, but live alerts are FCM pushes from the server, and Android shows a notification message without running any app code. A muted phone would still get every live train alert, and nothing would tell the person. | Add `mutedUntil` (Timestamp or null) to `devices/{token}`: the end of the phone's local day when "Mute today" is tapped, null when it is turned off. AlertPolicy skips a device whose `mutedUntil` is still in the future, for train alerts only; "status unknown" notes on `service-status` ignore mute, matching `shouldDeliver()` today. One write per tap, and it identifies no one. Rejected: data-only pushes that the app filters itself, because Android can delay or drop them while the app is closed, which is wrong for a safety alert. | With A3, since it is the same device document and rules change |

## Docs outside this blueprint to update

This session only writes files in `docs/artifacts/blueprint/`. These need a matching change elsewhere, in their own PR:

- **Node placement (D4):** `CLAUDE.md` (What this is), `edge/README.md`, and the architecture diagram (`MavRadar_Architecture_Diagram.png`, "Node A, ~550 m up the track") still say 550 m down the track. Amendment 003 section 5 should get a short follow-up amendment rather than an edit, since amendments are a record.
- **`eventId` origin (OQ6):** Amendment 003 section 4.3 says the server creates it; the node does now.
- **City dashboard (D3):** the SRS draft still lists 3.7 as High priority.
- **Follower map (D5):** Amendment 002 section 5 and `server/README.md` say the map is kept fresh by a Firestore snapshot listener; it is now a once-a-minute sync, and the server runs with request-based billing. The architecture diagram's "1 Send push, 2 Write DB, 3 Reply 200" order is right and stays.
- **Confluence, "Cloud and Database Options for MavRadar":** updated on 2026-10-09 to match D5 (see its "Updated after the design blueprint" section).

## Findings for the app

Things this blueprint found in the existing app code. None of them were changed: this is a design-only session. Each one is a candidate task for the build order (Phase 8).

- **No `approaching` alert kind yet.** D1 needs it; `app/src/domain/alerts.ts` has blocked, stopped, cleared and sensor offline only.
- **Local alerts would double up on live data (OQ10).** The store runs the alert rules on every snapshot, whatever the source.
- **`registerDevice()` doesn't send alert preferences (OQ9),** and the Firestore rules' field allowlist would reject them today.
- **Cold-start notification taps (SD9).** `onAlertTapped` uses a response listener; a tap that launches the app from fully closed may arrive before it exists. Expo's `getLastNotificationResponseAsync()` covers that case. Check on the dev build.
- **The 20-crossing cap is silent (UC4 7b).** Follows past 20 work on the phone but get no pushes, and nothing says so.
- **History runs on fixed demo numbers (OQ11).**
- **"Mute today" never reaches the server (OQ22).** On live data a muted phone would still get every train push.

## Status

The blueprint is complete (2026-10-09). Against the brief's "done when":

- All ten files exist.
- Every Critical and High requirement in sections 3 and 5 traces to at least one sequence diagram, except the four exceptions and the one deferral listed in the coverage check.
- Every pattern has a card in 07, including the ones rejected.
- Every Mermaid diagram was render-checked with mermaid-cli on Mermaid 9.4 and the current release.
- The open questions are listed above, each settled or tagged with when it has to be settled.
- The branch is ready for a PR.

## Note for the course

Generated with help from Claude (Anthropic). The syllabus requires citing AI use, so keep this line in this file.
