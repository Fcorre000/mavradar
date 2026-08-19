# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MavRadar detects freight trains approaching the Center St grade crossing near UT Arlington with a 24GHz doppler radar and pushes real-time alerts to a mobile app, so students can divert to the West St underpass. No public freight train position data exists, so the system detects trains directly.

Read `docs/MAVRADAR_HANDOFF.md` before doing significant work. It contains the full architecture, settled design decisions with reasoning, and current project state. Do not relitigate decisions documented there without new information.

## Repo layout

| Path | Contents |
|---|---|
| `app/` | Expo (React Native) mobile app, SDK 57, expo-router, TypeScript |
| `edge/` | Python detection service for the Raspberry Pi (not started) |
| `server/` | FastAPI ingest and fan-out on Cloud Run (not started) |
| `docs/` | Architecture handoff, BOM, site survey |

Data path: `OPS243-A radar -> Raspberry Pi 4 -> LTE -> ingest API -> alert filter -> FCM/APNs -> phone`. The Firestore write happens after the push, never before. The end-to-end warning window is 30 to 45 seconds; latency is the tiebreaker for any architectural choice.

## Commands

App (run from `app/`):

```bash
npm start        # expo start (dev server)
npm run ios      # expo start --ios
npm run android  # expo start --android
npm run web      # expo start --web
npm run lint     # expo lint
```

No test suite exists yet in any subproject. iOS builds go through EAS cloud builds, never local Xcode (the dev machine is an 8GB M1 and deliberately has neither Xcode nor the Android emulator). Push notification testing requires a physical iPhone; APNs tokens do not work in the Simulator.

Expo SDK 57 changed significantly. Check the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing app code (see `app/AGENTS.md`).

## Hard rules

- **Never commit credentials.** The repo is public. Do not weaken the `.gitignore` entries for `.env`, `*.p8`, `*.p12`, `*.mobileprovision`, `google-services.json`, `GoogleService-Info.plist`, `serviceAccountKey.json`, `*-firebase-adminsdk-*.json`.
- **Never commit the field unit's deployment coordinates.** Exact mounting location stays out of the repo.
- **Assume 50+ feet from the nearest rail** in any siting code, config, or docs (railroad right-of-way).
- **Batch native config changes.** EAS free tier allows 15 iOS builds/month, and every `app.json`/entitlement change triggers a rebuild. Get native config right in one pass.
- **Protect the Time Sensitive notification channel.** iOS asks the user once whether to keep Time Sensitive alerts from the app. It must only ever fire for a real train event; a false or irrelevant alert permanently burns the channel for that user.

## Key architectural decisions (settled)

- Native app, not PWA (iOS web push is unreliable for safety alerts).
- FCM token multicast, not topics (topics optimize throughput, not latency).
- Cloud Run with `min-instances=1`, not Cloud Functions (no cold start in the hot path; keeps the FCM credential off the Pi).
- Native device push token via `getDevicePushTokenAsync`, not the Expo push service.
- Firebase Anonymous Auth for token registration, no signup.

## Writing style

- No em dashes in written output.
- Concise, human, conversational tone.
