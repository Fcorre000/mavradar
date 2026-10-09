# 04 Scenario Tables

Phase 4 of the blueprint. For each nontrivial step in [03_expanded_use_cases.md](03_expanded_use_cases.md): a scenario description in plain sentences (who does what, with what data, to which object), then Kung's scenario table.

Consecutive nontrivial steps that form one uninterrupted interaction share a scenario. For example, UC1 steps 2 to 6 all happen inside one request from the node, up to the push. That gives ten scenarios, and each one becomes exactly one sequence diagram in [05_sequence_diagrams.md](05_sequence_diagrams.md), under the same ID.

| Scenario | Use case steps | Diagram |
| --- | --- | --- |
| S1 Node detects and sends an event | UC1 steps 1 and 10 | SD1 |
| S2 Server handles the event (hot path) | UC1 steps 2 to 6 | SD2 |
| S3 Server writes, then acknowledges | UC1 steps 7 to 9 | SD3 |
| S4 Blocked, stopped and cleared alerts follow the blockage | UC1 alternate flows 5b to 5d | SD4 |
| S5 Node sends a heartbeat | UC2 steps 1 to 4 | SD5 |
| S6 Server detects a silent node | UC3 steps 2 to 4 | SD6 |
| S7 App registers the device | UC4 step 7 | SD7 |
| S8 Server picks up the follow | UC4 step 8 | SD8 |
| S9 App opens on a tapped alert | UC7 steps 2 to 5 | SD9 |
| S10 Node calibrates its background map | UC9 steps 2 to 7 | SD10 |

## The objects

These names are used the same way in the scenario tables, the sequence diagrams, and later the design class diagrams. They describe roles, not classes yet: Phase 6 decides which patterns shape them, and Phase 7 turns them into classes and modules.

**Node (`edge/`, Python on the Pi Zero 2 W)**

| Object | Job |
| --- | --- |
| Radar | The OPS243-C. External hardware: it reports speed, direction, range and signal strength over USB serial. |
| RadarSource | Reads and parses the radar's output into Detections. |
| Detector | Decides what is on the track from Detections and the BackgroundMap, and runs the node's state machine. |
| EventBuffer | The local SQLite store of CrossingEvents not yet acknowledged by the server. |
| Uplink | Sends events and heartbeats to the ingest API over whatever link the node has. |
| HealthReporter | Reads battery voltage, enclosure temperature, uptime and signal strength, and builds the Heartbeat. |
| Calibrator | Captures and saves the BackgroundMap (UC9). |

**Server (`server/`, FastAPI on Cloud Run)**

| Object | Job |
| --- | --- |
| IngestController | Receives events and heartbeats from nodes and coordinates the rest. One handler per use case. |
| NodeAuthenticator | Checks a node's key and returns which node and crossing it is. |
| EventLog | Remembers which `eventId`s have been processed, so a retried event is recognised. |
| CrossingTracker | Holds each crossing's current state in memory, applies changes, and says which alert a change calls for. |
| AlertPolicy | Decides who gets an alert: crossing alert mode, each device's preferences, quiet hours and commute windows, lateness, and what each device was already told. |
| SubscriptionMap | The in-memory map from crossing to the devices following it, with each device's preferences. No database read on the hot path. |
| NotificationService | Sends alerts through FCM: batching, channel, priority and Time Sensitive flags, and reading back which tokens failed. |
| BlockageChecks | Schedules the 1, 3 and 5 minute confirmation checks for a blockage and runs each check when it arrives. |
| TaskQueue | Creates Cloud Tasks for BlockageChecks. A thin wrapper, so tests can use a fake. |
| AlertLog | Records each alert and, per open blockage, which devices were told what. |
| CrossingRepository | Writes crossing documents, BlockageEvents and summaries to Firestore. |
| TokenRegistry | Loads device documents, fetches the ones changed since the last sync, and deletes invalid ones. |
| NodeMonitor | Tracks each node's last-seen time and health, and spots silent nodes. |

**App (`app/`, existing code in brackets)**

| Object | Job |
| --- | --- |
| AppActions | The app's actions (`state/actions.ts`: `toggleFollow`, `confirmPriming`). |
| Store | The app's state (`state/store.ts`), read by screens through `useSyncExternalStore`. |
| PushRegistrar | Device registration (`lib/push.ts`, `registerDevice()`). |
| AlertTapHandler | Handles a tapped notification (`lib/alert-delivery.ts`, `onAlertTapped`). |
| StatusScreen | The Status tab (`app/index.tsx`). |
| CrossingSource | Live crossing data (`data/source.ts`, implemented by `FirestoreSource`). |
| FreshnessRule | The trust rule (`domain/freshness.ts`, `effectiveState`). |

**External systems:** FCM, Firestore, Firebase Auth, the phone's operating system (PhoneOS), Cloud Logging, and two Google services that call the server on a schedule ([D5](00_README.md#decisions)): **Cloud Scheduler** (the offline check and the follower sync, once a minute) and **Cloud Tasks** (the blockage checks).

---

## S1: Node detects and sends an event (UC1 steps 1 and 10)

The RadarSource reads a frame from the Radar and passes the Detector a Detection with its speed, direction, range and strength. The Detector compares it with the BackgroundMap and its current track. When a train is confirmed (for example, approaching), the Detector changes state and creates a CrossingEvent with a new `eventId`, marked log-only if the node is still in log-only mode. It asks the EventBuffer to store the event before anything is sent. The Uplink takes the oldest unacknowledged event from the EventBuffer and sends it to the ingest API with the node's key. When the IngestController acknowledges it, the Uplink asks the EventBuffer to delete that event.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | RadarSource | reads | speed, direction, range, strength | Radar |
| 2 | RadarSource | passes | Detection | Detector |
| 3 | Detector | compares | Detection, BackgroundMap | its current track |
| 4 | Detector | changes state and creates | CrossingEvent with new `eventId`, log-only flag | itself |
| 5 | Detector | asks to store | CrossingEvent | EventBuffer |
| 6 | Uplink | asks for the oldest unacknowledged event | | EventBuffer |
| 7 | Uplink | sends | CrossingEvent, node key | IngestController |
| 8 | IngestController | acknowledges | `eventId` | Uplink |
| 9 | Uplink | asks to delete | `eventId` | EventBuffer |

## S2: Server handles the event, the hot path (UC1 steps 2 to 6)

The IngestController receives the CrossingEvent with the node's key and asks the NodeAuthenticator to check the key. The NodeAuthenticator returns the node and the crossing it watches. The IngestController checks the event is well formed and about that crossing, then asks the EventLog about this `eventId`. The EventLog answers one of three ways: done (a retry after a lost acknowledgement, so it is acknowledged again and nothing else happens), pushed but not written (the push went out earlier but the writes failed, so the push is skipped and the flow goes straight to S3), or new. For a new event, the IngestController asks the CrossingTracker to apply it. The CrossingTracker checks the state change is legal and not older than the current state, updates the crossing in memory, and returns which alert the change calls for and whether the event is late. The IngestController asks the AlertPolicy for recipients. The AlertPolicy looks up the crossing in the SubscriptionMap, which returns the following devices and their preferences, and filters them: crossing alert mode, the log-only flag, each device's alert types, quiet hours and commute windows, lateness (OQ17), and what each device was already told about this blockage. It returns the recipient tokens and the channel. The IngestController asks the NotificationService to send. The NotificationService sends a multicast to FCM in batches of up to 500 tokens, with the channel, high priority and the Time Sensitive flag, and turns FCM's per-token results into a delivery report. The IngestController tells the EventLog the event has been pushed and carries on to S3 in the same request.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | IngestController | receives | CrossingEvent, node key | |
| 2 | IngestController | asks to verify | node key | NodeAuthenticator |
| 3 | NodeAuthenticator | returns | node, the crossing it watches | IngestController |
| 4 | IngestController | validates | CrossingEvent against node and crossing | |
| 5 | IngestController | asks for the state of | `eventId` | EventLog |
| 6 | EventLog | returns | new, pushed or done | IngestController |
| 7 | IngestController | asks to apply | CrossingEvent | CrossingTracker |
| 8 | CrossingTracker | checks and updates | state change, event time | crossing's current state |
| 9 | CrossingTracker | returns | alert kind or none, late flag | IngestController |
| 10 | IngestController | asks for recipients | crossing, alert kind, alert mode, log-only flag, event time | AlertPolicy |
| 11 | AlertPolicy | looks up | crossing | SubscriptionMap |
| 12 | SubscriptionMap | returns | devices with their preferences | AlertPolicy |
| 13 | AlertPolicy | filters | alert types, quiet hours, commute windows, lateness, blockage memory | devices |
| 14 | AlertPolicy | returns | recipient tokens, channel | IngestController |
| 15 | IngestController | asks to send | crossing, alert kind, tokens, channel | NotificationService |
| 16 | NotificationService | sends | multicast message: channel, high priority, Time Sensitive | FCM |
| 17 | FCM | returns | per-token results | NotificationService |
| 18 | NotificationService | returns | delivery report: sent count, invalid tokens | IngestController |
| 19 | IngestController | marks as pushed | `eventId` | EventLog |

## S3: Server writes, then acknowledges (UC1 steps 7 to 9)

Still in the same request, the IngestController asks the CrossingRepository to save the crossing's new state, and the CrossingRepository writes the crossing document in Firestore. It asks the AlertLog to record the alert and its recipients, which also updates the open blockage record. If the event ended a blockage, the CrossingRepository adds a BlockageEvent to the crossing's log and updates its summary. The IngestController passes the invalid tokens from the delivery report to the TokenRegistry, which deletes those device documents and asks the SubscriptionMap to drop them. When every write has succeeded, the EventLog marks the `eventId` as done and the IngestController acknowledges the event to the Uplink. If a write keeps failing, the IngestController answers "try again later" instead; the event stays "pushed, not written", and the node's resend finishes the writes without a second push.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | IngestController | asks to save | crossing's new state | CrossingRepository |
| 2 | CrossingRepository | writes | crossing document | Firestore |
| 3 | IngestController | asks to record | alert, recipients | AlertLog |
| 4 | AlertLog | writes | alert, open blockage record | Firestore |
| 5 | CrossingRepository | adds (if the blockage ended) | BlockageEvent, updated summary | Firestore |
| 6 | IngestController | asks to remove | invalid tokens | TokenRegistry |
| 7 | TokenRegistry | deletes | device documents | Firestore |
| 8 | TokenRegistry | asks to drop | invalid tokens | SubscriptionMap |
| 9 | IngestController | asks to mark done | `eventId` | EventLog |
| 10 | IngestController | acknowledges (or answers "try again later") | `eventId` | Uplink |

## S4: Blocked, stopped and cleared alerts follow the blockage (UC1 alternate flows 5b to 5d)

When the CrossingTracker reports that a crossing has become blocked, the IngestController asks the AlertLog to open a blockage record and asks the BlockageChecks to schedule the confirmation checks. The BlockageChecks ask the TaskQueue to create three Cloud Tasks, due 1, 3 and 5 minutes after the blockage started. When a task comes due, Cloud Tasks calls the server, and the IngestController asks the BlockageChecks to run that check. The BlockageChecks ask the CrossingTracker whether the crossing is still blocked or stopped. If it is, they ask the AlertPolicy for devices whose minimum blockage time equals this check and that haven't been told yet. The NotificationService sends them the blocked alert, and the AlertLog records who was told. If the crossing has already cleared, the check does nothing. When the crossing changes to stopped, the AlertPolicy picks only devices already told "blocked" and not yet told "stopped". When it clears, the AlertPolicy picks only devices told "blocked" or "stopped", and the AlertLog closes the blockage record. Remaining tasks still arrive and do nothing. Because the tasks live in Cloud Tasks, a server restart loses no checks; the AlertLog reloads open blockage records at startup.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | IngestController | asks to open | crossing, blockage start | AlertLog |
| 2 | IngestController | asks to schedule | crossing, blockage start | BlockageChecks |
| 3 | BlockageChecks | ask to create | three tasks due at 1, 3 and 5 minutes | TaskQueue |
| 4 | Cloud Tasks | calls (when a task is due) | crossing, this check's minimum | IngestController |
| 5 | BlockageChecks | ask whether still blocked | crossing | CrossingTracker |
| 6 | BlockageChecks | ask for recipients | crossing, "blocked", this check's minimum | AlertPolicy |
| 7 | AlertPolicy | filters | devices by minimum blockage, not yet told | SubscriptionMap, AlertLog |
| 8 | BlockageChecks | ask to send | blocked alert, recipient tokens | NotificationService |
| 9 | AlertLog | records | devices told "blocked" | open blockage record |
| 10 | AlertPolicy | picks (on stopped) | devices told "blocked", not yet "stopped" | AlertLog |
| 11 | AlertPolicy | picks (on cleared) | devices told "blocked" or "stopped" | AlertLog |
| 12 | AlertLog | closes | open blockage record | itself |

## S5: Node sends a heartbeat (UC2 steps 1 to 4)

When the heartbeat interval elapses, the HealthReporter reads the battery voltage, enclosure temperature, uptime and signal strength. It asks the Detector for its current state and background map version, builds a Heartbeat, and asks the Uplink to send it. The IngestController receives it and asks the NodeAuthenticator to check the key. It passes the Heartbeat and the time it arrived to the NodeMonitor. The NodeMonitor records the node as alive at that time, compares the node's reported state with the CrossingTracker's (restoring the crossing if the node had been marked offline), and checks the readings against the health limits. It asks the CrossingRepository to refresh the crossing's `lastReadingAt`, so phones see the status as current, and writes the raw heartbeat to Cloud Logging (OQ7). Only then does the IngestController acknowledge.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | HealthReporter | reads | battery voltage, temperature, uptime, signal strength | node hardware |
| 2 | HealthReporter | asks for | current state, map version | Detector |
| 3 | HealthReporter | asks to send | Heartbeat | Uplink |
| 4 | Uplink | sends | Heartbeat, node key | IngestController |
| 5 | IngestController | asks to verify | node key | NodeAuthenticator |
| 6 | IngestController | asks to record | Heartbeat, arrival time | NodeMonitor |
| 7 | NodeMonitor | updates | last-seen time | node's record |
| 8 | NodeMonitor | asks to reconcile | node's reported state | CrossingTracker |
| 9 | NodeMonitor | checks | readings against limits | itself |
| 10 | NodeMonitor | asks to refresh | `lastReadingAt` | CrossingRepository |
| 11 | NodeMonitor | writes | raw heartbeat | Cloud Logging |
| 12 | IngestController | acknowledges | | Uplink |

## S6: Server detects a silent node (UC3 steps 2 to 4)

Once a minute, Cloud Scheduler calls the server, and the IngestController asks the NodeMonitor to check. The NodeMonitor finds nodes whose last heartbeat is older than the offline threshold. For each, it asks the CrossingTracker to mark the crossing sensor offline. The CrossingTracker does so, keeping any open blockage open, and the CrossingRepository writes the crossing document. Once a node has been silent for 10 minutes and no note has gone out for this outage, the NodeMonitor asks the AlertPolicy for the crossing's followers. It asks the NotificationService to send them one "status unknown" note on the `service-status` channel. The NodeMonitor then flags the node offline for the maintainer.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | Cloud Scheduler | calls (every minute) | | IngestController |
| 2 | IngestController | asks to check | current time | NodeMonitor |
| 3 | NodeMonitor | finds | nodes past the offline threshold | last-seen times |
| 4 | NodeMonitor | asks to mark offline | crossing | CrossingTracker |
| 5 | CrossingTracker | sets | sensor offline, open blockage kept | crossing's current state |
| 6 | CrossingRepository | writes | crossing document | Firestore |
| 7 | NodeMonitor | asks for recipients (after 10 minutes) | crossing, "status unknown" | AlertPolicy |
| 8 | AlertPolicy | looks up | crossing | SubscriptionMap |
| 9 | NodeMonitor | asks to send | "status unknown" note, `service-status` | NotificationService |
| 10 | NotificationService | sends | multicast message, default priority | FCM |
| 11 | NodeMonitor | flags | node offline | node's record |

## S7: App registers the device (UC4 step 7)

After the user allows notifications, AppActions adds the crossing to the followed list in the Store and asks the PushRegistrar to register the device with the followed crossings and alert preferences. The PushRegistrar confirms permission with the PhoneOS and asks it for the device's push token. If there is no signed-in user yet, it asks Firebase Auth to sign in anonymously, and Firebase Auth returns a uid. The PushRegistrar merge-writes the device document, keyed on the token, with the uid, platform, update time, followed crossings and alert preferences. Firestore checks it against the security rules: the writer's uid, allowed fields only, at most 20 crossings. The PushRegistrar returns the token, and AppActions shows "Following Center St. Alerts on." with Undo.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | AppActions | adds | crossing to the followed list | Store |
| 2 | AppActions | asks to register | followed crossings, alert preferences | PushRegistrar |
| 3 | PushRegistrar | checks | notification permission | PhoneOS |
| 4 | PushRegistrar | asks for | device push token | PhoneOS |
| 5 | PushRegistrar | asks to sign in anonymously (if needed) | | Firebase Auth |
| 6 | Firebase Auth | returns | uid | PushRegistrar |
| 7 | PushRegistrar | merge-writes | uid, platform, update time, followed crossings, alert preferences | device document in Firestore |
| 8 | Firestore | checks | security rules: owner, allowed fields, 20-crossing cap | the write |
| 9 | PushRegistrar | returns | token | AppActions |
| 10 | AppActions | asks to show | "Following Center St. Alerts on." with Undo | Store |

## S8: Server picks up the follow (UC4 step 8)

When the server starts, the TokenRegistry loads every device document and gives each one to the SubscriptionMap, so the map is complete before the first event is handled. After that, once a minute, Cloud Scheduler calls the server, and the IngestController asks the TokenRegistry for devices changed since the last sync. The TokenRegistry queries Firestore for device documents whose `updatedAt` is newer, turns each into a Device (token, followed crossings, alert preferences), and asks the SubscriptionMap to update it. The SubscriptionMap removes the token from crossings it no longer follows and adds it to new ones, with the latest preferences. A new follow therefore reaches the server within about a minute.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | TokenRegistry | loads (at startup) | every device document | Firestore |
| 2 | Cloud Scheduler | calls (every minute) | | IngestController |
| 3 | IngestController | asks for changes | time of the last sync | TokenRegistry |
| 4 | TokenRegistry | queries | device documents updated since then | Firestore |
| 5 | TokenRegistry | converts | each changed document | Device |
| 6 | TokenRegistry | asks to update | Device | SubscriptionMap |
| 7 | SubscriptionMap | moves | token between crossings, latest preferences | its entries |

## S9: App opens on a tapped alert (UC7 steps 2 to 5)

The PhoneOS starts or resumes the app and hands the AlertTapHandler the tapped notification, whose data carries the crossing ID. The AlertTapHandler checks the crossing is one the app knows, asks the Store to select it for Status, and switches to the Status tab. The StatusScreen reads the snapshot and selected crossing from the Store. Meanwhile the CrossingSource has a listener on that crossing's document, and Firestore returns the document (or a cached copy, with a flag saying so). The CrossingSource sends the Store a SourceSnapshot with the readings and the connection status. The StatusScreen asks the FreshnessRule for the effective state, which returns state, freshness and, if Unknown, the reason, and shows it to the user.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | PhoneOS | hands over | tapped notification with crossing ID | AlertTapHandler |
| 2 | AlertTapHandler | checks | crossing ID | known crossings |
| 3 | AlertTapHandler | asks to select | crossing | Store |
| 4 | AlertTapHandler | switches to | Status tab | StatusScreen |
| 5 | StatusScreen | reads | snapshot, selected crossing | Store |
| 6 | CrossingSource | listens to | crossing document | Firestore |
| 7 | Firestore | returns | crossing document, from-cache flag | CrossingSource |
| 8 | CrossingSource | sends | SourceSnapshot with connection status | Store |
| 9 | StatusScreen | asks for | effective state | FreshnessRule |
| 10 | FreshnessRule | returns | state, freshness, reason if Unknown | StatusScreen |

## S10: Node calibrates its background map (UC9 steps 2 to 7)

The maintainer asks the Calibrator to start a capture of a set length. The Calibrator asks the Detector to pause: it stops creating events and reports "calibrating" in its state, which the next heartbeat carries. The Calibrator asks the RadarSource for range frames for the whole capture, checks there are enough of them and that nothing moved through the track's distance band, and builds a candidate BackgroundMap. It shows the maintainer a summary next to the current map's. When the maintainer confirms, the Calibrator saves the new map, keeping the previous one, and asks the Detector to resume with the new map version.

| # | Subject | Subject Action | Other Data / Objects | Object Acted Upon |
| --- | --- | --- | --- | --- |
| 1 | Maintainer | asks to start | capture length | Calibrator |
| 2 | Calibrator | asks to pause | | Detector |
| 3 | Calibrator | asks for | range frames for the capture | RadarSource |
| 4 | RadarSource | returns | range frames | Calibrator |
| 5 | Calibrator | checks | sample count, movement in the track band | range frames |
| 6 | Calibrator | builds | candidate BackgroundMap | itself |
| 7 | Calibrator | shows | summary, current map's summary | Maintainer |
| 8 | Maintainer | confirms | | Calibrator |
| 9 | Calibrator | saves | new BackgroundMap, previous kept | map store |
| 10 | Calibrator | asks to resume | new map version | Detector |
