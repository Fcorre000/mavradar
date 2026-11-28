import type { HistoryStats, SourceSnapshot } from '@/domain/types';

/**
 * Where crossing status comes from. The demo engine implements it today; FirestoreSource will
 * replace it once the server writes crossings/{usdotId}. Screens never know which one is active.
 */
export interface CrossingSource {
  readonly kind: 'demo' | 'live';
  /** Calls `listener` right away and on every change. Returns an unsubscribe function. */
  subscribe(listener: (snapshot: SourceSnapshot) => void): () => void;

  /** Historical statistics for the crossing. and a selected data range */
  getHistory(
    crossingId: string,
    end: number,
    range: 7 | 30
  ): HistoryStats;
}
