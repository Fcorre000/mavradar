import type { DocumentData } from 'firebase/firestore';

import type { CrossingReading, ReportedState } from '@/domain/types';

// Kept apart from firestore-source.ts so Jest can load it without initializing Firebase.

/** A Firestore Timestamp, or anything else that reads as epoch milliseconds. */
interface TimestampLike {
  toMillis(): number;
}

const ms = (t: TimestampLike | null | undefined) => (t ? t.toMillis() : null);

/**
 * Maps a crossings/{usdotId} document to a CrossingReading. The full shape lives in
 * contract/schemas/firestore/crossing.schema.json; the fields read here:
 *
 *   state: 'clear' | 'approaching' | 'blocked' | 'stopped' | 'sensorOffline'
 *   since, stoppedAt, detectedAt, clearSince: Timestamp | null
 *   lastReadingAt: Timestamp            last heartbeat from the node
 *   sensor: { name: string, batteryOk: boolean }
 */
export function toReading(crossingId: string, d: DocumentData): CrossingReading {
  return {
    crossingId,
    state: (d.state as ReportedState) ?? 'sensorOffline',
    since: ms(d.since),
    stoppedAt: ms(d.stoppedAt),
    detectedAt: ms(d.detectedAt),
    clearSince: ms(d.clearSince),
    lastReadingAt: ms(d.lastReadingAt) ?? 0,
    sensorName: d.sensor?.name ?? 'Sensor',
    sensorBatteryOk: d.sensor?.batteryOk ?? true,
  };
}
