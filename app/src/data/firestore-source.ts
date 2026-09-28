import { doc, onSnapshot, type DocumentData, type Timestamp } from 'firebase/firestore';

import type { Connection, CrossingReading, ReportedState, SourceSnapshot } from '@/domain/types';
import { db } from '@/lib/firebase';

import type { CrossingSource } from './source';

/**
 * Live crossing status from Firestore. Not used yet: the server doesn't write crossings/{usdotId}
 * so the app runs on DemoEngine. Expected document shape (to agree with the server):
 *
 *   state: 'clear' | 'approaching' | 'blocked' | 'stopped' | 'sensorOffline'
 *   since, stoppedAt, detectedAt, clearSince: Timestamp | null
 *   lastReadingAt: Timestamp            last heartbeat from the node
 *   sensor: { name: string, batteryOk: boolean }
 *
 * History (crossings/{usdotId}/events) is read in a later step.
 */
export class FirestoreSource implements CrossingSource {
  readonly kind = 'live' as const;

  constructor(private readonly crossingIds: string[]) {}

  subscribe(listener: (snapshot: SourceSnapshot) => void): () => void {
    const readings: Record<string, CrossingReading> = {};
    let connection: Connection = 'online';
    let lastSyncAt = 0;
    const emit = () => listener({ now: Date.now(), connection, lastSyncAt, readings: { ...readings }, events: [] });

    const unsubscribes = this.crossingIds.map((id) =>
      onSnapshot(
        doc(db, 'crossings', id),
        { includeMetadataChanges: true },
        (snap) => {
          // Served from cache means no fresh data from the server right now.
          connection = snap.metadata.fromCache ? 'phone' : 'online';
          if (!snap.metadata.fromCache) lastSyncAt = Date.now();
          const data = snap.data();
          if (data) readings[id] = toReading(id, data);
          emit();
        },
        () => {
          connection = 'server';
          emit();
        },
      ),
    );
    // Re-emit every second so freshness keeps aging even when no document changes.
    const ticker = setInterval(emit, 1000);
    return () => {
      unsubscribes.forEach((u) => u());
      clearInterval(ticker);
    };
  }
}

const ms = (t: Timestamp | null | undefined) => (t ? t.toMillis() : null);

function toReading(crossingId: string, d: DocumentData): CrossingReading {
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
