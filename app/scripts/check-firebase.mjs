// Checks the two gitignored config files from README step 3 against the real Firebase project.
//
//   npm run check:firebase
//
// Run from app/. Needs Node 22 and a network connection. It signs in as a throwaway anonymous user,
// reads one crossing doc the way the app does, then deletes that user again. Nothing is printed
// that would leak the key.

import { existsSync, readFileSync } from 'node:fs';

const PROJECT_ID = 'mavradar-4a74a';
const PACKAGE = 'io.github.fcorre000.mavradar';
const PROBE_DOC = 'crossings/794978C'; // Center St

let failed = false;

// Windows editors and PowerShell can save files as UTF-16 or with a byte order mark. Expo and the
// Gradle plugin can't read those, and the values look fine in the editor, so name it plainly.
function encodingProblem(path) {
  const b = readFileSync(path);
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return 'is saved as UTF-16';
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'is saved with a byte order mark (BOM)';
  return null;
}
const ENCODING_FIX = 'Re-save it as plain "UTF-8" (VS Code: click the encoding in the status bar > Save with Encoding > UTF-8).';
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg, fix) => {
  failed = true;
  console.log(`  FAIL  ${msg}\n        ${fix}`);
};

console.log('google-services.json');
let projectNumber;
if (!existsSync('google-services.json')) {
  fail('app/google-services.json is missing', 'Run the "firebase apps:sdkconfig ANDROID" command in README step 3, from app/.');
} else if (encodingProblem('google-services.json')) {
  fail(`app/google-services.json ${encodingProblem('google-services.json')}`, ENCODING_FIX);
} else {
  try {
    const g = JSON.parse(readFileSync('google-services.json', 'utf8'));
    projectNumber = g.project_info?.project_number;
    if (g.project_info?.project_id !== PROJECT_ID) {
      fail(`it belongs to project "${g.project_info?.project_id}"`, `Download it again with --project ${PROJECT_ID}.`);
    } else if (!g.client?.some((c) => c.client_info?.android_client_info?.package_name === PACKAGE)) {
      fail(`it has no Android app for ${PACKAGE}`, 'Download it again; the Android app in Firebase must use that package name.');
    } else {
      ok(`project ${PROJECT_ID}, package ${PACKAGE}`);
    }
  } catch {
    fail('it is not valid JSON', 'Delete it and download it again (README step 3).');
  }
}

console.log('.env');
let apiKey;
let appId;
if (!existsSync('.env')) {
  fail('app/.env is missing', 'Copy .env.example to .env and fill in both values (README step 3).');
} else if (encodingProblem('.env')) {
  fail(`app/.env ${encodingProblem('.env')}`, ENCODING_FIX);
} else {
  process.loadEnvFile('.env');
  apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim();
  appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim();
  if (!apiKey) fail('EXPO_PUBLIC_FIREBASE_API_KEY is empty', 'Paste apiKey from "firebase apps:sdkconfig WEB".');
  else if (!/^AIza[\w-]{35}$/.test(apiKey)) fail('EXPO_PUBLIC_FIREBASE_API_KEY does not look like a Firebase API key', 'It starts with AIza and has no quotes or spaces.');
  else ok('API key is filled in');
  if (!appId) fail('EXPO_PUBLIC_FIREBASE_APP_ID is empty', 'Paste appId from "firebase apps:sdkconfig WEB".');
  else if (!/^1:\d+:web:[0-9a-f]+$/.test(appId)) fail('EXPO_PUBLIC_FIREBASE_APP_ID does not look like a Web app ID', 'Use the WEB appId (1:...:web:...), not the Android one, with no quotes.');
  else if (projectNumber && appId.split(':')[1] !== String(projectNumber)) fail('the app ID is from a different Firebase project', `Copy it from the ${PROJECT_ID} Web app.`);
  else ok('Web app ID matches the project');
}

if (apiKey && !failed) {
  console.log('Firebase project (live)');
  try {
    const signUp = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, { returnSecureToken: true });
    if (signUp.error) {
      const reason = signUp.error.message ?? '';
      if (reason.includes('API key not valid')) fail('Firebase rejected the API key', 'Copy apiKey again from "firebase apps:sdkconfig WEB".');
      else if (reason.includes('ADMIN_ONLY_OPERATION') || reason.includes('OPERATION_NOT_ALLOWED')) fail('anonymous sign-in is turned off', 'Firebase console > Authentication > Sign-in method > Anonymous.');
      else fail(`anonymous sign-in failed: ${reason}`, 'Check the API key and that Authentication is set up.');
    } else {
      ok('API key accepted, anonymous sign-in works');
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${PROBE_DOC}`, {
        headers: { Authorization: `Bearer ${signUp.idToken}` },
      });
      // 404 is a pass: the read was allowed, the server just hasn't written that crossing yet.
      if (res.status === 200 || res.status === 404) ok(`Firestore reachable and rules allow signed-in reads (${res.status === 200 ? 'crossing doc found' : 'no crossing doc yet, expected'})`);
      else if (res.status === 403) fail('Firestore refused the read', 'Deploy the rules from the repo root: firebase deploy --only firestore:rules');
      else fail(`Firestore answered ${res.status}`, 'Check that the (default) Firestore database exists in the project.');
      // Clean up the throwaway user so checks don't pile up accounts in the project.
      await post(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, { idToken: signUp.idToken });
    }
  } catch (err) {
    fail(`could not reach Firebase (${err.cause?.code ?? err.message})`, 'Check your internet connection and try again.');
  }
}

console.log(failed ? '\nSetup is not complete yet. Fix the FAIL lines above and run this again.' : '\nAll good. Restart Expo with --clear if you just changed .env.');
process.exitCode = failed ? 1 : 0;

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}
