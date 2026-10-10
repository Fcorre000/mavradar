/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { paletteFor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useApp } from '@/state/store';

/** 'light' or 'dark'. Follows Settings > Appearance, which sets the app's color scheme. */
export function useScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}

/** The palette for the chosen color theme (Settings > Appearance) in the current scheme. */
export function useTheme() {
  const brand = useApp((s) => s.prefs.theme);
  return paletteFor(brand, useScheme());
}
