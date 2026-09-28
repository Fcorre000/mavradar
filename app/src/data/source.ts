import type { SourceSnapshot } from '@/domain/types';

/**
 * Where crossing status comes from. The demo engine implements it today; FirestoreSource will
 * replace it once the server writes crossings/{usdotId}. Screens never know which one is active.
 */
export interface CrossingSource {
  readonly kind: 'demo' | 'live';
  /** Calls `listener` right away and on every change. Returns an unsubscribe function. */
  subscribe(listener: (snapshot: SourceSnapshot) => void): () => void;
}
