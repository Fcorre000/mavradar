import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { Chips } from '@/components/chips';
import { ChevronDownIcon, ClockIcon } from '@/components/icons';
import { Screen, useBottomInset } from '@/components/layout';
import { ChoiceSheet } from '@/components/sheet-modal';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { HistoryColors, Layout, Radius } from '@/constants/theme';
import { DEMO_HISTORY } from '@/data/demo-history';
import { crossingById, CENTER_ST } from '@/domain/crossings';
import { formatTime, startOfDay } from '@/domain/time';
import type { BlockageEvent } from '@/domain/types';
import { useScheme, useTheme } from '@/hooks/use-theme';
import { setUi, useApp, visibleCrossings } from '@/state/store';

const DAY = 86_400_000;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

export default function HistoryScreen() {
  const theme = useTheme();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const snapshot = useApp((s) => s.snapshot);
  const crossings = useApp(visibleCrossings);
  const following = useApp((s) => s.prefs.following);
  const crossingId = useApp((s) => s.ui.historyCrossingId);
  const range = useApp((s) => s.ui.historyRange);
  const forceEmpty = useApp((s) => s.demo.historyEmpty);
  const [picking, setPicking] = useState(false);

  const crossing = crossingById(crossingId);
  const events = snapshot.events.filter((e) => e.crossingId === crossing.id);
  const empty = forceEmpty || events.length === 0 || crossing.id !== CENTER_ST.id;
  const stats = DEMO_HISTORY[range];
  const sessionExtra = events.filter((e) => e.id.startsWith('demo-')).length;
  const max = Math.max(...stats.hours);
  const peak = stats.hours.indexOf(max);

  const today = startOfDay(snapshot.now);
  const groups: { title: string; items: BlockageEvent[] }[] = [
    { title: 'Today', items: events.filter((e) => e.start >= today) },
    { title: 'Yesterday', items: events.filter((e) => e.start >= today - DAY && e.start < today) },
  ].map((g) => ({ ...g, items: [...g.items].sort((a, b) => b.start - a.start) }));

  const pickerOptions = [...crossings]
    .sort((a, b) => Number(following.includes(b.id)) - Number(following.includes(a.id)) || a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name, sub: `${c.city}${following.includes(c.id) ? ' · following' : ''}` }));

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() => setPicking(true)}
          style={styles.picker}
          accessibilityRole="button"
          accessibilityLabel={`Crossing: ${crossing.name}, ${crossing.city}. Change crossing`}>
          <View>
            <T v="crossingName">{crossing.name}</T>
            <T v="secondary" color={theme.textSecondary}>
              {crossing.city}, TX · History
            </T>
          </View>
          <ChevronDownIcon color={theme.text} />
        </Pressable>
      </View>
      <View style={styles.chips}>
        <Chips
          label="Range"
          value={range}
          onChange={(v) => setUi({ historyRange: v })}
          options={[
            { value: 7, label: '7 days' },
            { value: 30, label: '30 days' },
          ]}
        />
      </View>

      {empty ? (
        <View style={styles.empty}>
          <ClockIcon size={44} color={theme.textSecondary} />
          <T v="stateLine">No blockages recorded yet.</T>
          <T color={theme.textSecondary}>History starts from when this sensor went live on [launch date].</T>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]}>
          <T tabular>
            <T weight={700}>{range} days:</T> {stats.count + sessionExtra} blockages · typical {stats.typicalMin} min · longest {stats.longestMin} min
            {stats.longestStopped ? ' (stopped)' : ''}
          </T>

          <View
            style={[styles.card, { backgroundColor: theme.backgroundElement }]}
            accessible
            accessibilityLabel={`Busiest hours. Most blockages between ${hourLabel(peak)} and ${hourLabel(peak + 1)}. Past data, not a prediction.`}>
            <T weight={600}>Busiest hours</T>
            <T v="disclaimer" color={theme.textSecondary}>
              Average blockages per hour. Past data, not a prediction.
            </T>
            <View style={styles.chart}>
              <T v="axis" weight={700} style={[styles.peakLabel, { left: `${((peak + 0.5) / 24) * 100}%` }]}>
                Busiest {hourLabel(peak)} to {hourLabel(peak + 1)}
              </T>
              <View style={styles.bars}>
                {stats.hours.map((v, i) => (
                  <View key={i} style={[styles.hourBar, { height: Math.round((v / max) * 70), backgroundColor: i === peak ? HistoryColors[scheme].peakBar : HistoryColors[scheme].neutralBar }]} />
                ))}
              </View>
            </View>
            <View style={styles.axis}>
              {['12 AM', '6 AM', '12 PM', '6 PM'].map((label, i) => (
                <T key={label} v="axis" color={theme.textSecondary} style={[styles.axisLabel, { left: `${i * 25}%` }]}>
                  {label}
                </T>
              ))}
            </View>
          </View>

          {groups.map((g) =>
            g.items.length ? (
              <View key={g.title}>
                <T v="secondary" weight={600} color={theme.textSecondary} style={styles.groupTitle} accessibilityRole="header">
                  {g.title}
                </T>
                {g.items.map((ev) => (
                  <EventRow key={ev.id} event={ev} />
                ))}
              </View>
            ) : null,
          )}
        </ScrollView>
      )}

      <ChoiceSheet
        visible={picking}
        title="History for"
        options={pickerOptions}
        value={crossing.id}
        onPick={(id) => setUi({ historyCrossingId: id })}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}

function EventRow({ event }: { event: BlockageEvent }) {
  const theme = useTheme();
  const scheme = useScheme();
  const colors = HistoryColors[scheme];
  const [width, setWidth] = useState(0);
  const fill = Math.min(1, event.durationMin / 40) * width;
  return (
    <View
      style={[styles.event, { borderBottomColor: theme.divider }]}
      accessible
      accessibilityLabel={`${event.stopped ? 'Stopped' : 'Moving'} train at ${formatTime(event.start)}, blocked ${event.durationMin} minutes`}>
      <StateIcon state={event.stopped ? 'stopped' : 'blocked'} size={20} variant="plain" />
      <T weight={600} tabular style={styles.eventTime}>
        {formatTime(event.start)}
      </T>
      <View style={[styles.track, { backgroundColor: theme.track }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={8}>
            <Defs>
              <Pattern id={`ev-${event.id}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <Rect width={6} height={6} fill={colors.moving} />
                <Rect width={3} height={6} fill={colors.stopped} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={Math.max(fill, 4)} height={8} rx={4} fill={event.stopped ? `url(#ev-${event.id})` : colors.moving} />
          </Svg>
        ) : null}
      </View>
      <T v="secondary" color={theme.textSecondary} tabular style={styles.eventDur}>
        <T v="secondary" weight={700}>
          {event.durationMin} min
        </T>{' '}
        · {event.stopped ? 'stopped' : 'moving'}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 12, paddingBottom: 4 },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8, alignSelf: 'flex-start' },
  chips: { paddingHorizontal: Layout.screenPadding, paddingBottom: 8 },
  content: { paddingHorizontal: Layout.screenPadding, paddingTop: 4, gap: Layout.sectionGap },
  empty: { flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 80 },
  card: { borderRadius: Radius.card, padding: 16, gap: 2 },
  chart: { height: 96, justifyContent: 'flex-end', marginTop: 10 },
  peakLabel: { position: 'absolute', top: 0, transform: [{ translateX: -60 }], width: 120, textAlign: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70 },
  hourBar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { height: 18, marginTop: 8 },
  axisLabel: { position: 'absolute' },
  groupTitle: { paddingTop: 4, paddingBottom: 4 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  eventTime: { width: 76 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  eventDur: { width: 116, textAlign: 'right' },
});
