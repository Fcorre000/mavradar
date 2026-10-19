import { doc, onSnapshot } from 'firebase/firestore';

import type { Connection, CrossingReading, SourceSnapshot } from '@/domain/types';
import { db } from '@/lib/firebase';

import { toReading } from './firestore-mapping';
import type { CrossingSource } from './source';

/**
 * Live crossing status from Firestore. Not used yet: the server doesn't write crossings/{usdotId}
 * so the app runs on DemoEngine. Document shape: see toReading() in ./firestore-mapping.ts.
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
