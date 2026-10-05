# MavRadar app

Expo (React Native) app, SDK 57, expo-router, TypeScript. This guide gets it running in **Expo Go** on a phone from a fresh machine, on Windows or Mac. Expo Go runs the app on demo data with no push notifications. Testing push needs the dev client build (see the end).

## 1. Install the tools

You need Git, **Node 22** (the version in `/.nvmrc`), and the Expo Go app on your phone (Play Store or App Store, it must support SDK 57).

Use Node 22, not whatever is newest. Newer Node versions break the Jest tests (`SecurityError: Cannot initialize local storage without a --localstorage-file path`).

**Windows** (PowerShell):

```powershell
node -v                                   # if this prints anything other than v22.x, remove that Node first:
winget uninstall --id OpenJS.NodeJS --exact
winget install --id OpenJS.NodeJS.22 --exact
```

The uninstall needs admin rights. If it fails with exit code 1603, run it from a PowerShell opened with "Run as administrator". Close and reopen your terminal after installing so it picks up the new Node.

**Mac** (Terminal), using nvm:

```bash
brew install nvm                          # then follow brew's printed steps to add nvm to your shell
nvm install                               # run from the repo root, reads .nvmrc
nvm use
```

Check with `node -v`. It should print `v22.x`.

## 2. Clone and install dependencies

Same on both platforms:

```bash
git clone https://github.com/Fcorre000/mavradar.git
cd mavradar/app
npm ci
npm test                                  # should pass every suite; if not, check your Node version
```

Use `npm ci`, not `npm install`, so you get exactly the versions in `package-lock.json`.

## 3. Get the two gitignored config files

The repo is public, so two files never get committed and **a git pull will never bring them**. Every new machine has to fetch them once from Firebase. You need access to the `mavradar-4a74a` Firebase project.

| File | What breaks without it |
|---|---|
| `app/google-services.json` | Expo can't read the config: `Could not parse Expo config: android.googleServicesFile` and the phone hangs on loading |
| `app/.env` | App crashes on launch: `Firebase: Error (auth/invalid-api-key)`, followed by "Route is missing the required default export" warnings |

Install the Firebase CLI and log in with the Google account that has access to the project:

```bash
npm install -g firebase-tools
firebase login
```

From `app/`, download `google-services.json`:

```bash
firebase apps:sdkconfig ANDROID --project mavradar-4a74a --out google-services.json
```

Then create `.env` from the template:

```powershell
Copy-Item .env.example .env               # Windows
```

```bash
cp .env.example .env                      # Mac
```

Print the web app config and copy two values into `.env`:

```bash
firebase apps:sdkconfig WEB --project mavradar-4a74a
```

`apiKey` goes in `EXPO_PUBLIC_FIREBASE_API_KEY` and `appId` goes in `EXPO_PUBLIC_FIREBASE_APP_ID`. No quotes, no spaces around the `=`.

If you'd rather click: Firebase console > Project settings > Your apps. The Android app has a "Download google-services.json" button, and the Web app shows `apiKey` and `appId`.

### Check it

Expo Go can't tell you whether these are right: it only crashes when a value is missing, and a wrong key goes unnoticed until push testing. So check from `app/`:

```bash
npm run check:firebase
```

It checks both files, then signs in to Firebase as a throwaway anonymous user, reads one crossing the way the app does, and deletes that user again. Every line should say `ok`:

```
google-services.json
  ok    project mavradar-4a74a, package io.github.fcorre000.mavradar
.env
  ok    API key is filled in
  ok    Web app ID matches the project
Firebase project (live)
  ok    API key accepted, anonymous sign-in works
  ok    Firestore reachable and rules allow signed-in reads (no crossing doc yet, expected)
```

Any `FAIL` line says what to fix. "No crossing doc yet" is a pass: the read was allowed, and the server just hasn't written crossing data yet.

## 4. Log in to Expo

```bash
npx expo login
```

If you skip this, the dev server stops and asks "Log in / Proceed anonymously" the first time your phone connects. The phone sits on the loading screen until you answer in the terminal. Picking "Proceed anonymously" also works.

## 5. Run it

From `app/`:

```bash
npx expo start --go --clear
```

Scan the QR code. On Android, use the scanner inside Expo Go. On iPhone, use the Camera app. The phone and computer must be on the same Wi-Fi.

Use `--clear` the first time and any time you change `.env`, because Expo bakes the `EXPO_PUBLIC_*` values into the bundle.

## Warnings you can ignore in Expo Go

- `expo-notifications ... removed from Expo Go` and `not fully supported in Expo Go`. Push needs the dev client build.
- `An update for expo is available` and `npx expo-doctor` reporting a few patch version mismatches. Harmless.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Phone stuck loading, terminal shows "Log in / Proceed anonymously" | Answer the prompt, or run `npx expo login` |
| `Could not parse Expo config: android.googleServicesFile` | `app/google-services.json` is missing, see step 3 |
| `auth/invalid-api-key` and "missing the required default export" | `app/.env` is missing or empty, see step 3, then restart with `--clear` |
| Not sure step 3 worked | `npm run check:firebase` from `app/` |
| Jest fails with `--localstorage-file` | Wrong Node version, install Node 22 (step 1), then `npm ci` again |
| Phone can't reach the dev server at all | On Windows, allow Node through the firewall when prompted. Otherwise run `npx expo start --go --tunnel` |
| `node -v` still shows the old version on Windows | Open a new terminal |

## Other commands

```bash
npm test                                  # Jest tests for the domain rules
npm run check:firebase                    # checks google-services.json and .env against Firebase
npm run lint                              # expo lint
npx expo-doctor                           # project health check
eas build -p android --profile development   # dev client APK, needed to test push
```

To test push, install the dev client APK on a physical Android phone and run `npm start` instead of `npx expo start --go`.
