import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components/text';
import { BottomTabInset, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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

export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.screen, { backgroundColor: theme.background }]}>{children}</View>;
}

/** Screen title block: crossing name, a secondary line, and an optional action on the right. */
export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
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
      {right}
    </View>
  );
}

/** Small "Demo" pill so simulated data is never mistaken for a real reading. */
export function DemoBadge() {
  const theme = useTheme();
  return (
    <View
      style={[styles.badge, { borderColor: theme.outline }]}
      accessibilityLabel="Demo data. These crossing states are simulated.">
      <T v="kicker" color={theme.textSecondary} weight={600}>
        Demo
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Layout.screenPadding, paddingBottom: 8, minHeight: 64 },
  headerText: { flex: 1, gap: 2 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
