import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { signInAnonymously } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { auth, db } from '@/lib/firebase';

// Android channel importance can't be raised once a channel exists, and the user owns it
// from then on. Same one-shot rule as iOS Time Sensitive: train-alerts carries real train
// events and nothing else. Status, tests, and anything that isn't a train go on
// service-status. Channel IDs must match what the server sets in each FCM message.
export const TRAIN_ALERTS_CHANNEL = 'train-alerts';
export const SERVICE_STATUS_CHANNEL = 'service-status';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Must run before asking for permission: on Android 13+ the prompt won't show until a
// channel exists.
export async function createNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(TRAIN_ALERTS_CHANNEL, {
    name: 'Train alerts',
    description: 'A train is approaching or blocking a crossing you follow.',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    enableVibrate: true,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(SERVICE_STATUS_CHANNEL, {
    name: 'Service status',
    description: 'Sensor offline, detection degraded, and other updates that are not trains.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// The one place token registration happens. On Android the device token is an FCM token.
// On iOS it is a raw APNs token, which FCM v1 can't send to; Amendment 003 section 5.2
// picks the iOS path before the first iOS build, and only this function should change.
export async function registerDevice(): Promise<string | null> {
  if (!Device.isDevice) return null;

  await createNotificationChannels();

  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return null;

  const { data: token } = await Notifications.getDevicePushTokenAsync();
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;

  // Keyed on the push token, not the uid (Amendment 002, 4.1). A merge write so
  // re-registering on launch never clobbers subscriptions or quiet hours.
  await setDoc(
    doc(db, 'devices', token),
    { uid: user.uid, platform: Platform.OS, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return token;
}
