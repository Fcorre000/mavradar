/// <reference types="jest" />
/// <reference types="node" />
import fs from 'fs';
import path from 'path';

import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { Freshness } from '@/constants/theme';
import { toReading } from '@/data/firestore-mapping';
import { devicePayload } from '@/lib/device-doc';

import { TYPICAL_MIN_SAMPLES } from '../stats';
import { REPORTED_STATES } from '../types';

// The shared contract at the repo root. Read with fs, not require, so Jest and Metro config
// don't matter, and listed from disk so a new example file is picked up without editing this test.
const CONTRACT = path.resolve(__dirname, '../../../../contract');
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword('x-firestore');
ajv.addKeyword('x-typicalMinSamples');

const schemas: Record<string, any> = {};
const schema = (name: string) =>
  (schemas[name] ??= readJson(path.join(CONTRACT, 'schemas', 'firestore', `${name}.schema.json`)));

// Compiled once per schema: ajv throws if the same $id is added twice.
const validators: Record<string, ValidateFunction> = {};
const validate = (name: string) => (validators[name] ??= ajv.compile(schema(name)));

/** [file relative to the examples folder, parsed example, expected verdict] for each example. */
function examples(name: string, only?: 'valid' | 'invalid'): [string, any, boolean][] {
  const folders = only ? [only] : (['valid', 'invalid'] as const);
  return folders.flatMap((folder) => {
    const dir = path.join(CONTRACT, 'examples', name, folder);
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f): [string, any, boolean] => [`${folder}/${f}`, readJson(path.join(dir, f)), folder === 'valid']);
  });
}

const timing: { appDelayedSec: number; appUnknownSec: number } = readJson(path.join(CONTRACT, 'timing.json'));

describe.each(['crossing', 'blockage-event', 'history-summary', 'device'])('%s examples', (name) => {
  it.each(examples(name))('%s matches its folder', (_file, ex, valid) => expect(validate(name)(ex)).toBe(valid));
});

it.each(examples('crossing', 'valid'))('%s maps to a CrossingReading', (_file, ex) => {
  const ts = (iso: string | null) => (iso ? { toMillis: () => Date.parse(iso) } : null);
  expect(
    toReading('794980D', {
      ...ex,
      since: ts(ex.since),
      stoppedAt: ts(ex.stoppedAt),
      detectedAt: ts(ex.detectedAt),
      clearSince: ts(ex.clearSince),
      lastReadingAt: ts(ex.lastReadingAt),
    }),
  ).toEqual({
    crossingId: '794980D',
    state: ex.state,
    since: ex.since && Date.parse(ex.since),
    stoppedAt: ex.stoppedAt && Date.parse(ex.stoppedAt),
    detectedAt: ex.detectedAt && Date.parse(ex.detectedAt),
    clearSince: ex.clearSince && Date.parse(ex.clearSince),
    lastReadingAt: Date.parse(ex.lastReadingAt),
    sensorName: ex.sensor.name,
    sensorBatteryOk: ex.sensor.batteryOk,
  });
});

it('ReportedState matches the contract', () =>
  expect([...REPORTED_STATES]).toEqual(schema('crossing').$defs.reportedState.enum));

it('what registerDevice writes is a valid device document', () => {
  expect(validate('device')(devicePayload('anon-uid', 'android', '2026-10-08T21:14:03.250Z', ['794980D']))).toBe(true);
  expect(validate('device')(devicePayload('anon-uid', 'ios', '2026-10-08T21:14:03.250Z'))).toBe(true);
});

it('registerDevice never wipes or overfills subscriptions', () => {
  // A merge write without the key keeps what is stored; with it, the contract caps the list at 20.
  expect(devicePayload('anon-uid', 'ios', '2026-10-08T21:14:03.250Z')).not.toHaveProperty('subscriptions');
  const many = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(6, '0')}A`);
  expect(devicePayload('anon-uid', 'android', '2026-10-08T21:14:03.250Z', many).subscriptions).toHaveLength(20);
});

it('freshness thresholds match the contract', () => {
  expect(Freshness.liveMaxSeconds).toBe(timing.appDelayedSec);
  expect(Freshness.delayedMaxSeconds).toBe(timing.appUnknownSec);
});

it('typical-time sample floor matches the contract', () =>
  expect(TYPICAL_MIN_SAMPLES).toBe(schema('history-summary')['x-typicalMinSamples']));
