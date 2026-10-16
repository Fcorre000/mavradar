import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useScheme, useStyle } from '@/hooks/use-theme';

/** How far a raised key stands above its base, and how far a press pushes it down. */
export const KEY_DEPTH = 4;

/**
 * A round or pill key on a base of the same shape, so a raised style (Model Crossing) shows the
 * darker edge across the key's full width, like a block. Flat styles get a plain wrapper. Pair it
 * with `keyPressed` on the key itself.
 */
export function Keycap({ radius, style, children }: { radius: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const appStyle = useStyle();
  const scheme = useScheme();
  if (!appStyle.depth) return <View style={style}>{children}</View>;
  return <View style={[style, { borderRadius: radius, backgroundColor: appStyle.depth[scheme].tonalBase, paddingBottom: KEY_DEPTH }]}>{children}</View>;
}

/** The pressed look for a key: pushed onto its base in a raised style, dimmed in a flat one. */
export function useKeyPressed() {
  const appStyle = useStyle();
  return appStyle.depth ? styles.pushed : styles.dimmed;
}

const styles = StyleSheet.create({
  pushed: { transform: [{ translateY: KEY_DEPTH - 1 }] },
  dimmed: { opacity: 0.7 },
});
