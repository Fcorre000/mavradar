import { Freshness } from '@/constants/theme';

import type { Connection, CrossingReading, CrossingState, UnknownCause } from './types';

export type FreshnessKind = 'live' | 'delayed' | 'unknown';

/** What the app shows for a crossing after applying the trust rules. */
export interface Effective {
  state: CrossingState;
  freshness: FreshnessKind;
  cause: UnknownCause | null;
  /** Seconds since the last reading. */
  ageSec: number;
  /** Time of the last reading (sensor) or last sync (phone, server). 0 if never. */
  lastAt: number;
  since: number | null;
  stoppedAt: number | null;
  detectedAt: number | null;
  clearSince: number | null;
}

interface Context {
  now: number;
  connection: Connection;
  lastSyncAt: number;
}

/**
 * The trust rule: never show a state the data can't back.
 * - Phone or server offline: Unknown, with the last sync time.
 * - Sensor reports itself offline, or no reading at all: Unknown.
 * - Last reading older than `Freshness.delayedMaxSeconds`: Unknown. The old state word is dropped.
 * - Older than `Freshness.liveMaxSeconds`: the state stays, marked Delayed.
 */
export function effectiveState(reading: CrossingReading | undefined, ctx: Context): Effective {
  const base = { since: null, stoppedAt: null, detectedAt: null, clearSince: null };
  if (ctx.connection !== 'online') {
    return { ...base, state: 'unknown', freshness: 'unknown', cause: ctx.connection, ageSec: (ctx.now - ctx.lastSyncAt) / 1000, lastAt: ctx.lastSyncAt };
  }
  if (!reading) {
    return { ...base, state: 'unknown', freshness: 'unknown', cause: 'sensor', ageSec: Infinity, lastAt: 0 };
  }
  const ageSec = Math.max(0, (ctx.now - reading.lastReadingAt) / 1000);
  if (reading.state === 'sensorOffline' || ageSec > Freshness.delayedMaxSeconds) {
    return { ...base, state: 'unknown', freshness: 'unknown', cause: 'sensor', ageSec, lastAt: reading.lastReadingAt };
  }
  return {
    state: reading.state,
    freshness: ageSec > Freshness.liveMaxSeconds ? 'delayed' : 'live',
    cause: null,
    ageSec,
    lastAt: reading.lastReadingAt,
    since: reading.since,
    stoppedAt: reading.stoppedAt,
    detectedAt: reading.detectedAt,
    clearSince: reading.clearSince,
  };
}

export const isBlocking = (s: CrossingState) => s === 'blocked' || s === 'stopped';
