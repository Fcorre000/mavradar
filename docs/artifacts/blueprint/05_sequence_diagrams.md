# 05 Sequence Diagrams

Phase 5 of the blueprint. One Mermaid sequence diagram per scenario in [04_scenario_tables.md](04_scenario_tables.md), with the failure paths from [03_expanded_use_cases.md](03_expanded_use_cases.md) as `alt` and `opt` blocks. SD1 is S1, SD2 is S2, and so on. SD2b is the one extra: the other answer to [OQ1](00_README.md#open-questions), drawn so the two can be compared.

Messages are numbered (`autonumber`), so later phases can point at them: a method in the design class diagram (Phase 7) traces to "SD2 message 6", and a pattern card (Phase 6) names the messages that motivate it. Message names read like calls (`verify(nodeKey)`), but they are not final signatures; Phase 7 settles those.

The diagrams stick to basic Mermaid (`participant`, `alt`, `opt`, `loop`, `Note`) so they render in GitHub and older viewers.

**Background work runs as requests ([D5](00_README.md#decisions)).** The server runs on Cloud Run with request-based billing, which gives it no CPU between requests. So nothing in these diagrams runs "in the background": the blockage checks arrive from Cloud Tasks (SD4), the offline check and the follower sync arrive from Cloud Scheduler (SD6, SD8), and every Firestore write finishes before the server responds (SD3, SD5).

| Diagram | Scenario | Use case |
| --- | --- | --- |
| [SD1](#sd1-node-detects-and-sends-an-event) | Node detects and sends an event | UC1 |
| [SD2](#sd2-server-handles-the-event-the-hot-path) | Server handles the event, the hot path | UC1 |
| [SD2b](#sd2b-the-alternative-for-oq1-the-server-derives-the-state) | The alternative for OQ1 | UC1 |
| [SD3](#sd3-server-writes-then-acknowledges) | Server writes, then acknowledges | UC1 |
| [SD4](#sd4-blocked-stopped-and-cleared-alerts-follow-the-blockage) | Alerts follow the blockage | UC1 |
| [SD5](#sd5-node-sends-a-heartbeat) | Node sends a heartbeat | UC2 |
| [SD6](#sd6-server-detects-a-silent-node) | Server detects a silent node | UC3 |
| [SD7](#sd7-app-registers-the-device) | App registers the device | UC4 |
| [SD8](#sd8-server-picks-up-the-follow) | Server picks up the follow (once a minute) | UC4 |
| [SD9](#sd9-app-opens-on-a-tapped-alert) | App opens on a tapped alert | UC7 |
| [SD10](#sd10-node-calibrates-its-background-map) | Node calibrates its background map | UC9 |

## What the UC1 diagrams have to show

UC1 is the most important flow in the system, so the brief named six things its diagrams must make visible. Here is where each one is.

| Must show | Where |
| --- | --- |
| The push to FCM before the Firestore write | SD2 messages 19 to 23 send the push; every Firestore write comes after it, in SD3 messages 1 to 9 |
| The in-memory crossing-to-token lookup, with no Firestore read on the hot path | SD2 messages 16 and 17 (SubscriptionMap) |
| `eventId` dedupe | SD2 messages 8 to 12 and 24, SD3 message 10 (EventLog's three states: new, pushed, done), and SD1 message 16, the retry that makes it necessary |
| Channel selection (`train-alerts` vs `service-status`) | SD2 message 18; SD6 message 12 for `service-status` |
| Pruning invalid tokens after the FCM response | SD2 message 23 reports them; SD3 messages 7 to 9 remove them |
| The node's SQLite buffer and the ack | SD1 messages 6 to 16; SD3 message 11 is the ack, sent only after the writes |

---

## SD1: Node detects and sends an event

Detection and sending run separately on the node, so a slow or missing uplink never delays detection. An event is in the buffer before the first send is attempted.

```mermaid
sequenceDiagram
    autonumber
    participant Radar
    participant RS as RadarSource
    participant D as Detector
    participant EB as EventBuffer
    participant U as Uplink
    participant IC as IngestController

    RS->>Radar: read frame
    Radar-->>RS: speed, direction, range, strength
    RS->>D: onDetection(detection)
    D->>D: compare with BackgroundMap and current track
    opt state change confirmed
        D->>D: newEvent(fromState, toState) with new eventId and logOnly flag
        D->>EB: store(event)
    end

    Note over U,EB: Runs on its own loop, never blocks detection
    U->>EB: oldestPending()
    EB-->>U: event
    U->>IC: POST /events (event, node key)
    alt accepted or duplicate
        IC-->>U: 200 ack(eventId)
        U->>EB: delete(eventId)
    else rejected as invalid (422)
        IC-->>U: 422 invalid
        U->>EB: delete(eventId) and log it, a resend would fail again
    else key rejected (401)
        IC-->>U: 401 unauthorized
        U->>U: keep event, log, retry later (shows in node health)
    else no uplink, timeout or 5xx
        U->>U: keep event, back off and retry with the same eventId
    end
```

## SD2: Server handles the event, the hot path

Everything up to the push is in memory or goes to FCM. Nothing on this path reads from or writes to Firestore, so the database can never delay an alert. SD3 continues straight on in the same request: it writes to Firestore and only then acknowledges the node ([D5](00_README.md#decisions)).

```mermaid
sequenceDiagram
    autonumber
    participant U as Node Uplink
    participant IC as IngestController
    participant NA as NodeAuthenticator
    participant EL as EventLog
    participant CT as CrossingTracker
    participant AP as AlertPolicy
    participant SM as SubscriptionMap
    participant NS as NotificationService
    participant FCM

    U->>IC: POST /events (event, node key)
    IC->>NA: verify(nodeKey)
    alt unknown node or wrong key
        NA-->>IC: rejected
        IC-->>U: 401 unauthorized
    else key ok
        NA-->>IC: node, crossingId
        IC->>IC: validate(event, node)
        alt malformed, wrong crossing or impossible change
            IC-->>U: 422 invalid
        else valid
            IC->>EL: checkAndMark(eventId)
            alt already done (a retry after a lost ack)
                EL-->>IC: done
                IC-->>U: 200 ack(eventId), nothing sent or written again
            else pushed earlier but the writes didn't finish
                EL-->>IC: pushed, not written
                Note over IC,EL: Skip the push and go straight to SD3 to finish the writes
            else first time
                EL-->>IC: new
                IC->>CT: apply(event)
                CT-->>IC: alertKind or none, late flag
                opt alertKind is not none
                    IC->>AP: recipients(crossingId, alertKind, logOnly, eventTime)
                    AP->>SM: followers(crossingId)
                    SM-->>AP: devices with their preferences
                    Note over AP: Filters by alert mode, logOnly, alert types, quiet hours, commute windows, lateness and what each device was already told
                    AP-->>IC: tokens, channel (train-alerts for train kinds)
                    opt at least one token
                        IC->>NS: send(alert, tokens, channel)
                        loop each batch of up to 500 tokens
                            NS->>FCM: multicast with channel_id, priority high, time sensitive
                            alt FCM answers
                                FCM-->>NS: per-token results
                            else FCM slow or down
                                NS->>NS: retry briefly while still useful, then record the failure
                            end
                        end
                        NS-->>IC: DeliveryReport(sentCount, invalidTokens)
                    end
                end
                IC->>EL: markPushed(eventId)
                Note over IC,FCM: The push is out. No Firestore read or write so far. SD3 continues in the same request.
            end
        end
    end
```

Notes:

- **Blocked doesn't alert here.** For a change to blocked, `AlertPolicy` returns no tokens at this point: blocked alerts go out from the confirmation checks in SD4, once each device's minimum blockage time has passed. Approaching, stopped and cleared alerts go out here.
- **Log-only and alert mode filter here, not earlier.** The event still updates the crossing's state and gets written in SD3. That is how log-only weeks produce the data for measuring false alarms (D1).
- **Lateness (OQ17)** comes from the event time: `CrossingTracker` flags the event late, and `AlertPolicy` drops alert kinds whose usefulness window has passed.

## SD2b: The alternative for OQ1, the server derives the state

[OQ1](00_README.md#open-questions) asks where the crossing state machine lives. SD2 draws the lean: the node runs it and sends state changes. This is the other option: the node streams raw detections and the server decides the state.

```mermaid
sequenceDiagram
    autonumber
    participant D as Node Detector
    participant EB as EventBuffer
    participant U as Node Uplink
    participant IC as IngestController
    participant SD as Server Detector
    participant CT as CrossingTracker
    participant AP as AlertPolicy

    loop every second while something is in the track band
        D->>EB: store(detection batch)
        U->>IC: POST /detections (batch, node key)
        IC-->>U: 200 ack(batchId)
        IC->>SD: onDetections(batch)
        SD->>SD: compare with this node's BackgroundMap and track
        opt state change confirmed
            SD->>CT: apply(state change)
            CT-->>IC: alertKind or none
            IC->>AP: recipients(...) and continue as in SD2 from message 15
        end
    end
```

| | Node decides (SD2, the lean) | Server decides (SD2b) |
| --- | --- | --- |
| Latency | One request per state change. Nothing waits on the network to decide. | Every decision waits for the detections to arrive, so link delay and dropouts sit inside the warning budget. |
| Uplink traffic | A few small events per train. | A batch every second while something is in view. Matters on a metered Cat-M link. |
| Works through an outage | Yes. The node keeps deciding and buffers the events. | No. With the link down, nothing decides, and the replayed detections arrive too late to alert on. |
| Tuning detection | Needs a node software update (UC10). | Change the server and redeploy. Easier during log-only weeks. |
| Two nodes per crossing (future, D2) | Each node sends its own state; the server must merge two opinions about one crossing. | The server sees both nodes' detections and decides once. Cleaner for fusion. |
| Porting to an ESP32 later | The state machine has to stay portable (a stated goal). | The node only reads and forwards. |

Recommendation, unchanged: **the node decides.** It wins on latency and on working through outages, which matter most, and with one node (D2) there is nothing to merge. Two things keep the door open for later: the node records raw detections locally anyway (they're needed to measure accuracy during log-only weeks), and the server-side `CrossingTracker` is where merging two nodes would go.

## SD3: Server writes, then acknowledges

The second half of the same request as SD2. The push is already out; now the server writes everything to Firestore and only then acknowledges the node. With request-based billing, work after the response may never run ([D5](00_README.md#decisions)), so the acknowledgement waits for the writes. The node doesn't mind: nothing time-critical waits on its acknowledgement.

```mermaid
sequenceDiagram
    autonumber
    participant IC as IngestController
    participant CR as CrossingRepository
    participant AL as AlertLog
    participant TR as TokenRegistry
    participant SM as SubscriptionMap
    participant EL as EventLog
    participant FS as Firestore
    participant U as Node Uplink

    IC->>CR: saveState(crossingId, reading)
    CR->>FS: write crossings/usdotId
    IC->>AL: record(alert, recipients)
    AL->>FS: write alert log and the open blockage record
    opt this event ended a blockage
        CR->>FS: add crossings/usdotId/events BlockageEvent
        CR->>FS: update crossings/usdotId/summary
    end
    opt the delivery report has invalid tokens
        IC->>TR: remove(invalidTokens)
        TR->>FS: delete devices/token for each
        TR->>SM: drop(invalidTokens)
    end
    alt every write succeeded
        IC->>EL: markDone(eventId)
        IC-->>U: 200 ack(eventId)
    else a write still fails after a few quick retries
        IC-->>U: 503, try again later
        Note over IC,U: The event stays "pushed, not written". The node resends it, SD2 skips the push, and the writes get another chance.
    end
```

So a Firestore outage delays the database, never the alert, and never causes a second alert.

## SD4: Blocked, stopped and cleared alerts follow the blockage

A blockage needs memory across several events: when it started, which checks are still due, and who has been told what. This diagram covers UC1's alternate flows 5b to 5d. The 1, 3 and 5 minute checks are Cloud Tasks ([D5](00_README.md#decisions)): each one is a task that calls the server at its time, so they survive a server restart and need no CPU while waiting.

```mermaid
sequenceDiagram
    autonumber
    participant IC as IngestController
    participant CT as CrossingTracker
    participant BC as BlockageChecks
    participant TQ as TaskQueue
    participant CTK as Cloud Tasks
    participant AP as AlertPolicy
    participant AL as AlertLog
    participant NS as NotificationService
    participant FCM

    Note over IC,CT: A change to blocked arrives through SD2
    IC->>AL: openBlockage(crossingId, start)
    IC->>BC: schedule(crossingId, start)
    BC->>TQ: create tasks at 1, 3 and 5 minutes after start
    TQ->>CTK: create 3 tasks (crossingId, minimum)

    loop each task when its time comes
        CTK->>IC: POST /tasks/blockage-check (crossingId, minimum)
        IC->>BC: runCheck(crossingId, minimum)
        BC->>CT: isBlocking(crossingId)
        alt still blocked or stopped
            BC->>AP: recipients(crossingId, blocked, minimum)
            AP->>AL: whoWasTold(crossingId)
            AP-->>BC: tokens with this minimum, not yet told
            opt at least one token
                BC->>NS: send(blocked alert, tokens, train-alerts)
                NS->>FCM: multicast
                BC->>AL: markTold(tokens, blocked)
            end
        else already cleared
            BC->>BC: do nothing, the blockage is over
        end
        IC-->>CTK: 200, task done
    end

    opt a change to stopped arrives through SD2
        IC->>AP: recipients(crossingId, stopped)
        AP->>AL: whoWasTold(crossingId)
        AP-->>IC: tokens told blocked, not yet told stopped
        IC->>NS: send(stopped alert, tokens, train-alerts)
        IC->>AL: markTold(tokens, stopped)
    end

    opt a change to clear arrives through SD2
        IC->>AP: recipients(crossingId, cleared)
        AP->>AL: whoWasTold(crossingId)
        AP-->>IC: tokens told blocked or stopped
        IC->>NS: send(cleared alert, tokens, train-alerts)
        IC->>AL: closeBlockage(crossingId)
    end
```

Notes:

- **No cancelling.** When the crossing clears, the remaining tasks still arrive, find the crossing no longer blocked, and do nothing. That costs a request or two and saves keeping track of task names.
- **`AlertLog` keeps open blockages in memory** and writes them to Firestore (SD3), so a restarted server reloads them at startup. Reading `whoWasTold` is a memory lookup, so the hot path still reads nothing from Firestore.
- **Only Cloud Tasks may call `/tasks/blockage-check`.** Each task carries a Google-signed identity token for a dedicated service account, and the endpoint rejects anything else.
- **Going sensor offline mid-blockage doesn't close it** (UC3 3a). The checks still arrive; `isBlocking` is false while the crossing is offline, so nothing is sent, and the node's state when it returns decides what happens next.

## SD5: Node sends a heartbeat

```mermaid
sequenceDiagram
    autonumber
    participant HR as HealthReporter
    participant D as Detector
    participant U as Uplink
    participant IC as IngestController
    participant NA as NodeAuthenticator
    participant NM as NodeMonitor
    participant CT as CrossingTracker
    participant CR as CrossingRepository
    participant FS as Firestore
    participant CL as Cloud Logging

    HR->>HR: read battery voltage, temperature, uptime, signal
    HR->>D: currentState()
    D-->>HR: state, map version
    HR->>U: send(heartbeat)
    U->>IC: POST /heartbeats (heartbeat, node key)
    alt no uplink or timeout
        U->>U: drop it, only the next heartbeat matters
    else delivered
        IC->>NA: verify(nodeKey)
        alt key rejected
            NA-->>IC: rejected
            IC-->>U: 401 unauthorized
        else key ok
            NA-->>IC: node, crossingId
            IC->>NM: record(heartbeat, receivedAt)
            NM->>NM: lastSeen = receivedAt (server time, not the node's clock)
            NM->>CT: reconcile(crossingId, node's state)
            alt the node had been marked offline
                CT->>CT: restore the crossing to the node's state
            else the node's state differs (an event was lost)
                CT->>CT: adopt the node's state, log the mismatch, no train alert
            end
            NM->>NM: check readings against health limits
            opt out of range
                NM->>NM: flag for the maintainer (UC12)
            end
            NM->>CR: refreshLastReading(crossingId, receivedAt)
            CR->>FS: update crossings/usdotId lastReadingAt
            NM->>CL: write raw heartbeat
            opt every 5 minutes
                NM->>FS: update nodes/nodeId health snapshot
            end
            IC-->>U: 200 ack
        end
    end
```

How often the heartbeat runs, and how often `lastReadingAt` reaches Firestore, is [OQ7](00_README.md#open-questions): a heartbeat every 30 seconds, each one refreshing `lastReadingAt`, with the full health snapshot written every 5 minutes and the raw stream in Cloud Logging. As in SD3, every write finishes before the acknowledgement (D5).

## SD6: Server detects a silent node

The check runs once a minute, as a request from Cloud Scheduler ([D5](00_README.md#decisions)).

```mermaid
sequenceDiagram
    autonumber
    participant SCH as Cloud Scheduler
    participant IC as IngestController
    participant NM as NodeMonitor
    participant CT as CrossingTracker
    participant CR as CrossingRepository
    participant AP as AlertPolicy
    participant SM as SubscriptionMap
    participant NS as NotificationService
    participant FCM
    participant FS as Firestore

    Note over NM,FS: At startup NM reloads last-seen times from nodes/nodeId and waits one full threshold before declaring anything offline
    loop every minute
        SCH->>IC: POST /tasks/check-nodes
        IC->>NM: check(now)
        NM->>NM: find nodes silent past the offline threshold
        opt a node just went silent
            NM->>CT: markOffline(crossingId)
            CT->>CT: sensorOffline, any open blockage stays open
            CT->>CR: saveState(crossingId, sensorOffline)
            CR->>FS: write crossings/usdotId
            NM->>FS: flag nodes/nodeId offline (UC12)
        end
        opt silent for 10 minutes and no note yet for this outage
            NM->>AP: recipients(crossingId, sensorOffline)
            AP->>SM: followers(crossingId)
            SM-->>AP: devices
            AP-->>NM: tokens and channel service-status
            NM->>NS: send(status unknown note, tokens, service-status)
            NS->>FCM: multicast, default priority, never time sensitive
            NM->>NM: mark noted for this outage
        end
        IC-->>SCH: 200
    end
```

The note never goes on `train-alerts`, ignores alert types and quiet hours the same way the app's `shouldDeliver` does today, and goes out at most once per outage. With a 90-second threshold checked every minute, the server notices a dead node within about two and a half minutes. Phones don't wait for that: their own freshness rule shows Unknown at 90 seconds.

## SD7: App registers the device

This is the app as it is built today, plus the alert preferences that [OQ9](00_README.md#open-questions) adds to the device document.

```mermaid
sequenceDiagram
    autonumber
    participant AA as AppActions
    participant ST as Store
    participant PR as PushRegistrar
    participant OS as PhoneOS
    participant AU as Firebase Auth
    participant FS as Firestore

    Note over AA: The user just allowed notifications (UC4 step 6)
    AA->>ST: addFollow(crossingId)
    AA->>PR: registerDevice(followedCrossings, alertPreferences)
    PR->>OS: getPermissions()
    alt not granted
        OS-->>PR: denied or undetermined
        PR-->>AA: null, nothing registered
    else granted
        OS-->>PR: granted
        PR->>OS: createNotificationChannels()
        PR->>OS: getDevicePushToken()
        OS-->>PR: token
        opt no signed-in user yet
            PR->>AU: signInAnonymously()
            AU-->>PR: uid
        end
        PR->>FS: merge-write devices/token with uid, platform, updatedAt, subscriptions, alert preferences
        alt offline or the rules reject it
            FS-->>PR: error
            PR-->>AA: failed quietly, runs again at the next launch
        else accepted
            FS-->>PR: ok
            PR-->>AA: token
        end
    end
    AA->>ST: show "Following Center St. Alerts on." with Undo
```

Two changes this implies for the app, recorded here and not made: `registerDevice()` sends `subscriptions` but not the alert preferences yet, and the Firestore rules' field allowlist has to grow to accept them (OQ9).

## SD8: Server picks up the follow

Once a minute, Cloud Scheduler asks the server to fetch only the device documents that changed since the last sync ([D5](00_README.md#decisions)). This replaces the always-open Firestore listener, which would need CPU between requests. The hot path still reads only from memory.

```mermaid
sequenceDiagram
    autonumber
    participant SCH as Cloud Scheduler
    participant IC as IngestController
    participant TR as TokenRegistry
    participant FS as Firestore
    participant SM as SubscriptionMap

    Note over TR,SM: At startup, before the server accepts any event
    TR->>FS: load every devices document
    FS-->>TR: device documents
    loop each device
        TR->>SM: upsert(device)
    end
    TR->>TR: lastSync = now

    loop every minute
        SCH->>IC: POST /tasks/sync-devices
        IC->>TR: changedSince(lastSync)
        TR->>FS: query devices where updatedAt after lastSync
        FS-->>TR: changed device documents
        loop each changed device
            TR->>TR: toDevice(document)
            TR->>SM: upsert(device)
            SM->>SM: move the token between crossings, keep the latest preferences
        end
        TR->>TR: lastSync = time of the newest change seen
        IC-->>SCH: 200
    end
```

Notes:

- **A follow takes up to a minute to start getting pushes**, and an unfollow up to a minute to stop. That is the one trade-off of D5.
- **Every change bumps `updatedAt`.** The Firestore rules already require `updatedAt` to equal the write time, so an unfollow (fewer `subscriptions`) or a preference change is always caught. A device the server deleted itself (SD3) is already out of the map.
- **Cost:** one small query a minute, about 1,440 reads a day plus one per changed device. Well inside the free tier.

## SD9: App opens on a tapped alert

```mermaid
sequenceDiagram
    autonumber
    actor User as App User
    participant OS as PhoneOS
    participant ATH as AlertTapHandler
    participant ST as Store
    participant SS as StatusScreen
    participant CS as CrossingSource
    participant FS as Firestore
    participant FR as FreshnessRule

    User->>OS: tap the notification
    OS->>ATH: notification response with crossingId
    Note over OS,ATH: On a cold start the tap that launched the app must not be missed (see the finding below)
    alt crossingId not known
        ATH->>ST: select Center St and show a short message
    else known
        ATH->>ST: select crossingId for Status
    end
    ATH->>SS: switch to the Status tab
    SS->>ST: read snapshot and selected crossing
    CS->>FS: listen to crossings/usdotId
    alt online
        FS-->>CS: crossing document
    else offline
        FS-->>CS: cached document, marked from cache
    end
    CS->>ST: SourceSnapshot with readings and connection
    SS->>FR: effectiveState(reading, now, connection)
    FR-->>SS: state, freshness, reason if Unknown
    SS-->>User: live state, how fresh it is, and the detour
```

The notification's own text is never used as the state. Only the crossing document, passed through the freshness rule, decides what Status shows.

## SD10: Node calibrates its background map

```mermaid
sequenceDiagram
    autonumber
    actor M as Maintainer
    participant Cal as Calibrator
    participant D as Detector
    participant RS as RadarSource

    M->>Cal: start(captureLength)
    Cal->>D: pause()
    D-->>Cal: paused, state calibrating
    Note over D: Heartbeats now say calibrating, so the crossing shows Unknown and nothing alerts
    loop for the capture length
        Cal->>RS: readRange()
        RS-->>Cal: range frame
    end
    Cal->>Cal: check sample count and movement in the track band
    alt something moved, or too few samples
        Cal->>M: capture failed, old map kept, try again with the track clear
        Cal->>D: resume(current map)
    else clean capture
        Cal->>Cal: build candidate BackgroundMap
        Cal->>M: summary next to the current map's summary
        alt maintainer confirms
            M->>Cal: confirm
            Cal->>Cal: save the new map, keep the previous one
            Cal->>D: resume(new map version)
        else maintainer rejects
            M->>Cal: reject
            Cal->>D: resume(current map)
        end
    end
```

## Findings from this phase

Drawing the diagrams turned up three things. The first was significant and is now settled as D4.

1. **What one node can see depends on where it sits (OQ18).** The radar reaches about 100 m, so a node 550 m down the track can't see the crossing, and a node at the crossing gives only seconds of warning. **Settled as [D4](00_README.md#decisions):** the single node goes at the crossing; two nodes get spaced out later. None of the diagrams above change; only the Detector's evidence does ([06_state_machines.md](06_state_machines.md#how-the-node-knows-it-depends-on-placement-oq18-decided-as-d4)).
2. **Cold-start notification taps (SD9).** The app's `onAlertTapped` uses a response listener. When a tap launches the app from fully closed, that response can arrive before the listener exists; Expo provides `getLastNotificationResponseAsync()` for exactly this case. Worth checking on the dev build. It is the most common way UC7 starts.
3. **The 20-crossing cap is silent** (UC4 7b). Nothing in the diagrams changes, but the app should say so when it happens.
