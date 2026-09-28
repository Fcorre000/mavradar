/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** 'light' or 'dark'. Follows Settings > Appearance, which sets the app's color scheme. */
export function useScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}

/** The brand palette (Transit Navy) for the current scheme. */
export function useTheme() {
  return Colors[useScheme()];
}
