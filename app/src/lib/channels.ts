// Android notification channel IDs. They must match what the server sets in each FCM message.
//
// train-alerts is one-shot: its importance can't be raised once the channel exists, and the user
// owns it from then on. It carries real train events and nothing else. Status notes, tests and
// demo alerts go on service-status.
export const TRAIN_ALERTS_CHANNEL = 'train-alerts';
export const SERVICE_STATUS_CHANNEL = 'service-status';
