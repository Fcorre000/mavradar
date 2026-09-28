/// <reference types="jest" />
import { SERVICE_STATUS_CHANNEL, TRAIN_ALERTS_CHANNEL } from '@/lib/channels';

import { channelFor, initialAlertMemory, shouldDeliver, stepAlerts, type AlertMemory } from '../alerts';
import type { Effective } from '../freshness';
import type { CrossingState } from '../types';

const T0 = new Date(2026, 8, 28, 14, 0, 0).getTime();
const MIN = 60_000;

const eff = (state: CrossingState, over: Partial<Effective> = {}): Effective => ({
  state,
  freshness: state === 'unknown' ? 'unknown' : 'live',
  cause: state === 'unknown' ? 'sensor' : null,
  ageSec: 2,
  lastAt: T0,
  since: null,
  stoppedAt: null,
  detectedAt: null,
  clearSince: null,
  ...over,
});

/** Runs a sequence of [time, effective] observations and collects every alert. */
function run(steps: [number, Effective][], minBlock = 1) {
  let mem: AlertMemory = initialAlertMemory;
  const out: string[] = [];
  for (const [t, e] of steps) {
    const r = stepAlerts(mem, e, t, minBlock);
    mem = r.memory;
    out.push(...r.alerts);
  }
  return out;
}

describe('stepAlerts', () => {
  it('stays silent on the first observation, even mid-blockage', () => {
    expect(run([[T0, eff('blocked', { since: T0 - 10 * MIN })]])).toEqual([]);
  });

  it('waits for the minimum blockage before alerting', () => {
    const since = T0 + MIN;
    const alerts = run(
      [
        [T0, eff('clear')],
        [T0 + MIN, eff('blocked', { since })],
        [T0 + 3 * MIN, eff('blocked', { since })],
        [T0 + 4 * MIN + 1, eff('blocked', { since })],
      ],
      3,
    );
    expect(alerts).toEqual(['blocked']);
  });

  it('sends one follow-up when a blocked train stops, and only one', () => {
    const since = T0 + MIN;
    const alerts = run([
      [T0, eff('clear')],
      [T0 + MIN, eff('blocked', { since })],
      [T0 + 2 * MIN, eff('blocked', { since })],
      [T0 + 3 * MIN, eff('stopped', { since })],
      [T0 + 4 * MIN, eff('blocked', { since })],
      [T0 + 5 * MIN, eff('stopped', { since })],
    ]);
    expect(alerts).toEqual(['blocked', 'stopped']);
  });

  it('sends cleared only for a blockage that was alerted', () => {
    const since = T0 + MIN;
    const short = run(
      [
        [T0, eff('clear')],
        [T0 + MIN, eff('blocked', { since })],
        [T0 + 2 * MIN, eff('clear')],
      ],
      3,
    );
    expect(short).toEqual([]);
    const long = run([
      [T0, eff('clear')],
      [T0 + MIN, eff('blocked', { since })],
      [T0 + 3 * MIN, eff('blocked', { since })],
      [T0 + 10 * MIN, eff('clear')],
    ]);
    expect(long).toEqual(['blocked', 'cleared']);
  });

  it('reports how long a cleared blockage lasted', () => {
    let mem = stepAlerts(initialAlertMemory, eff('clear'), T0, 1).memory;
    mem = stepAlerts(mem, eff('blocked', { since: T0 }), T0, 1).memory;
    mem = stepAlerts(mem, eff('blocked', { since: T0 }), T0 + 2 * MIN, 1).memory;
    const r = stepAlerts(mem, eff('clear'), T0 + 9 * MIN, 1);
    expect(r.alerts).toEqual(['cleared']);
    expect(r.clearedAfterMin).toBe(9);
  });

  it('never treats going Unknown as cleared', () => {
    const since = T0 + MIN;
    const alerts = run([
      [T0, eff('clear')],
      [T0 + MIN, eff('blocked', { since })],
      [T0 + 3 * MIN, eff('blocked', { since })],
      [T0 + 4 * MIN, eff('unknown')],
    ]);
    expect(alerts).toEqual(['blocked']);
  });

  it('sends one status-unknown note after 10 minutes of sensor silence', () => {
    const alerts = run([
      [T0, eff('clear')],
      [T0 + MIN, eff('unknown')],
      [T0 + 10 * MIN, eff('unknown')],
      [T0 + 11 * MIN + 1, eff('unknown')],
      [T0 + 30 * MIN, eff('unknown')],
    ]);
    expect(alerts).toEqual(['sensorOffline']);
  });
});

describe('shouldDeliver', () => {
  const prefs = { following: true, permission: 'granted' as const, types: { blocked: true, stopped: true, cleared: true }, mutedToday: false };

  it('needs a follow and granted permission', () => {
    expect(shouldDeliver('blocked', prefs)).toBe(true);
    expect(shouldDeliver('blocked', { ...prefs, following: false })).toBe(false);
    expect(shouldDeliver('blocked', { ...prefs, permission: 'denied' })).toBe(false);
  });

  it('respects alert types and mute, except for status notes', () => {
    expect(shouldDeliver('cleared', { ...prefs, types: { ...prefs.types, cleared: false } })).toBe(false);
    expect(shouldDeliver('blocked', { ...prefs, mutedToday: true })).toBe(false);
    expect(shouldDeliver('sensorOffline', { ...prefs, mutedToday: true })).toBe(true);
  });
});

describe('channelFor', () => {
  it('keeps demo alerts off the one-shot train-alerts channel', () => {
    for (const kind of ['blocked', 'stopped', 'cleared', 'sensorOffline'] as const) {
      expect(channelFor(kind, 'demo')).toBe(SERVICE_STATUS_CHANNEL);
    }
  });

  it('sends live train events on train-alerts and status notes on service-status', () => {
    expect(channelFor('blocked', 'live')).toBe(TRAIN_ALERTS_CHANNEL);
    expect(channelFor('sensorOffline', 'live')).toBe(SERVICE_STATUS_CHANNEL);
  });
});
