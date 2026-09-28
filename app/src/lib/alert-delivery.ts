import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { alertContent, channelFor, type AlertKind } from '@/domain/alerts';
import type { Effective } from '@/domain/freshness';
import type { Crossing } from '@/domain/types';

import '@/lib/push'; // registers the foreground notification handler

/**
 * Shows an alert as a local notification. Demo alerts always use the service-status channel and
 * are never Time Sensitive on iOS: both one-shot channels are reserved for real train events.
 */
export async function deliverAlert(
  kind: AlertKind,
  crossing: Crossing,
  e: Effective,
  now: number,
  mode: 'demo' | 'live',
  clearedAfterMin?: number,
) {
  const { title, body } = alertContent(kind, crossing, e, now, clearedAfterMin);
  const timeSensitive = mode === 'live' && kind !== 'sensorOffline';
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { crossingId: crossing.id, kind },
      ...(timeSensitive ? { interruptionLevel: 'timeSensitive' as const } : {}),
    },
    trigger:
      Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: channelFor(kind, mode) }
        : null,
  });
}

/** Tapping a notification should open Status for that crossing. */
export function onAlertTapped(handler: (crossingId: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const id = response.notification.request.content.data?.crossingId;
    if (typeof id === 'string') handler(id);
  });
  return () => sub.remove();
}
