// Push alerts are native only. The web build gets no-op stubs so it never loads the
// React Native Firebase auth persistence.
import type { PermissionState } from '@/domain/alerts';
import { SERVICE_STATUS_CHANNEL, TRAIN_ALERTS_CHANNEL } from '@/lib/channels';

export { SERVICE_STATUS_CHANNEL, TRAIN_ALERTS_CHANNEL };

export async function createNotificationChannels() {}

export async function getAlertPermission(): Promise<PermissionState> {
  return 'undetermined';
}

// The web preview has no notifications. Report granted so the follow flow can be walked through.
export async function requestAlertPermission(): Promise<PermissionState> {
  return 'granted';
}

export async function registerDevice(_subscriptions?: string[]): Promise<string | null> {
  return null;
}
