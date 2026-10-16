import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components/text';
import { BottomTabInset, Layout } from '@/constants/theme';
import { useStyle, useTheme } from '@/hooks/use-theme';

/**
 * Space to keep clear at the bottom of a tab screen. On iOS the native tab bar floats over
 * content; on Android and web the screen already ends above the bar.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? BottomTabInset + insets.bottom : 0;
}

/** True at large system font sizes, where more content moves into the scroll area. */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= 1.5;
}

/**
 * A screen's background plus a centered content column, so a phone layout doesn't stretch across a
 * tablet. `fullBleed` skips the column, for the map.
 */
export function Screen({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {fullBleed ? children : <View style={styles.column}>{children}</View>}
    </View>
  );
}

/** Screen title block: crossing name, a secondary line, and an optional action on the right. */
export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const appStyle = useStyle();
  const titleBlock = (
    <View style={styles.headerText}>
      <T v="crossingName" accessibilityRole="header">
        {title}
      </T>
      {subtitle ? (
        <T v="secondary" color={theme.textSecondary}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
  // Large titles (Clarity): the actions get their own row, and the title sits under them, left aligned.
  if (appStyle.header === 'large') {
    return (
      <View style={[styles.largeHeader, { paddingTop: insets.top, paddingHorizontal: appStyle.space.screen }]}>
        <View style={styles.largeActions}>{right}</View>
        {titleBlock}
      </View>
    );
  }
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, paddingHorizontal: appStyle.space.screen, minHeight: appStyle.size.header }]}>
      {titleBlock}
      {right}
    </View>
  );
}

/** Small "Demo" pill so simulated data is never mistaken for a real reading. */
export function DemoBadge() {
  const theme = useTheme();
  const appStyle = useStyle();
  return (
    <View
      style={[styles.badge, { borderColor: theme.outline, borderRadius: appStyle.radius.pill }]}
      accessibilityLabel="Demo data. These crossing states are simulated.">
      <T v="kicker" color={theme.textSecondary} weight={600}>
        Demo
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: Layout.maxContentWidth, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  headerText: { flex: 1, gap: 2 },
  largeHeader: { paddingBottom: 8 },
  largeActions: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
});
