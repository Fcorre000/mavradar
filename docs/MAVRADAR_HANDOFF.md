# MavRadar - Claude Code Handoff

Drop this at `docs/HANDOFF.md` in the repo. It's written for an agent picking up the project cold.

---

## What this project is

MavRadar detects freight trains approaching the Center St grade crossing near the University of Texas at Arlington and pushes a real-time alert to a mobile app, so students can divert to the West St underpass before they commit to the Center St corridor.

No public real-time freight train position data exists. Class I railroads treat movement data as proprietary, and the shipper-facing APIs (Railinc, Terminal49, Vizion) track individual railcars, not "is there a train at this crossing right now." So the system detects trains directly with a doppler radar unit.

Owner: Fernando, UTA software engineering, graduating May 2027. Python, Firebase, and React experience. Working on an M1 Mac with 8GB RAM.

## The constraint that drives every decision

The warning window is 30 to 45 seconds, matching when the crossing gates activate. Approximate budget:

| Stage | Cost |
|---|---|
| Radar return to confident train classification | 2 to 5s |
| Pi to cloud over LTE | 0.5 to 2s |
| Backend processing | 0.1s warm, 3 to 10s cold |
| FCM/APNs to lock screen | 1 to 30s, highly variable |
| User reads and reacts | 10s+ |

There is almost no slack. When evaluating any architectural change, latency is the tiebreaker.

## Architecture

```
OPS243-A radar --USB--> Raspberry Pi 4 --LTE--> ingest API --> alert filter --> FCM/APNs --> phone
                                                     |
                                                 Firestore (async, off the hot path)
```

**Field unit at the crossing**
- OmniPreSense OPS243-A-CW-RP, 24GHz doppler, 100m range, 20 degree beam, FCC Part 15 certified
- Raspberry Pi 4 Model B 2GB, Python service reading parsed speed/direction over USB serial
- SQLite ring buffer so events survive LTE dropouts
- Sixfab 4G/LTE modem kit (EG25-G North America)
- Solar and battery: 20W panel, 10A PWM controller, 12V 22Ah AGM, low voltage disconnect, 12V to 5V buck converter
- Watchdog heartbeat every 5 minutes

**Cloud backend**
- Ingest API: FastAPI on Cloud Run, `min-instances=1` so there is no cold start in the hot path
- Alert filter: quiet hours and radius checks before fan-out
- Push: FCM HTTP v1, targeting registration tokens
- Firestore: event log, push token registry, user preferences
- Uptime monitor: alerts the owner if the Pi stops reporting

**App**
- Expo (React Native), SDK 57, iOS and Android
- expo-notifications, using the native device token via `getDevicePushTokenAsync`, not the Expo push service
- Firebase Anonymous Auth so token registration needs no signup
- Screens: current status, alert history, West St detour map, optional crowdsourced "train here now" report

## Decisions already made, with reasoning

These were researched and settled. Don't relitigate without new information.

**Native app, not PWA.** iOS web push only works for home-screen-installed PWAs, service worker push listeners are unreliable after device restarts, and unexpected unsubscriptions happen. Disqualifying for a safety alert.

**Token multicast, not FCM topics.** Firebase documents topic messages as optimized for throughput rather than latency and recommends targeting registration tokens for fast delivery. User base is a few hundred students in a one-mile radius, so multicast is correct.

**iOS Time Sensitive interruption level is required.** Students are in Focus mode during class, which is exactly when the app matters. Needs the entitlement in app config plus `interruption-level: time-sensitive` in the APNs payload. iOS prompts the user once to keep or disable Time Sensitive notifications from the app, so it must never be spent on anything but a real train event. Critical Alerts require Apple approval and are out of reach.

**Cloud Run with min-instances, not Cloud Functions.** Cold starts eat seconds of a 30-second budget. Also keeps the FCM service account credential in the cloud instead of on a Raspberry Pi in a parking lot.

**Push first, write to Firestore after.** Never block a notification on a database write.

**Expo with EAS cloud builds, no Xcode.** The owner's Mac is an 8GB M1 and Xcode wants 50GB+ of disk. EAS builds on Expo's macOS cloud. Testing happens on a physical iPhone, which is required anyway since push notifications need a real APNs token and do not work in the Simulator.

**Public monorepo.** Secret scanning and push protection are free and always-on for public GitHub repos but require the paid Secret Protection product for private ones. Given four credential types in play, the safety net is worth more than the secrecy.

## Current state

Done:
- GitHub repo `mavradar` created and cloned locally
- Monorepo scaffold: `app/`, `edge/`, `server/`, `docs/`
- Root `.gitignore` and `README.md` in place
- Expo account created, project linked (`eas init --id`), slug and name set to `mavradar` / `MavRadar`
- Expo app scaffolded with SDK 57

In progress:
- Apple Developer Program enrollment ($99/year, multi-day identity verification). Blocks all iOS builds.
- Firebase project setup

Not started:
- Hardware ordering (radar first, it is the long-lead item)
- Any application code beyond the Expo template

## Repo layout

| Path | Contents |
|---|---|
| `app/` | Expo React Native app |
| `edge/` | Python detection service for the Pi |
| `server/` | FastAPI ingest and fan-out, deployed to Cloud Run |
| `docs/` | Architecture, BOM, site survey, permission letters |

## Hard rules

**Never commit credentials.** The `.gitignore` blocks `.env`, `*.p8`, `*.p12`, `*.mobileprovision`, `google-services.json`, `GoogleService-Info.plist`, `serviceAccountKey.json`, and `*-firebase-adminsdk-*.json`. Do not weaken it. The repo is public.

**Never commit the deployment coordinates.** The exact mounting location of the field unit stays out of the repo. It is an unattended device in a parking lot, and publishing precise coordinates of a sensor aimed at Union Pacific track invites problems that are cheap to avoid.

**Never mount hardware within 50 feet of the nearest rail.** That is UP right-of-way. Texas Penal Code 28.07 makes railroad property interference a Class C misdemeanor. UP's own encroachment rule is 35 feet from track centerline; TxDOT requires 50 for utility poles. Any siting code, config, or documentation should assume 50+ feet.

**Batch native config changes.** The EAS free tier allows 15 iOS builds per month. Every change to entitlements or native config triggers a rebuild. Get `app.json` right in one pass rather than iterating.

**Do not add the Android emulator or Xcode to the local setup.** The machine is an 8GB M1 and the workflow deliberately avoids both.

## Suggested next work

1. **`edge/` detection service skeleton.** Python, pyserial, systemd unit. The interesting problem is classification: distinguishing a train from a truck using sustained doppler return plus object length. Build it to run in log-only mode first.
2. **`server/` FastAPI ingest.** Single POST endpoint, device authentication, validation, then a call to FCM HTTP v1. Firestore write happens after the push, not before.
3. **`app/` notification plumbing.** expo-notifications setup, native device token registration, Firebase Anonymous Auth, and the Time Sensitive entitlement in `app.json`. This is the batch of native config changes to do in one pass.
4. **Watchdog and uptime monitor.** A Pi that stopped reporting looks identical to a quiet day at the crossing.
5. **Alert filter.** Quiet hours and radius. This is not polish. If the app fires at 3am for a train nobody is driving toward, students revoke Time Sensitive permission and the channel is gone permanently.

## Things not yet built that will be needed

- **Tailscale on the Pi**, installed before the unit is ever deployed. Otherwise every config change means driving to a parking lot and opening a weatherproof enclosure.
- **Delivery receipt loop.** The app should report back via `addNotificationReceivedListener`. FCM send-success overstates actual delivery, with reported gaps in the low double digits on Android.
- **EAS Update** for over-the-air JS changes that don't burn a build or wait on App Store review.
- **Budget alert on Google Cloud**, $10/month with email at 50/90/100%. A runaway retry loop in the Pi service is the realistic way this project gets expensive.

## Owner preferences

- No em dashes in written output. Flagged as an AI writing tell.
- Concise responses.
- Human, conversational tone.

## Open questions

- Does any TxDOT camera at drivetexas.org have a view of the Center St crossing? If so it is free real-time data and changes the architecture.
- Does the Heartland Flyer (Amtrak 821/822) pass within ~100m of the crossing? If it uses the UP mainline it is a free calibration signal via the Amtraker API.
- Faculty advisor not yet secured. Matters for both site-permission doors and capstone potential.
