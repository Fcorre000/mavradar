// The devices/{token} body registerDevice() writes (contract/schemas/firestore/device.schema.json).
// Kept apart from push.ts so Jest can check it without loading Firebase or native modules.
// subscriptions is only set when given, so the merge write never wipes the saved list.
export function devicePayload<T>(
  uid: string,
  platform: string,
  updatedAt: T,
  subscriptions?: string[],
): { uid: string; platform: string; updatedAt: T; subscriptions?: string[] } {
  return {
    uid,
    platform,
    updatedAt,
    ...(subscriptions ? { subscriptions: subscriptions.slice(0, 20) } : {}),
  };
}
