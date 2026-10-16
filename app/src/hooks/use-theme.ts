/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { styleFor, type AppStyle } from '@/constants/styles';
import { paletteFor, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useApp } from '@/state/store';

/** 'light' or 'dark'. Follows Settings > Appearance, which sets the app's color scheme. */
export function useScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}

/** The style chosen in Settings > Appearance: type, shapes, spacing and sizes. */
export function useStyle(): AppStyle {
  return styleFor(useApp((s) => s.prefs.style));
}

/**
 * The palette in the current scheme: the style's own colors, or the chosen color theme for a style
 * that doesn't bring any (Signal).
 */
export function useTheme(): Palette {
  const style = useStyle();
  const brand = useApp((s) => s.prefs.theme);
  const scheme = useScheme();
  return style.palettes ? style.palettes[scheme] : paletteFor(brand, scheme);
}
