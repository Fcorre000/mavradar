
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} = require('firebase/firestore');

let env;

function deviceData(uid = 'user-1') {
  return {
    uid,
    platform: 'ios',
    updatedAt: serverTimestamp(),
    subscriptions: ['794980D'],
    alertTypes: {
      approaching: false,
      blocked: true,
      stopped: true,
      cleared: true,
    },
    minBlockMin: 1,
    quietHours: null,
    commuteWindows: null,
    timeZone: 'America/Chicago',
  };
}

function deviceRef(uid = 'user-1') {
  return doc(
    env.authenticatedContext(uid).firestore(),
    'devices',
    'test-fcm-token'
  );
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mavradar-a3',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(
        path.resolve(__dirname, '../../firestore.rules'),
        'utf8'
      ),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  if (env) await env.cleanup();
});

test('accepts a valid device document', async () => {
  await assertSucceeds(
    setDoc(deviceRef(), deviceData())
  );
});

test('rejects invalid blockage threshold', async () => {
  await assertFails(
    setDoc(deviceRef(), {
      ...deviceData(),
      minBlockMin: 2,
    })
  );
});

test('rejects more than 20 subscriptions', async () => {
  await assertFails(
    setDoc(deviceRef(), {
      ...deviceData(),
      subscriptions: Array.from(
        { length: 21 },
        (_, i) => `crossing-${i}`
      ),
    })
  );
});

test('rejects an extra personal-data field', async () => {
  await assertFails(
    setDoc(deviceRef(), {
      ...deviceData(),
      email: 'test@example.com',
    })
  );
});

test('rejects another user updating device', async () => {
  await assertSucceeds(
    setDoc(deviceRef(), deviceData())
  );

  await assertFails(
    setDoc(deviceRef('user-2'), deviceData('user-2'))
  );
});

test('allows authenticated summary reads', async () => {
  const summaryPath = 'crossings/794980D/summary/7d';

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), summaryPath),
      { count: 3 }
    );
  });

  await assertSucceeds(
    getDoc(
      doc(
        env.authenticatedContext('user-1').firestore(),
        summaryPath
      )
    )
  );
});

test('rejects unauthenticated device writes', async () => {
  const ref = doc(
    env.unauthenticatedContext().firestore(),
    'devices',
    'test-fcm-token'
  );

  await assertFails(setDoc(ref, deviceData()));
});
