# MavRadar Handoff Amendment 003: Environment Check Before App Work

**Date:** 2026-09-26
**Updates:** `docs/MAVRADAR_HANDOFF.md`, Amendments 001 and 002, and root `CLAUDE.md`
**For:** a Claude Code session (or a teammate) opened at the repo root, about to start app code
**Framework decision:** React Native + Expo, confirmed by the team after Sprint 1. Do not re-scaffold.

---

## 0. How to use this

Work top to bottom. Sections 2 and 3 are the changes, in order. Anything marked **DECIDE**
is a permanent or team-level choice: stop and ask Fernando before doing it. Anything
marked **VERIFY** could not be checked from the repo (it lives in a web console) and needs
a human to look.

Do not start feature code until the checklist in section 8 is all ticked.

---

## 1. What was checked, and the verdict

Short version: **the existing setup is the right foundation for React Native + Expo and
nothing needs to be rebuilt.** Expo SDK 57 is still the current stable release (57.0.25 on
npm as of today; SDK 58 is in preview since 2026-09-10). The `.gitignore` works. The
problems are a wrong license file, docs that describe the pre-Sprint 1 design, missing
native identifiers, and Firebase pieces that exist in the console but not in the repo.

| Item | Found | Status |
|---|---|---|
| Remote | `github.com/Fcorre000/mavradar`, public, `main` in sync with `origin/main`, 4 commits | OK |
| Root `LICENSE` | **GPL-3.0.** README, charter, and team decision all say MIT. GitHub's sidebar shows GPL-3.0. | **CHANGE** |
| `app/LICENSE` | Expo template's MIT license, copyright 650 Industries | **CHANGE** (delete) |
| Expo SDK | `expo ~57.0.14`, RN 0.86.2, React 19.2.3, TypeScript 6, expo-router, React Compiler on | OK, patch bump available |
| `expo-doctor` | 19 of 21 checks passed. The 2 failures were network only (sandbox could not reach the Expo API). | **VERIFY** on the Mac |
| EAS link | `owner: fcorre000s-team`, `projectId` set in `app.json` | OK |
| `eas.json` | Missing | **CHANGE** |
| `app.json` scheme | `"app"` (template default) | **CHANGE** |
| Android package / iOS bundle ID | Not set | **DECIDE**, then CHANGE |
| Push, dev client, Firebase packages | None installed | CHANGE (one batch) |
| `.gitignore` | Tested: `app/google-services.json`, `server/key.pem`, `edge/.env`, `app/.env.local`, `site/` are all ignored | OK |
| `edge/`, `server/` | Empty folders. Git does not track empty folders, so they are not on GitHub and teammates' clones won't have them. | CHANGE |
| Untracked files | `docs/FUTURE_MULTI_SITE_NETWORK.md`, Amendments 001 and 002, `docs/course/` (includes two instructor PDFs) | CHANGE (commit with care, see 2.4) |
| Firebase files in repo | No `firebase.json`, `.firebaserc`, `firestore.rules`, or indexes file. Rules exist only in the console. | CHANGE |
| Firebase console state | Can't be read from the repo | **VERIFY** (section 4) |
| Docs and `CLAUDE.md` | Still describe OPS243-A, Pi 4, a node at the crossing, iPhone-first testing, and a UTA-students-only audience | CHANGE (section 5) |

---

## 2. Repo fixes (no native rebuild involved)

### 2.1 License

1. Replace root `LICENSE` with the standard MIT text. Copyright line:
   `Copyright (c) 2026 Fernando Correa, Diego Yep, Gabriel Wynne, Kashish Bhandari, Rickey Claiborne`
2. Delete `app/LICENSE`. It is the Expo template's license, not ours.
3. After pushing, confirm GitHub's sidebar reads "MIT license".

This matters because the charter states MIT, and GPL-3.0 would force copyleft on anyone
reusing the code, including a city that wanted to run it.

### 2.2 Placeholder folders

Add `edge/README.md` and `server/README.md`, a few lines each: what goes there, "not started",
and a pointer to the handoff. Add an empty `.env.example` in each so the root README's claim
("see `.env.example` in each directory") is true.

### 2.3 Patch bump and doctor

From `app/`:

```bash
npx expo install --fix      # moves ~57.0.14 packages to current 57.x patches
npx expo-doctor             # expect 21/21 on the Mac
```

Stay on SDK 57. Revisit SDK 58 once it is stable, and only between sprints, never right
before a demo.

### 2.4 Commit the untracked docs, carefully

- **Before committing Amendment 002, delete open item 11** (the note about a macOS password
  exposed in a chat transcript). The note contains no password, but it doesn't belong in a
  public repo. Separately, confirm the password was actually rotated.
- **Keep the two instructor PDFs out of the public repo** unless Dr. Noor says they can be
  shared. Add `docs/course/*.pdf` to `.gitignore` and commit `COURSE_CONSTRAINTS.md`, which
  already quotes what matters. (A scan found no emails or phone numbers in them, so this is
  about redistribution, not privacy.)
- Commit `FUTURE_MULTI_SITE_NETWORK.md` and Amendment 001 as they are.

### 2.5 Team access (it's a five-person team now)

- GitHub: add Diego, Gabe, Kashish, Rickey as collaborators. Protect `main` (PRs required,
  no force push). Confirm secret scanning and push protection are on (free for public repos).
- Expo: invite teammates to the `fcorre000s-team` account so they can run builds.
- Firebase: add teammates in Project settings > Users and permissions with the least role
  that works (Viewer for most, Editor for whoever writes rules). Nobody but the backend owner
  should be able to create service account keys.

### 2.6 Where the repo lives

The repo sits in `~/Desktop`. If Desktop is synced to iCloud (System Settings > Apple ID >
iCloud Drive > Desktop & Documents), move the repo to `~/Projects` before installing more
packages. iCloud syncing `node_modules` causes slow installs and Metro "file not found"
errors. **VERIFY.**

---

## 3. The one native config batch

Every item here changes native config, and every native change costs an EAS build. The free
plan allows 15 Android and 15 iOS builds a month, on a low-priority queue. Do all of this in
one commit, then build once.

### 3.1 DECIDE first: package name and bundle ID

The Android package name is **permanent** once an app is uploaded to Google Play, and the
Firebase Android app is registered against it. UTA won't fund a domain, so don't use a domain
we don't control. Recommendation:

- Android `package`: `io.github.fcorre000.mavradar`
- iOS `bundleIdentifier`: `io.github.fcorre000.mavradar` (same string, unused until Apple enrollment clears)

Check with Rickey, since the Google Play listing (SCRUM-7) depends on it.

**Decided 2026-09-26 (Fernando):** `io.github.fcorre000.mavradar` for both. It is in
`app/app.config.ts`. Register the Firebase Android app against exactly this string.

### 3.2 Packages

```bash
npx expo install expo-notifications expo-dev-client firebase @react-native-async-storage/async-storage
```

- `expo-notifications` gets the native FCM token on Android via `getDevicePushTokenAsync`.
- `expo-dev-client` because push, and later geofencing, don't work in Expo Go.
- `firebase` (the JS SDK) for Anonymous Auth and the token write to Firestore. Use
  `initializeAuth` with React Native persistence backed by AsyncStorage so the anonymous
  user survives restarts. Follow Expo's current "Using Firebase" guide for SDK 57.

**Not now:** `expo-location` and any background location permission. Amendment 002 already
decided to leave location out of the v1 batch. The feature research's geofencing idea is still
Phase 2 and still costs exactly one extra build when it lands.

### 3.3 Convert `app.json` to `app.config.ts`

Needed because `google-services.json` is gitignored (correctly), and EAS uploads the project
using `.gitignore`, so the build server never sees the file. The fix is an EAS file variable:

```bash
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
  --visibility secret --environment development --environment preview --environment production
```

and in `app.config.ts`:

```ts
android: {
  package: "io.github.fcorre000.mavradar",
  googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  // adaptiveIcon etc. carried over unchanged
},
```

Local dev reads `./google-services.json` from `app/` (ignored). EAS reads the secret.

### 3.4 Other config changes in the same commit

- `scheme`: `"app"` becomes `"mavradar"`. `"app://"` is a generic deep link other apps can claim.
- `plugins`: add `"expo-notifications"` (default icon and color for Android notifications).
- `ios.bundleIdentifier` and the Time Sensitive entitlement
  (`com.apple.developer.usernotifications.time-sensitive: true`). No iOS build will run until
  Apple enrollment clears, but putting it in now means the first iOS build needs no config change.
- `package.json` `"name"`: `"app"` becomes `"mavradar-app"` (cosmetic, free while we're here).

### 3.5 Android notification channels (Android's version of the Time Sensitive rule)

Android-first means the channel that matters first is an Android notification channel, and it
has the same one-shot quality as iOS Time Sensitive: **once a channel exists, the app can't
raise its importance, and the user controls it from then on.** Get it right the first time.

- Create channels in code at startup, before asking for notification permission. On Android
  13+, the permission prompt won't show until a channel exists.
- `train-alerts`: `AndroidImportance.MAX`, sound and vibration on. Only real train events.
- `service-status`: default importance. Node offline, detection degraded, anything that isn't a train.
- The server must set `android.notification.channel_id` and `android.priority: "high"` in every
  FCM v1 message. Never send test pushes on `train-alerts` to real users.

### 3.6 `eas.json`

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal",
                     "android": { "buildType": "apk" }, "environment": "development" },
    "preview":     { "distribution": "internal",
                     "android": { "buildType": "apk" }, "environment": "preview" },
    "production":  { "android": { "buildType": "app-bundle" }, "environment": "production" }
  }
}
```

Build once with `eas build -p android --profile development`, install the APK on a physical
Android phone, and run the smoke test in section 8.

---

## 4. Firebase: VERIFY in the console, then bring it into the repo

Nobody could read the console from the repo, so a human checks each of these and ticks it.

| Check | Expected |
|---|---|
| Firestore database ID and location | `(default)`, `us-central1`, Native mode. Both are permanent. |
| Firestore rules | Production mode (locked). Will be replaced by the file in 4.2. |
| Authentication > Sign-in method | **Anonymous enabled.** (Still open from Amendment 002.) |
| Identity Platform | If upgraded, **automatic deletion of anonymous accounts is off.** |
| Project settings > Your apps | An **Android app registered with the package from 3.1.** Download its `google-services.json` into `app/` (ignored). If an app was registered earlier under another package, register a new one; the package can't be edited. |
| Cloud Messaging | Firebase Cloud Messaging API (V1) enabled. Legacy API off. |
| Billing plan | Still Spark. Blaze and the $10/month budget alert wait for the backend (Amendment 002, item 9). |
| Service accounts | **No keys generated yet.** Still wait until `server/` exists. |
| Future Cloud Run region | Plan on `us-central1` too, so the ingest API and Firestore share a region. |

### 4.1 Put Firebase config under version control

From the repo root, with the Firebase CLI logged in:

```bash
firebase init firestore     # pick the existing project, accept firestore.rules and firestore.indexes.json
```

This creates `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`.
All four are safe to commit. The project ID in `.firebaserc` is not a secret, and neither is
the API key in `google-services.json`; that file stays ignored anyway, per the standing rule.
Rules then deploy with `firebase deploy --only firestore:rules`, and changes go through PRs.

### 4.2 First rules file

The locked database blocks token registration until this exists. Draft, sized to the data
model below. Server writes use the Admin SDK, which bypasses rules, so everything the app
doesn't touch stays denied.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Crossing status and history: readable by any app user, written only by the server.
    match /crossings/{usdotId} {
      allow read: if request.auth != null;
      match /events/{eventId} {
        allow read: if request.auth != null;
      }
    }

    // Device registry, keyed on the FCM token (Amendment 002, 4.1).
    match /devices/{fcmToken} {
      allow get: if request.auth != null && resource.data.uid == request.auth.uid;
      allow create: if validDevice();
      allow update: if validDevice() && resource.data.uid == request.auth.uid;
      allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }

    function validDevice() {
      let d = request.resource.data;
      return request.auth != null
        && d.uid == request.auth.uid
        && d.keys().hasOnly(['uid', 'platform', 'subscriptions', 'quietHours', 'updatedAt'])
        && d.platform in ['android', 'ios']
        && d.subscriptions is list && d.subscriptions.size() <= 20;
    }

    // Everything else (nodes, detections, tenants, alert log) is server-only.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Test with the Firestore emulator before deploying if Java is available. If not, deploy and
test from the dev build with one device.

### 4.3 Data model alignment

The feature research entities map onto Firestore like this. Only the first two are touched
by the app.

| Entity | Location | Written by |
|---|---|---|
| Crossing (keyed by USDOT ID, e.g. `794978C`) | `crossings/{usdotId}` | server |
| CrossingState (current status) | field on the crossing doc | server |
| BlockageEvent (permanent log) | `crossings/{usdotId}/events/{eventId}` | server, after the push |
| Subscription | `subscriptions` array on the device doc | app |
| SensorNode, Detection | `nodes/{nodeId}`, `nodes/{nodeId}/detections/...` | server |
| Tenant / ApiClient, AlertLog | top-level, server-only | server |
| CrowdReport | Phase 2, no rules until then | n/a |

The `eventId` is created at ingest, before the push, so a retried push and the later
Firestore write share one ID. That keeps alerts idempotent without putting a write in front
of the push.

---

## 5. Decisions that changed since the repo docs were written

Record these so the next reader doesn't build against the old design. Update root
`CLAUDE.md` in the same PR, since it's what an agent reads first.

| Topic | Repo docs say | Current decision (Sprint 1) |
|---|---|---|
| Radar | OPS243-A (Doppler only) | **OPS243-C** (Doppler + FMCW range, sees stopped trains). Still unordered; still the critical path. |
| Computer | Raspberry Pi 4, 2 GB | **Pi Zero 2 W** |
| Power | 20 W panel, PWM, 22 Ah AGM, separate LVD | **50 W panel, Victron SmartSolar MPPT 75/10, 12 V 20 Ah LiFePO4.** Victron load output replaces the LVD. |
| Uplink | LTE unavailable, swappable transport | BOM now carries a **Waveshare SIM7080G Cat-M HAT.** **VERIFY** whether the exception request came back yes; if not, it can't be bought with project funds. Swappable transport rule stands either way. |
| Placement | One unit at the crossing | Nodes **about 550 m down the track** on each side (5.6 s of warning at 100 m and 40 mph isn't enough). One node until money allows two. |
| Platform order | iOS first, physical iPhone for testing | **Android first**, physical Android phone for testing. Code stays cross-platform. |
| Audience | UTA students | Students first, but framed for cities, emergency dispatch, and any blocked crossing. Update the README opening accordingly (the professor's scalability concern). |
| Data model | Single crossing | Keyed by USDOT crossing ID from day one, with BlockageEvent logging from the first deploy. |

### 5.1 One conflict to settle: FCM topics vs token multicast

`CLAUDE.md` lists "FCM token multicast, not topics" as settled, because Firebase describes
topics as optimized for throughput, not latency. The app feature research suggested topics
per crossing and tier. **Keep token multicast.** The research added no new latency evidence,
and the in-memory crossing-to-token map (Amendment 002, section 5) already handles multiple
crossings. Treat the research's topic suggestion as superseded.

### 5.2 One gap to settle before iOS (does not block Android)

On Android, `getDevicePushTokenAsync` returns an FCM token, which the server sends to through
FCM v1. **On iOS it returns a raw APNs token, which FCM v1 cannot send to.** Before the first
iOS build, pick one:

- add `@react-native-firebase/messaging` so both platforms hand the server an FCM token, or
- have the server send iOS alerts straight to APNs (it already has to set
  `interruption-level: time-sensitive`).

Put the choice in the next amendment. Keep the token-registration code behind one function so
either path is a small change.

---

## 6. Things confirmed fine, don't change

- Public monorepo, `app/ edge/ server/ docs/` layout.
- npm with `package-lock.json`. Don't mix in yarn or pnpm.
- expo-router, TypeScript strict, `@/*` path alias, React Compiler and typed routes experiments.
- `.gitignore` as written. It already covers Firebase configs at any depth, keys, certs,
  binaries, `site/`, and LaTeX artifacts.
- `app/.claude/settings.json` (Expo plugin) and `app/AGENTS.md` ("read the SDK 57 docs") are
  useful. Keep them.
- Firestore `(default)` in `us-central1`, Anonymous Auth, token docs keyed on FCM token,
  push first then write, Cloud Run with `min-instances=1`.
- Node: the React Native 0.86 floor is Node 20.19.4, 22.13, or 24.3. Run `node -v` on the Mac
  (nvm is installed) and add an `.nvmrc` with whatever major passes, so teammates match.

---

## 7. Don'ts

- Don't commit `google-services.json`, service account keys, `.env` files, or deployment
  coordinates. The repo is public.
- Don't generate the FCM service account key until `server/` exists.
- Don't add location permissions in this batch.
- Don't send anything on the `train-alerts` channel that isn't a real train.
- Don't install Xcode or the Android emulator. Use EAS builds and a physical phone.
- Don't run `npm run reset-project` until the team agrees what replaces the template screens.
  It moves the template into `app-example/` and is the natural first task of app work, not
  part of this setup.

---

## 8. Done when

- [x] Root `LICENSE` is MIT, `app/LICENSE` removed. (Still to do: confirm GitHub shows "MIT license" after push.)
- [x] `edge/` and `server/` have READMEs and `.env.example`. (Visible on GitHub once committed.)
- [x] Amendment 002 item 11 removed; instructor PDFs ignored. (Still to do: commit the untracked docs; confirm the password was rotated.)
- [ ] Teammates added to GitHub, Expo, and Firebase; `main` protected
- [x] `npx expo install --fix` done (expo 57.0.25, RN 0.86.3); `npx expo-doctor` passes 21/21 on the Mac
- [x] Package name decided and recorded here
- [ ] Firebase console checks in section 4 ticked, Android app registered, `google-services.json` in `app/` and stored as an EAS secret
- [ ] `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` committed; rules deployed. (Files written and emulator-tested; not yet committed or deployed.)
- [ ] `app.config.ts`, `eas.json`, and new packages in one commit. (Done in the working tree, not yet committed.)
- [ ] One Android development build installed on a physical phone
- [ ] Smoke test on that phone: app opens, anonymous sign-in succeeds, notification permission granted, `train-alerts` channel exists in Android settings, `devices/{token}` doc appears in Firestore, and a test message sent to that token from the Firebase console (Messaging > Send test message, Android channel set to `service-status`) arrives. This needs no service account key.
- [x] Root `CLAUDE.md` and `README.md` updated per section 5

---

## 9. Setup log, 2026-09-26

What was done against this amendment, and where it differs from the text above.

**Verified from the Mac**
- Firestore: `(default)`, `us-central1`, `FIRESTORE_NATIVE` (checked with `firebase firestore:databases:get`).
  Delete protection is off; turning it on is a one-click safety net worth doing.
- Firebase project ID is `mavradar-4a74a`. **No apps are registered yet**, so the Android app
  (and a Web app, see below) still need registering.
- Node is v22.23.2; `.nvmrc` says `22`.
- iCloud: `~/Desktop` does not appear to be synced (no `Desktop` folder in iCloud Drive). Worth a
  glance in System Settings to be sure, but no move needed.

**Changes beyond the text above**
- **Rules: `subscriptions` and `quietHours` are optional, and `updatedAt` must equal
  `request.time`.** The app registers with a merge write of `uid`, `platform`, and
  `updatedAt` on every launch, so re-registering never wipes a user's subscriptions. The
  server should treat a missing `subscriptions` field as "default crossing" while there is
  only one. Emulator-tested: 20 cases covering ownership, takeover, field allowlist,
  platform, subscription cap, server-only collections, and unauthenticated access.
- **Firebase JS SDK config comes from a Web app**, the path Expo's Firebase guide documents.
  Register one in the console, then put its `apiKey` and `appId` in `app/.env` as
  `EXPO_PUBLIC_FIREBASE_API_KEY` and `EXPO_PUBLIC_FIREBASE_APP_ID`, and create the same two as
  EAS env vars for each environment. They are not secrets; they stay out of source so GitHub
  secret scanning doesn't flag the key.
- **Smoke-test plumbing is in** (`app/src/lib/push.ts`): channels created at startup before the
  permission prompt, anonymous sign-in, `devices/{token}` merge write. It runs from the root
  layout for now. `registerDevice()` is the single function to change for the iOS decision
  in 5.2.
- **`expo-notifications` plugin sets `defaultChannel: "service-status"`**, so an FCM message
  that forgets `channel_id` can never land on `train-alerts`.
- **No custom notification icon yet.** The app icons are still the Expo template's, and Android
  falls back to the app icon. A 96x96 white-on-transparent PNG added to the plugin's `icon`
  option would cost a build, so pair it with the real app icon when branding lands.
- `npm run lint` created `app/eslint.config.js` and added `eslint` and `eslint-config-expo`
  as dev dependencies. Lint reports one existing template error in
  `src/hooks/use-color-scheme.web.ts`, which goes away with the template screens.
- npm blocked two postinstall scripts (`@firebase/util`, `protobufjs`). Neither is needed
  for this app; leave them blocked.

