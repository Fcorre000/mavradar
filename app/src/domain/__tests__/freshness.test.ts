/// <reference types="jest" />
import { effectiveState } from '../freshness';
import type { CrossingReading } from '../types';

const NOW = new Date(2026, 8, 28, 14, 48, 0).getTime();

const reading = (over: Partial<CrossingReading> = {}): CrossingReading => ({
  crossingId: '794978C',
  state: 'clear',
  since: null,
  stoppedAt: null,
  detectedAt: null,
  clearSince: NOW - 30 * 60_000,
  lastReadingAt: NOW - 5_000,
  sensorName: 'East node',
  sensorBatteryOk: true,
  ...over,
});
const online = { now: NOW, connection: 'online' as const, lastSyncAt: NOW };

describe('effectiveState', () => {
  it('shows the reported state while fresh', () => {
    const e = effectiveState(reading(), online);
    expect(e.state).toBe('clear');
    expect(e.freshness).toBe('live');
  });

  it('marks a reading older than 30 s as delayed but keeps the state', () => {
    const e = effectiveState(reading({ lastReadingAt: NOW - 45_000 }), online);
    expect(e.state).toBe('clear');
    expect(e.freshness).toBe('delayed');
  });

  it('never shows Clear once the reading is older than 90 s', () => {
    const e = effectiveState(reading({ lastReadingAt: NOW - 91_000 }), online);
    expect(e.state).toBe('unknown');
    expect(e.cause).toBe('sensor');
  });

  it('drops a stale Blocked too', () => {
    const e = effectiveState(reading({ state: 'blocked', since: NOW - 7 * 60_000, lastReadingAt: NOW - 120_000 }), online);
    expect(e.state).toBe('unknown');
  });

  it('treats a sensor-reported outage as unknown', () => {
    expect(effectiveState(reading({ state: 'sensorOffline' }), online).state).toBe('unknown');
  });

  it('shows unknown with the phone as the cause when offline', () => {
    const e = effectiveState(reading(), { now: NOW, connection: 'phone', lastSyncAt: NOW - 120_000 });
    expect(e.state).toBe('unknown');
    expect(e.cause).toBe('phone');
    expect(e.lastAt).toBe(NOW - 120_000);
  });

  it('shows unknown with the server as the cause when MavRadar is unreachable', () => {
    expect(effectiveState(reading(), { now: NOW, connection: 'server', lastSyncAt: NOW }).cause).toBe('server');
  });

  it('shows unknown when there is no reading at all', () => {
    expect(effectiveState(undefined, online).state).toBe('unknown');
  });
});
