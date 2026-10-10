import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckIcon, PlusIcon, RouteIcon } from '@/components/icons';
import { InfoRow } from '@/components/rows';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { HistoryColors } from '@/constants/theme';
import { DISCLAIMER, type StatusCopy } from '@/domain/copy';
import type { Effective } from '@/domain/freshness';
import { formatTime, startOfDay } from '@/domain/time';
import type { BlockageEvent, Crossing } from '@/domain/types';
import { useScheme, useTheme } from '@/hooks/use-theme';
import { openDirections, toggleFollow } from '@/state/actions';
import { setUi } from '@/state/store';

// Blockages per day for the six days before today, a stand-in until History is live.
const WEEK_PATTERN = [18, 14, 21, 19, 22, 20];
const DAY = 86_400_000;

/**
 * Map sheet contents. Everything renders at once; the sheet's height decides how much shows:
 * peek (name, state, Follow), half (directions, sensor, disclaimer), full (last 7 days).
 */
export function CrossingSheet({ crossing, e, copy, following, events, now }: { crossing: Crossing; e: Effective; copy: StatusCopy; following: boolean; events: BlockageEvent[]; now: number }) {
  const theme = useTheme();
  const scheme = useScheme();
  const mine = events.filter((ev) => ev.crossingId === crossing.id);
  const last = mine[mine.length - 1];
  const durations = mine.map((ev) => ev.durationMin).sort((a, b) => a - b);
  const typical = durations.length ? `${durations[Math.floor(durations.length / 2)]} min` : 'Not enough data yet';
  const today = startOfDay(now);
  const todayCount = mine.filter((ev) => ev.start >= today).length;
  const week = [...WEEK_PATTERN, todayCount];
  const max = Math.max(...week, 1);
  const days = WEEK_PATTERN.map((_, i) => new Date(today - (6 - i) * DAY).toLocaleDateString('en-US', { weekday: 'short' })).concat('Today');

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
          sublabel="Opens Google Maps"
          variant={e.state === 'clear' ? 'tonal' : 'filled'}
          icon={(c) => <RouteIcon color={c} />}
          onPress={openDirections}
        />
        <View>
          <InfoRow label="Sensor" value={e.state === 'unknown' ? copy.sensor : `${copy.sensor} · East node · battery OK`} />
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
