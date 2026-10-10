# 03 Expanded Use Cases

Phase 3 of the blueprint. The six full use cases from [01_use_cases.md](01_use_cases.md), written out step by step in Kung's two-column format: what the actor does on the left, what the system does in response on the right.

**Bold marks a nontrivial step**: one that needs processing beyond displaying something. Only nontrivial steps go on to scenario tables (Phase 4) and sequence diagrams (Phase 5). Each use case ends with a list of them.

Requirement numbers are not repeated here; the use case's column in the [traceability matrix](00_README.md#traceability-matrix) lists them.

## Assumptions these flows make

Four open questions were tagged for this phase. The flows below were written with the recommended answer to each, and the team has since agreed to all four (2026-10-08). If one is ever revisited, the steps named here are the ones that change.

| Question | Assumed here | Affects |
| --- | --- | --- |
| [OQ2](00_README.md#open-questions) Offline detection | Both. The app's freshness rule keeps guarding the screen; the server also detects a silent node, because only it can push a "status unknown" note. | UC3 exists; UC2 step 3 |
| [OQ6](00_README.md#open-questions) Who creates `eventId` | The node, when it records the event. The same ID travels with every retry. | UC1 steps 1 and 3 |
| [OQ9](00_README.md#open-questions) Preferences the server knows | Alert types, minimum blockage time, quiet hours and commute windows go on the device document. "Mute today" stays on the phone (reopened as [OQ22](00_README.md#open-questions): that breaks it on live data). | UC1 step 5, UC4 step 7 |
| [OQ13](00_README.md#open-questions) When the node gets its ack | After the push and after the Firestore writes. (First assumed "before the writes"; revised by [D5](00_README.md#decisions), because Cloud Run with request-based billing may never run work after a response.) | UC1 steps 7 to 10 |

It also builds on decisions [D1](00_README.md#decisions) (alert types switch on in stages, per crossing) and [D2](00_README.md#decisions) (one node per crossing for now), and on [OQ1](00_README.md#open-questions)'s lean: the node runs the state machine and sends state changes. Phase 5 draws the alternative.

---

## UC1: Report Crossing Event

**Actor:** Sensor Node
**Precondition:** The node is registered with the ingest API and has a node key. It has a background map (UC9). The crossing it watches has an alert mode (UC13).
**Postcondition:** The event is recorded exactly once. If the crossing's alert mode allows this kind of alert and the event isn't log-only, everyone following the crossing whose preferences allow it has been notified on `train-alerts`. The crossing document shows the new state. If a blockage just ended, it has been added to the blockage log and the crossing's summary.
**Requirements:** UC1 column of the matrix.

| Actor Input | System Response |
| --- | --- |
| 1) The node's detector confirms a state change from its radar detections (for example, clear to approaching). **The node gives the event a new `eventId`, saves it in its local buffer, and sends it to the ingest API.** | 2) **The system checks the node's key and validates the event**: a known node, the crossing it watches, a legal state change, a sensible timestamp. |
| | 3) **The system checks the `eventId` against events it has already processed.** This is the first time it has seen it. |
| | 4) **The system applies the change to the crossing's current state** and works out which alert, if any, the change calls for: approaching, blocked, stopped or cleared. |
| | 5) **The system picks the recipients**: devices following the crossing, from the in-memory crossing-to-token map (no database read), filtered by the crossing's alert mode and each device's alert types, quiet hours and commute windows. |
| | 6) **The system sends the alert through FCM as one multicast**, on the `train-alerts` channel, high priority, Time Sensitive on iOS. |
| | 7) **The system writes the crossing's new state to its document**, logs the alert, and if a blockage just ended (blocked or stopped to clear) adds a BlockageEvent and updates the crossing's summary. |
| | 8) **The system removes tokens that FCM reported as no longer valid** from the registry and the in-memory map. |
| 10) The node receives the acknowledgement and removes the event from its buffer. | 9) The system acknowledges the event to the node, with its `eventId`. |

The push (step 6) always comes before any database write (steps 7 and 8). The acknowledgement (step 9) comes last, because the server runs with request-based billing and work after a response may never run ([D5](00_README.md#decisions)). Nothing time-critical waits on the node's acknowledgement.

### Alternate flows

**Getting the event to the server**

- **1a) No uplink.** The send fails. The event stays in the node's buffer, and the node retries with backoff. When the link comes back it sends the buffer oldest first, each event with its original `eventId`.
- **1b) Late event.** An event arrives long after it happened (after an outage). The system records it and uses it for history, but sends no alert if it's past the point of being useful. An "approaching" from five minutes ago would mislead people. The time limit per alert kind is a Phase 5 detail.
- **1c) Events out of order.** A buffered event arrives older than the crossing's current state. The system records it for history but doesn't roll the current state back or alert on it.

**Rejected events**

- **2a) Unknown node or wrong key.** The system rejects the event and processes nothing. The node keeps it in the buffer and logs the failure. Repeated failures show up in node health (UC12), because they usually mean a key needs rotating.
- **2b) Invalid event.** For example, a state change that can't happen, or a malformed body. The system rejects it as invalid. The node drops it from the buffer and logs it, because resending a bad event would only fail again. The node retries only on errors that might be temporary (server unavailable, timeout).

**Duplicates, log-only and nobody to tell**

- **3a) Duplicate `eventId`, already done.** The node retried after a lost acknowledgement. The system acknowledges again and does nothing else: no second alert, no second write.
- **3b) Duplicate `eventId`, pushed but not written.** An earlier attempt sent the push but its writes failed (7a). The system skips the push and goes straight to step 7, so the writes get another chance without a second alert.
- **4a) Log-only.** The event is marked log-only, or the crossing's alert mode doesn't allow this kind yet (D1). The system records the event and updates the state, but sends no alert. This is how the false-alarm rate gets measured.
- **4b) No alert needed.** The change calls for no alert (for example, approaching back to clear without a blockage). The system updates the state and continues at step 7.
- **5a) Nobody to notify.** Nobody follows the crossing, or every follower's preferences filter this alert out. No push is sent; the flow continues at step 7.

**Alerts that wait or depend on earlier alerts**

- **5b) Blocked: wait for confirmation.** A blocked alert only goes to a device once the blockage has lasted that device's minimum blockage time (1, 3 or 5 minutes, from the app's rules). At step 5 the system sends nothing for "blocked". Instead it schedules three checks with Cloud Tasks, at 1, 3 and 5 minutes (D5). When each one arrives, if the crossing is still blocked, it sends the blocked alert to the devices whose minimum has just passed. If the crossing clears first, those devices never get a blocked alert, and the remaining checks find nothing to do.
- **5c) Stopped: one follow-up only.** A "stopped" alert goes only to devices that already got the "blocked" alert for this blockage, and only once.
- **5d) Cleared: only after an alert.** A "cleared" alert goes only to devices that got a "blocked" or "stopped" alert for this blockage. A blockage nobody was told about ends silently.
- **5e) The node reports itself unhealthy.** The node sends `sensorOffline` (for example, the radar stopped responding). The crossing goes to sensor offline. Followers get one "status unknown" note on `service-status`, never on `train-alerts`, following the same rule as UC3.

**When FCM or Firestore fails**

- **6a) FCM is slow or unavailable.** The system retries the send briefly while the alert is still useful, and records the failure in the alert log. It still finishes the event (steps 7 to 9), so the node doesn't resend; a resend would be recognised as a duplicate anyway.
- **7a) The Firestore write fails.** The push has already gone out (push first). The system retries a few times within the request; if the write still fails, it answers "try again later" instead of acknowledging (step 9). The node keeps the event and resends it, and 3b finishes the writes without a second push. Meanwhile phones keep seeing the old state, and the app's freshness rule marks it Delayed, then Unknown, if that takes too long.
- **8a) FCM reports invalid tokens.** Covered by step 8; those devices simply stop being sent to.

### Nontrivial steps

UC1 steps 1 to 8, plus the confirmation checks in 5b.

---

## UC2: Report Node Health

**Actor:** Sensor Node
**Precondition:** The node is registered and has its node key.
**Postcondition:** The node's last-seen time and health readings are current. The crossing's freshness reflects that the node is alive. Any health reading out of range is flagged for the maintainer.
**Requirements:** UC2 column of the matrix.

| Actor Input | System Response |
| --- | --- |
| 1) The node's heartbeat interval elapses. **The node sends a heartbeat**: battery voltage, enclosure temperature, uptime, signal strength, software version, background map version, and its detector's current state. | 2) **The system checks the node's key and validates the heartbeat.** |
| | 3) **The system records the node as alive**, using the time it received the heartbeat, not the node's clock. It refreshes the crossing's freshness so phones know the status is current. How often that freshness is written to the crossing document is [OQ7](00_README.md#open-questions). |
| | 4) **The system checks the health readings against limits** (low battery, high temperature) and flags anything out of range for the maintainer (UC12). |
| 6) The node receives the acknowledgement. | 5) The system acknowledges the heartbeat. |

### Alternate flows

- **1a) No uplink.** Heartbeats are not buffered or replayed: only the latest one matters. When the link comes back, the node sends one fresh heartbeat. Its buffered crossing events (UC1) go first.
- **2a) Unknown node or wrong key.** The system rejects the heartbeat, as in UC1 2a.
- **3a) The node was marked offline (UC3).** The system marks it back online. The crossing returns to the node's current state, which the heartbeat carries, so the server never has to guess what the crossing looked like while it was dark. Followers who got a "status unknown" note don't get a "back online" note; the app simply shows live status again.
- **3b) The heartbeat's state disagrees with the crossing's current state.** For example, an event was lost. The node's state wins. The system updates the crossing to match and logs the mismatch, but sends no train alert: a heartbeat never triggers `train-alerts`.
- **4a) The node reports it is calibrating** (UC9). The system treats the crossing as having no working sensor for that time. Phones see Unknown, and no alerts go out.

### Nontrivial steps

UC2 steps 1, 2, 3 and 4.

---

## UC3: Detect Offline Node

**Actor:** Clock (in practice, a Cloud Scheduler job that calls the server once a minute, D5)
**Precondition:** Server-side offline detection exists (OQ2, assumed yes). The server holds each node's last-seen time in memory.
**Postcondition:** A crossing whose node has gone silent shows sensor offline. Its followers have had at most one "status unknown" note, on `service-status`. The node is flagged offline for the maintainer.
**Requirements:** UC3 column of the matrix.

| Actor Input | System Response |
| --- | --- |
| 1) The clock fires: once a minute, Cloud Scheduler calls the server. | 2) **The system finds nodes whose last heartbeat is older than the offline threshold.** |
| | 3) **The system marks each one offline and sets its crossing to sensor offline**, writing the crossing document. The app shows Unknown, with no last state word. |
| | 4) **Once a node has been silent for 10 minutes** (the app's existing rule), **the system sends its crossing's followers one "status unknown" note on `service-status`.** |
| | 5) The system flags the node as offline for the maintainer (UC12). |

There is no closing actor step: the Clock is a time trigger and doesn't receive anything. This is the loose fit flagged in [01_use_cases.md](01_use_cases.md#uc3-detect-offline-node). The use case ends when the crossing shows sensor offline and the note has been sent.

### Alternate flows

- **2a) The server restarted.** Its in-memory last-seen times are gone. The system reloads them from the nodes' documents at startup, and doesn't declare anything offline until one full threshold has passed since the restart. Otherwise every restart would look like an outage.
- **3a) The node went silent mid-blockage.** The crossing goes to sensor offline, but the blockage stays open. No "cleared" alert is sent, because silence says nothing about the train (the app's existing rule). When the node returns (UC2 3a), its state decides what happens to the blockage.
- **4a) The node comes back within 10 minutes.** No note is sent at all; the crossing just returns to live status.
- **4b) The note was already sent for this outage.** Nothing more is sent until the node has been back online and goes silent again.

### Nontrivial steps

UC3 steps 2, 3 and 4.

---

## UC4: Follow a Crossing

**Actor:** App User
**Precondition:** The app is installed. The user hasn't followed this crossing yet.
**Postcondition:** The crossing is followed on this phone. If notifications are allowed, the device's registration lists the crossing, and the server's in-memory map sends this device the crossing's alerts.
**Requirements:** UC4 column of the matrix.

This follows the app as it is built today (`toggleFollow`, `confirmPriming` and `registerDevice` in `app/src`).

| Actor Input | System Response |
| --- | --- |
| 1) The user taps Follow on a crossing: in the map sheet, on the list star, the alerts switch on Status, or an alert switch in Settings. | 2) The system checks notification permission. It hasn't been asked yet. |
| | 3) The system shows the priming sheet, explaining what alerts MavRadar sends and why it needs permission. |
| 4) The user taps "Turn on alerts". | 5) The system creates the two notification channels, then shows the phone's permission prompt. |
| 6) The user allows notifications. | 7) **The system registers the device**: it signs in anonymously if needed, gets the push token, and writes the device document keyed on that token, with the followed crossings and the alert preferences the server filters on (OQ9). |
| | 8) **Within a minute, the server's scheduled sync fetches the changed device document and adds the token to the crossing's entry in its in-memory map** (D5). From now on, UC1 step 5 includes this device. |
| 10) The user sees the crossing marked as followed, with alerts on. | 9) The system shows the crossing as followed and a "Following Center St. Alerts on." message with Undo. |

### Alternate flows

**Permission already decided**

- **2a) Permission already granted.** No priming sheet and no prompt. The system goes straight to step 7.
- **2b) Permission denied earlier.** The crossing is followed on the phone only. The system shows "Following Center St. Notifications are off for MavRadar." Nothing is registered, so no pushes arrive. In Settings, the alert switches show a card explaining how to turn notifications back on in the phone's settings.

**The user changes their mind**

- **4a) The user taps "Not now" on the priming sheet.** Nothing is followed and nothing is asked. The user can tap Follow again later.
- **6a) The user denies the prompt.** The crossing is still followed on the phone, so its status stays one tap away, but no registration happens. The system shows "Alerts are off. You can still check status here."
- **10a) The user taps Undo.** The follow is reversed, as in 11a.

**Registration problems**

- **7a) Offline when registering.** The follow is saved on the phone straight away. Registration fails quietly and runs again the next time the app starts with permission granted, so the server catches up without the user doing anything.
- **7b) Already following 20 crossings.** Registration keeps the first 20 (the database rules allow no more). The other follows still work on the phone for checking status, but get no pushes. This needs a clear message in the app; today the cut is silent.
- **8a) The server is restarting.** It rebuilds its map from all device documents at startup, so a follow written while it was down still counts.

**Unfollow**

- **11a) Unfollow.** The user taps Follow again on a followed crossing. The system removes it on the phone, shows "Unfollowed Center St." with Undo, and, if notifications are allowed, re-registers so the device document drops the crossing. Within a minute, the server's sync removes the token from that crossing's entry in the map.

### Nontrivial steps

UC4 steps 7 and 8.

---

## UC7: Open Train Alert

**Actor:** App User
**Precondition:** The user received a MavRadar notification (UC1 or UC3) and the app may be closed, in the background, or open.
**Postcondition:** The Status screen shows the crossing from the notification, with its live state. It never shows the notification's state as if it were still current.
**Requirements:** UC7 column of the matrix.

| Actor Input | System Response |
| --- | --- |
| 1) The user taps the notification. | 2) **The system starts or resumes the app and reads the crossing ID from the notification's data.** |
| | 3) The system selects that crossing on Status and switches to the Status tab. |
| | 4) **The system subscribes to the crossing's live status and applies the freshness rule.** Until fresh data arrives it shows Unknown or the last known state marked Delayed, depending on age, never the notification's state as current. |
| 6) The user sees the crossing's live state, how fresh it is, and the detour button. | 5) The system shows the live state as soon as it arrives. |

### Alternate flows

- **2a) The crossing in the notification isn't known** (for example, an old notification from a crossing the app no longer lists). The system opens Status on the default crossing, Center St, and shows a short message.
- **2b) The notification arrives while the app is open.** The system shows it as a banner. Tapping it continues from step 2.
- **4a) The phone is offline.** Status shows Unknown with the phone-offline reason and the last sync time, never a guessed state.
- **4b) The state has already changed.** For example, the crossing cleared between the alert and the tap. Status shows the current state (Clear), not the state the notification announced.
- **6a) The user taps "Directions via West St underpass".** The system opens Google Maps with the detour.

### Nontrivial steps

UC7 steps 2 and 4.

---

## UC9: Calibrate Background Map

**Actor:** Maintainer
**Precondition:** The maintainer can reach the node (on site, or remotely over the node's management link). The track in view is known to be empty: no train in sight, gates up.
**Postcondition:** The node has a new background map that matches the empty scene, and it is running again with it. The map version shows in its heartbeat.
**Requirements:** UC9 column of the matrix.

| Actor Input | System Response |
| --- | --- |
| 1) The maintainer starts calibration on the node and sets how long it should capture (several minutes). | 2) **The node switches to calibrating**: it stops sending crossing events and reports "calibrating" in its heartbeat, so the crossing shows Unknown and no alerts go out (UC2 4a). |
| | 3) **The node samples the radar's range returns for the whole capture period** and builds a map of the fixed objects at each distance (gate arms, masts, buildings). |
| | 4) **The node checks the capture is clean**: enough samples, and nothing moving through the track's distance band during the capture. |
| 6) The maintainer reviews the summary and confirms it. | 5) The node shows a summary: which distances it will ignore and how strong the fixed returns are, next to the previous map's summary. |
| 8) The maintainer sees the node running with the new map version. | 7) **The node saves the new map (keeping the previous one), returns to running, and reports the new map version in its heartbeat.** |

### Alternate flows

- **4a) Something moved during the capture** (a train or a vehicle). The node discards the capture, keeps the old map, and tells the maintainer to try again with the track clear.
- **4b) Too few samples** (for example, the radar dropped out). Same as 4a.
- **6a) The maintainer rejects the summary.** The node discards the new map, keeps the old one, and returns to running.
- **7a) The node reboots during calibration.** It starts up with the last saved map and running, never half-calibrated.
- **8a) The new map turns out worse** (false stopped detections afterwards). The maintainer restores the previous map, which is kept for exactly this.

### Nontrivial steps

UC9 steps 2, 3, 4 and 7.

---

## Nontrivial steps at a glance

These are what Phase 4 turns into scenario tables and Phase 5 into sequence diagrams.

| Use case | Nontrivial steps | Where the work runs |
| --- | --- | --- |
| UC1 Report Crossing Event | 1 to 8, plus the 5b confirmation checks | Node (1), server (2 to 8, and the checks) |
| UC2 Report Node Health | 1, 2, 3, 4 | Node (1), server (2 to 4) |
| UC3 Detect Offline Node | 2, 3, 4 | Server |
| UC4 Follow a Crossing | 7, 8 | App (7), server (8) |
| UC7 Open Train Alert | 2, 4 | App |
| UC9 Calibrate Background Map | 2, 3, 4, 7 | Node |

## New findings from this phase

Writing the flows out surfaced four things that weren't visible in the use case list. They are added to the open questions in the README.

- **The blocked alert is timer-driven (UC1 5b).** Because each device can choose a 1, 3 or 5 minute minimum, the server sends blocked alerts from scheduled checks, not from the node's event. That is a second time trigger besides UC3, and it needs to survive a server restart mid-blockage. **[OQ16](00_README.md#open-questions).**
- **The server must remember who was told what (UC1 5c, 5d).** "Stopped" and "cleared" only go to devices that got "blocked" for the same blockage, so the server needs a record per blockage of which devices were alerted. The alert log is the natural place. **[OQ16](00_README.md#open-questions).**
- **Heartbeats should carry the detector's current state (UC2 1, 3a).** Without it, the server can't restore a crossing's state after an outage or catch a lost event. This is a field in the shared contract (Phase 7), not a new question.
- **Late events need a time limit per alert kind (UC1 1b).** An "approaching" alert is only useful for under a minute; a "cleared" one is still worth sending later. **[OQ17](00_README.md#open-questions).**
