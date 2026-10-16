import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { Chips } from '@/components/chips';
import { ChevronDownIcon, ClockIcon } from '@/components/icons';
import { Screen, useBottomInset } from '@/components/layout';
import { ChoiceSheet } from '@/components/sheet-modal';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { plateShadow } from '@/constants/styles';
import { HistoryColors } from '@/constants/theme';
import { crossingById } from '@/domain/crossings';
import { blockageStats } from '@/domain/stats';
import { formatTime, startOfDay } from '@/domain/time';
import type { BlockageEvent } from '@/domain/types';
import { useScheme, useStyle, useTheme } from '@/hooks/use-theme';
import { setUi, useApp, visibleCrossings } from '@/state/store';

const DAY = 86_400_000;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

export default function HistoryScreen() {
  const theme = useTheme();
  const appStyle = useStyle();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  // Only the event list and the date: History doesn't need the per-second freshness tick.
  const allEvents = useApp((s) => s.snapshot.events);
  const today = useApp((s) => startOfDay(s.snapshot.now));
  const crossings = useApp(visibleCrossings);
  const following = useApp((s) => s.prefs.following);
  const crossingId = useApp((s) => s.ui.historyCrossingId);
  const range = useApp((s) => s.ui.historyRange);
  const forceEmpty = useApp((s) => s.demo.historyEmpty);
  const [picking, setPicking] = useState(false);

  const crossing = crossingById(crossingId);
  const stats = useMemo(() => blockageStats(allEvents, crossing.id, today + DAY - 1, range), [allEvents, crossing.id, today, range]);
  const empty = forceEmpty || stats.count === 0;
  const max = Math.max(...stats.hours);
  const peak = stats.hours.indexOf(max);
  const sections = useMemo(() => byDay(stats.events, today), [stats.events, today]);

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
      <View style={[styles.chips, { paddingHorizontal: appStyle.space.screen }]}>
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
        <SectionList
          sections={sections}
          keyExtractor={(ev) => ev.id}
          renderItem={({ item }) => <EventRow event={item} />}
          renderSectionHeader={({ section }) => (
            <T v="secondary" weight={600} color={theme.textSecondary} style={[styles.groupTitle, { backgroundColor: theme.background }]} accessibilityRole="header">
              {section.title}
            </T>
          )}
          ListHeaderComponent={
            <View style={[styles.listHeader, { gap: appStyle.space.section }]}>
              <T tabular>
                <T weight={700}>{range} days:</T> {stats.count} blockages · typical {stats.typicalMin === null ? 'not enough data yet' : `${stats.typicalMin} min`}
                {stats.longest ? ` · longest ${stats.longest.durationMin} min${stats.longest.stopped ? ' (stopped)' : ''}` : ''}
              </T>

              <View
                style={[styles.card, { backgroundColor: theme.backgroundElement, borderRadius: appStyle.radius.card }, plateShadow(appStyle, scheme)]}
                accessible
                accessibilityLabel={`Busiest hours. Most blockages between ${hourLabel(peak)} and ${hourLabel(peak + 1)}. Past data, not a prediction.`}>
                <T weight={600}>Busiest hours</T>
                <T v="disclaimer" color={theme.textSecondary}>
                  Average blockages per hour. Past data, not a prediction.
                </T>
                <View style={styles.chart}>
                  <T v="axis" weight={700} style={[styles.peakLabel, { left: `${Math.min(75, Math.max(25, ((peak + 0.5) / 24) * 100))}%` }]}>
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
            </View>
          }
          contentContainerStyle={[styles.content, { paddingHorizontal: appStyle.space.screen, paddingBottom: bottomInset + 24 }]}
          initialNumToRender={20}
        />
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

/** Groups newest-first blockages by calendar day: Today, Yesterday, then "Mon, Oct 12". */
function byDay(events: BlockageEvent[], today: number) {
  const sections: { title: string; data: BlockageEvent[] }[] = [];
  for (const ev of events) {
    const day = startOfDay(ev.start);
    const title =
      day === today
        ? 'Today'
        : Math.round((today - day) / DAY) === 1
          ? 'Yesterday'
          : new Date(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const last = sections[sections.length - 1];
    if (last?.title === title) last.data.push(ev);
    else sections.push({ title, data: [ev] });
  }
  return sections;
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
  chips: { paddingBottom: 8 },
  content: { paddingTop: 4 },
  listHeader: { paddingBottom: 8 },
  empty: { flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingBottom: 80 },
  card: { padding: 16, gap: 2 },
  chart: { height: 96, justifyContent: 'flex-end', marginTop: 10 },
  // Wide enough for 'Busiest 10 AM to 11 AM' on one line; kept 25 to 75% across so it never leaves the card.
  peakLabel: { position: 'absolute', top: 0, transform: [{ translateX: -90 }], width: 180, textAlign: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70 },
  hourBar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { height: 18, marginTop: 8 },
  axisLabel: { position: 'absolute' },
  groupTitle: { paddingTop: 16, paddingBottom: 6 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  eventTime: { width: 76 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  eventDur: { width: 116, textAlign: 'right' },
});
