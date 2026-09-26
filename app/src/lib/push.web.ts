// Push alerts are native only. The web build gets no-op stubs so it never loads the
// React Native Firebase auth persistence.
export const TRAIN_ALERTS_CHANNEL = 'train-alerts';
export const SERVICE_STATUS_CHANNEL = 'service-status';

export async function createNotificationChannels() {}

export async function registerDevice(): Promise<string | null> {
  return null;
}
