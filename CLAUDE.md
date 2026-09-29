# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MavRadar detects freight trains approaching a grade crossing with a 24GHz radar and pushes real-time alerts to a mobile app, so people can divert before they're stuck. The first site is the Center St crossing near UT Arlington, where students can divert to the West St underpass. The design is framed for any blocked crossing and for cities and emergency dispatch, not only UTA students. No public freight train position data exists, so the system detects trains directly.

Read `docs/MAVRADAR_HANDOFF.md` and then its amendments in order (`docs/MAVRADAR_HANDOFF_AMENDMENT_001.md` through `_003.md`) before doing significant work. The handoff has the original architecture and reasoning; the amendments supersede it where they disagree. Do not relitigate decisions documented there without new information.

## Repo layout

| Path | Contents |
|---|---|
| `app/` | Expo (React Native) mobile app, SDK 57, expo-router, TypeScript |
| `edge/` | Python detection service for the field node (not started) |
| `server/` | FastAPI ingest and fan-out on Cloud Run (not started) |
| `docs/` | Architecture handoff and amendments, course constraints |
| `firestore.rules`, `firebase.json` | Firestore rules and project config (project `mavradar-4a74a`) |

Data path: `OPS243-C radar -> Pi Zero 2 W -> uplink -> ingest API -> alert filter -> FCM -> phone`. The Firestore write happens after the push, never before. Latency is the tiebreaker for any architectural choice.

Field nodes sit about 550 m down the track on each side of the crossing (one node until money allows two), because a node at the crossing gives only a few seconds of warning. The uplink is a swappable transport; a Waveshare SIM7080G Cat-M HAT is on the BOM pending the procurement exception.

## Commands

App (run from `app/`):

```bash
npm start        # expo start (dev server, needs the dev client build, not Expo Go)
npm run android  # expo start --android
npm run ios      # expo start --ios
npm run web      # expo start --web
npm run lint     # expo lint
npm test         # jest (domain rules: freshness, alerts, copy, clustering)
npx expo start --go   # run in Expo Go on a phone (no push); the app runs on demo data
npx expo-doctor  # should pass 21/21
eas build -p android --profile development   # dev client APK
```

Firebase (run from the repo root):

```bash
firebase emulators:exec --only firestore "<test command>"   # test rules locally (Java is installed)
firebase deploy --only firestore:rules
```

The app has Jest tests for its domain rules; `edge/` and `server/` have none yet. Builds go through EAS cloud builds, never local Xcode or Android Studio (the dev machine is an 8GB M1 and deliberately has neither Xcode nor the Android emulator). **Android is the first platform**; test push on a physical Android phone. Code stays cross-platform, and iOS builds wait on Apple Developer enrollment.

Expo SDK 57 changed significantly. Check the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing app code (see `app/AGENTS.md`). Node version is in `.nvmrc`.

## App config

- `app/app.config.ts` replaced `app.json`. Android package and iOS bundle ID are `io.github.fcorre000.mavradar` (permanent). Scheme is `mavradar`.
- `google-services.json` stays gitignored. Locally it sits in `app/`; EAS gets it from the `GOOGLE_SERVICES_JSON` file secret.
- Firebase JS SDK config comes from `EXPO_PUBLIC_FIREBASE_*` env vars (`app/.env`, see `app/.env.example`).
- Token registration lives in one function, `registerDevice()` in `app/src/lib/push.ts`. Keep it that way; the iOS token path (Amendment 003, 5.2) is still undecided. It never prompts: the permission prompt only follows the in-app priming sheet.
- Crossing data comes from `source` in `app/src/data/index.ts`. It is the simulated `DemoEngine` (controls in Settings > Demo) until the server writes `crossings/{usdotId}`; then swap in `FirestoreSource`. Screens never know which one is active.
- Design specs and tokens: `docs/design/` (`SPECS.md`, `tokens.json`, and the HTML mockup). `app/src/constants/theme.ts` mirrors `tokens.json`.
- App icons, the notification icon, splash mark and favicon are generated from one SVG source: `node docs/design/icon/build-icons.mjs` (needs Google Chrome). Edit the script, not the PNGs.

## Hard rules

- **Never commit credentials.** The repo is public. Do not weaken the `.gitignore` entries for `.env`, `*.p8`, `*.p12`, `*.mobileprovision`, `google-services.json`, `GoogleService-Info.plist`, `serviceAccountKey.json`, `*-firebase-adminsdk-*.json`.
- **Never commit the field unit's deployment coordinates.** Exact mounting location stays out of the repo.
- **Assume 50+ feet from the nearest rail** in any siting code, config, or docs (railroad right-of-way).
- **Batch native config changes.** EAS free tier allows 15 Android and 15 iOS builds/month, and every `app.config.ts`/entitlement change triggers a rebuild. Get native config right in one pass.
- **Protect the one-shot alert channels.** On Android, the `train-alerts` notification channel's importance can't be raised after creation and the user owns it from then on. On iOS, the user is asked once whether to keep Time Sensitive alerts. Both must only ever carry a real train event. Everything else (node offline, degraded detection, tests) goes on `service-status`. Never send test pushes on `train-alerts` to real users.
- **Don't commit the instructor PDFs** in `docs/course/`. `COURSE_CONSTRAINTS.md` quotes what matters.

## Key architectural decisions (settled)

- Native app, not PWA (iOS web push is unreliable for safety alerts).
- FCM token multicast, not topics (topics optimize throughput, not latency). The feature research's per-crossing topics idea is superseded.
- Cloud Run with `min-instances=1` in `us-central1`, not Cloud Functions (no cold start in the hot path; keeps the FCM credential off the Pi).
- Native device push token via `getDevicePushTokenAsync`, not the Expo push service.
- Firebase Anonymous Auth for token registration, no signup. Device docs are keyed on the push token, not the uid.
- Firestore `(default)` database, `us-central1`, Native mode. Data is keyed by USDOT crossing ID (`crossings/{usdotId}`), with a BlockageEvent log from the first deploy.
- Every FCM message sets `android.priority: "high"` and `android.notification.channel_id`.

## Writing style

- No em dashes in written output.
- Concise, human, conversational tone.
