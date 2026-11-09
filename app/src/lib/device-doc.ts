// The devices/{token} body registerDevice() writes (contract/schemas/firestore/device.schema.json).
// Kept apart from push.ts so Jest can check it without loading Firebase or native modules.
// It always writes all nine fields: the follow list and preferences on the phone are the source of truth.
export type DevicePreferences = {
  /** Which kinds of train alert this phone wants. */
  alertTypes: {
    blocked: boolean;
    stopped: boolean;
    cleared: boolean;
    approaching: boolean;
  };
  minBlockMin: 1 | 3 | 5;
  quietHours: { start: string; end: string } | null;
  commuteWindows: { 
    days:number[];
    start: string;
    end: string;
  }[] | null;
  timeZone: string;
  };

export function devicePayload<T>(
  uid: string,
  platform: string,
  updatedAt: T,
  subscriptions: string[],
  preferences: DevicePreferences,
) {
  return {
    uid,
    platform,
    updatedAt,
    subscriptions: subscriptions.slice(0, 20),
    alertTypes: preferences.alertTypes,
    minBlockMin: preferences.minBlockMin,
    quietHours: preferences.quietHours,
    commuteWindows: preferences.commuteWindows,
    timeZone: preferences.timeZone,
  }
}
