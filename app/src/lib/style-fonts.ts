import * as Font from 'expo-font';

import { styleFor, type StyleId } from '@/constants/styles';

/**
 * Loads a style's font files at runtime, so a new style needs no native rebuild. Resolves at once
 * when they are already in. Move to the expo-font config plugin with the next batch of native changes.
 */
export async function loadStyleFonts(id: StyleId): Promise<void> {
  const missing = Object.entries(styleFor(id).fonts).filter(([family]) => !Font.isLoaded(family));
  if (missing.length) await Font.loadAsync(Object.fromEntries(missing));
}
