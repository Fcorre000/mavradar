import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { StarIcon } from '@/components/icons';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { Layout, Size } from '@/constants/theme';
import { statusCopy } from '@/domain/copy';
import { effectiveState, isBlocking } from '@/domain/freshness';
import type { Crossing, SourceSnapshot } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { toggleFollow } from '@/state/actions';

/**
 * Every crossing as a list, grouped by city. Followed first, then Blocked and Stopped, then
 * alphabetical. Doubles as the accessible alternative to the map and the Crossings screen.
 */
export function CrossingList({ crossings, snapshot, following, onOpen, footer }: { crossings: Crossing[]; snapshot: SourceSnapshot; following: string[]; onOpen: (id: string) => void; footer?: React.ReactNode }) {
  const theme = useTheme();
  const rows = crossings.map((c) => {
    const e = effectiveState(snapshot.readings[c.id], snapshot);
    return { c, e, copy: statusCopy(c, e, snapshot.now, following.includes(c.id)) };
  });
  const rank = (r: (typeof rows)[number]) => (following.includes(r.c.id) ? 0 : isBlocking(r.e.state) ? 1 : 2);
  const cities = [...new Set(crossings.map((c) => c.city))];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {cities.map((city) => (
        <View key={city}>
          <T v="secondary" weight={600} color={theme.textSecondary} style={styles.section} accessibilityRole="header">
            {city}
          </T>
          {rows
            .filter((r) => r.c.city === city)
            .sort((a, b) => rank(a) - rank(b) || a.c.name.localeCompare(b.c.name))
            .map(({ c, e, copy }) => {
              const followed = following.includes(c.id);
              return (
                <View key={c.id} style={[styles.row, { borderBottomColor: theme.divider }]}>
                  <StateIcon state={e.state} size={Size.listIcon} variant="plain" />
                  <Pressable onPress={() => onOpen(c.id)} style={styles.main} accessibilityRole="button" accessibilityLabel={copy.a11y}>
                    <T weight={600}>{c.name}</T>
                    <T v="secondary" color={theme.textSecondary} tabular>
                      <T v="secondary" weight={700}>
                        {copy.word}
                      </T>
                      {copy.listDetail}
                    </T>
                  </Pressable>
                  <Pressable
                    onPress={() => toggleFollow(c.id)}
                    style={styles.star}
                    accessibilityRole="button"
                    accessibilityState={{ selected: followed }}
                    accessibilityLabel={followed ? `Unfollow ${c.name}` : `Follow ${c.name}`}>
                    <StarIcon color={followed ? theme.text : theme.textSecondary} filled={followed} />
                  </Pressable>
                </View>
              );
            })}
        </View>
      ))}
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  section: { paddingHorizontal: Layout.screenPadding, paddingTop: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: Size.listRow, paddingLeft: Layout.screenPadding, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, gap: 2, paddingVertical: 12 },
  star: { width: Size.touchTarget, height: Size.touchTarget, alignItems: 'center', justifyContent: 'center' },
});
