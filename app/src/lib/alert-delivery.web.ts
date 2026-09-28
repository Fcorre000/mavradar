import type { AlertKind } from '@/domain/alerts';
import type { Effective } from '@/domain/freshness';
import type { Crossing } from '@/domain/types';

// The web preview has no notifications.
export async function deliverAlert(
  _kind: AlertKind,
  _crossing: Crossing,
  _e: Effective,
  _now: number,
  _mode: 'demo' | 'live',
  _clearedAfterMin?: number,
) {}

export function onAlertTapped(_handler: (crossingId: string) => void): () => void {
  return () => {};
}
