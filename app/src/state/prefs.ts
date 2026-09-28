import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AlertType } from '@/domain/alerts';

export type Appearance = 'system' | 'light' | 'dark';

/** Choices the person makes. Saved on the device only; nothing here leaves the phone. */
export interface Prefs {
  following: string[];
  alertTypes: Record<AlertType, boolean>;
  minBlockMin: 1 | 3 | 5;
  /** 0 = all day, 1 = weekdays 7 to 9 AM and 4 to 7 PM. */
  commute: 0 | 1;
  /** 0 = off, 1 = 10 PM to 6 AM. */
  quiet: 0 | 1;
  appearance: Appearance;
  tipDismissed: boolean;
  /** App opens, for the one-time second-visit tip. */
  launches: number;
  /** Local date (YYYY-MM-DD) that "Mute today" applies to. */
  mutedDay: string | null;
}

export const defaultPrefs: Prefs = {
  following: [],
  alertTypes: { blocked: true, cleared: true, stopped: true },
  minBlockMin: 1,
  commute: 0,
  quiet: 0,
  appearance: 'system',
  tipDismissed: false,
  launches: 0,
  mutedDay: null,
};

const KEY = 'mavradar.prefs.v1';

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultPrefs;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return { ...defaultPrefs, ...saved, alertTypes: { ...defaultPrefs.alertTypes, ...saved.alertTypes } };
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(prefs: Prefs) {
  AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
