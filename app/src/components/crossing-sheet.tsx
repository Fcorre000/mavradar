import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckIcon, PlusIcon, RouteIcon } from '@/components/icons';
import { InfoRow } from '@/components/rows';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { HistoryColors } from '@/constants/theme';
import { DISCLAIMER, sensorLine, type StatusCopy } from '@/domain/copy';
import type { Effective } from '@/domain/freshness';
import { blockageStats } from '@/domain/stats';
import { formatTime, startOfDay } from '@/domain/time';
import type { BlockageEvent, Crossing, CrossingReading } from '@/domain/types';
import { useScheme, useTheme } from '@/hooks/use-theme';
import { DIRECTIONS_APP, openDirections, toggleFollow } from '@/state/actions';
import { setUi } from '@/state/store';

const DAY = 86_400_000;

/**
 * Crossing sheet contents, over the map and over the list. Everything renders at once; the sheet's
 * height decides how much shows: peek (name, state, Follow), half (directions, sensor, disclaimer),
 * full (last 7 days).
 */
export function CrossingSheet({ crossing, reading, e, copy, following, events, now }: { crossing: Crossing; reading?: CrossingReading; e: Effective; copy: StatusCopy; following: boolean; events: BlockageEvent[]; now: number }) {
  const theme = useTheme();
  const scheme = useScheme();
  const today = startOfDay(now);
  // Same numbers as History and the Status card: one stats function over the blockage log.
  const month = useMemo(() => blockageStats(events, crossing.id, today + DAY - 1, 30), [events, crossing.id, today]);
  const week = useMemo(() => blockageStats(events, crossing.id, today + DAY - 1, 7).perDay, [events, crossing.id, today]);
  const last = month.events[0];
  const typical = month.typicalMin === null ? 'Not enough data yet' : `${month.typicalMin} min`;
  const max = Math.max(...week, 1);
  const days = week.map((_, i) => (i === 6 ? 'Today' : new Date(today - (6 - i) * DAY).toLocaleDateString('en-US', { weekday: 'short' })));

  return (
    <View style={styles.wrap}>
      <View style={styles.peek}>
        <View style={styles.peekText}>
          <T v="sheetName" accessibilityRole="header">
            {crossing.name}
          </T>
          <View style={styles.stateRow}>
            <StateIcon state={e.state} size={24} variant="plain" />
            <T weight={700}>{copy.word}</T>
          </View>
          <T v="secondary" color={theme.textSecondary} tabular>
            {copy.meta}
          </T>
        </View>
        <Pressable
          onPress={() => toggleFollow(crossing.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: following }}
          accessibilityLabel={following ? `Following ${crossing.name}. Tap to unfollow.` : `Follow ${crossing.name}`}
          hitSlop={4}
          style={[styles.follow, { backgroundColor: theme.tonal }]}>
          {following ? <CheckIcon size={18} color={theme.text} /> : <PlusIcon color={theme.text} />}
          <T v="secondary" weight={700}>
            {following ? 'Following' : 'Follow'}
          </T>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Button
          label="Directions via West St underpass"
          sublabel={`Opens ${DIRECTIONS_APP}`}
          variant={e.state === 'clear' ? 'tonal' : 'filled'}
          icon={(c) => <RouteIcon color={c} />}
          onPress={openDirections}
        />
        <View>
          <InfoRow label="Sensor" value={sensorLine(copy, e, reading)} />
          <InfoRow label="Crossing ID" value={`USDOT ${crossing.id}`} />
          <InfoRow label="Last blockage" value={last ? `${formatTime(last.start)} · ${last.durationMin} min · ${last.stopped ? 'stopped' : 'moving'}` : 'None recorded yet'} />
          <InfoRow label="Typical blockage" value={typical} last />
        </View>
        <T v="disclaimer" color={theme.textSecondary}>
          {DISCLAIMER}
        </T>
      </View>

      <View style={styles.section}>
        <View style={styles.weekHead}>
          <T weight={600}>Last 7 days</T>
          <T v="secondary" color={theme.textSecondary}>
            Blockages per day
          </T>
        </View>
        <View style={styles.week} accessible accessibilityLabel={`Blockages per day, last 7 days: ${week.join(', ')}.`}>
          {week.map((n, i) => (
            <View key={i} style={styles.day}>
              <T v="axis" color={theme.textSecondary} tabular>
                {n}
              </T>
              <View style={[styles.bar, { height: Math.round((n / max) * 92), backgroundColor: HistoryColors[scheme].noData, opacity: i === 6 ? 0.55 : 1 }]} />
              <T v="axis" color={theme.textSecondary} weight={i === 6 ? 700 : 400}>
                {days[i]}
              </T>
            </View>
          ))}
        </View>
        <Button
          label="Open in Status"
          variant="outline"
          center
          onPress={() => {
            setUi({ statusCrossingId: crossing.id });
            router.navigate('/');
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 32 },
  peek: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 88 },
  peekText: { flex: 1, gap: 4 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 12, paddingRight: 16, borderRadius: 20, marginTop: 4 },
  section: { gap: 12, paddingTop: 18 },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 132 },
  day: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
});
