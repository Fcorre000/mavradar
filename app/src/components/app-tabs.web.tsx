import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { T } from '@/components/text';
import { Size } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Web preview only: a bottom bar that matches the Android navigation bar.
export default function AppTabs() {
  const colors = useTheme();
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: colors.backgroundElement }]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton icon="status">Status</TabButton>
        </TabTrigger>
        <TabTrigger name="map" href="/map" asChild>
          <TabButton icon="map">Map</TabButton>
        </TabTrigger>
        <TabTrigger name="history" href="/history" asChild>
          <TabButton icon="history">History</TabButton>
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton icon="settings">Settings</TabButton>
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, icon, ...props }: TabTriggerSlotProps & { icon: keyof typeof ICONS; children: ReactNode }) {
  const colors = useTheme();
  const color = isFocused ? colors.text : colors.textSecondary;
  return (
    <Pressable {...props} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }}>
      <View style={[styles.indicator, isFocused && { backgroundColor: colors.backgroundSelected }]}>{ICONS[icon](color)}</View>
      <T v="navLabel" color={color} weight={isFocused ? 700 : 500}>
        {children}
      </T>
    </Pressable>
  );
}

const line = (color: string) => ({ stroke: color, strokeWidth: 2, fill: 'none', strokeLinejoin: 'round' as const });
const ICONS = {
  status: (c: string) => (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Circle cx="7" cy="9" r="4" {...line(c)} />
      <Circle cx="17" cy="9" r="4" {...line(c)} />
      <Path d="M12 13v8M8 21h8" {...line(c)} />
    </Svg>
  ),
  map: (c: string) => (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" {...line(c)} />
      <Path d="M9 4v14M15 6v14" {...line(c)} />
    </Svg>
  ),
  history: (c: string) => (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" {...line(c)} />
      <Path d="M12 7v5l3 2" {...line(c)} />
    </Svg>
  ),
  settings: (c: string) => (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M4 7h9M19 7h1M4 17h3M13 17h7" {...line(c)} />
      <Circle cx="16" cy="7" r="2.5" {...line(c)} />
      <Circle cx="10" cy="17" r="2.5" {...line(c)} />
    </Svg>
  ),
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: Size.navBar, paddingTop: 12, paddingBottom: 16, paddingHorizontal: 8 },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  indicator: { width: Size.navIndicatorWidth, height: Size.navIndicatorHeight, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
