import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { signInAnonymously } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import type { PermissionState } from '@/domain/alerts';
import { SERVICE_STATUS_CHANNEL, TRAIN_ALERTS_CHANNEL } from '@/lib/channels';
import { auth, db } from '@/lib/firebase';

export { SERVICE_STATUS_CHANNEL, TRAIN_ALERTS_CHANNEL };

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

const toPermissionState = (p: Notifications.NotificationPermissionsStatus): PermissionState =>
  p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';

/** Current notification permission, without prompting. */
export async function getAlertPermission(): Promise<PermissionState> {
  return toPermissionState(await Notifications.getPermissionsAsync());
}

/**
 * Shows the system permission prompt. Only call this after the in-app priming sheet, when the
 * person has asked for alerts. Never at launch: Android treats two denials as permanent.
 */
export async function requestAlertPermission(): Promise<PermissionState> {
  await createNotificationChannels();
  const result = await Notifications.requestPermissionsAsync();
  return result.granted ? 'granted' : 'denied';
}

// The one place token registration happens. On Android the device token is an FCM token.
// On iOS it is a raw APNs token, which FCM v1 can't send to; Amendment 003 section 5.2
// picks the iOS path before the first iOS build, and only this function should change.
// It never prompts; it returns null unless permission was already granted.
export async function registerDevice(subscriptions?: string[]): Promise<string | null> {
  if (!Device.isDevice) return null;
  if ((await getAlertPermission()) !== 'granted') return null;

  await createNotificationChannels();
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;

  // Keyed on the push token, not the uid (Amendment 002, 4.1). A merge write so
  // re-registering on launch never clobbers subscriptions or quiet hours.
  await setDoc(
    doc(db, 'devices', token),
    {
      uid: user.uid,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
      ...(subscriptions ? { subscriptions: subscriptions.slice(0, 20) } : {}),
    },
    { merge: true },
  );
  return token;
}
