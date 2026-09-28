import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { T } from '@/components/text';
import { HistoryColors, Radius, Size } from '@/constants/theme';
import { isBlocking, type Effective } from '@/domain/freshness';
import { minuteOfDay, minutesBetween, startOfDay } from '@/domain/time';
import type { BlockageEvent } from '@/domain/types';
import { useScheme, useTheme } from '@/hooks/use-theme';

type Segment = { startMin: number; durMin: number; kind: 'moving' | 'stopped' | 'noData' };

/**
 * A 24-hour bar of today's blockages, from midnight. Moving is solid, stopped is hatched,
 * a sensor outage is a gray hatch. Tapping it opens History.
 */
export function TodayTimeline({ events, e, now, onPress }: { events: BlockageEvent[]; e: Effective; now: number; onPress: () => void }) {
  const scheme = useScheme();
  const theme = useTheme();
  const colors = HistoryColors[scheme];
  const [width, setWidth] = useState(0);

  const dayStart = startOfDay(now);
  const segments: Segment[] = events
    .filter((ev) => ev.start >= dayStart)
    .map((ev) => ({ startMin: minuteOfDay(ev.start), durMin: ev.durationMin, kind: ev.stopped ? 'stopped' : 'moving' }));
  let total = segments.reduce((sum, s) => sum + s.durMin, 0);
  let count = segments.length;
  if (isBlocking(e.state) && e.since) {
    const d = Math.max(1, minutesBetween(e.since, now));
    segments.push({ startMin: minuteOfDay(e.since), durMin: d, kind: e.state === 'stopped' ? 'stopped' : 'moving' });
    total += d;
    count += 1;
  }
  if (e.state === 'unknown' && e.cause === 'sensor' && e.lastAt >= dayStart) {
    segments.push({ startMin: minuteOfDay(e.lastAt), durMin: Math.max(1, minutesBetween(e.lastAt, now)), kind: 'noData' });
  }
  const caption = `${count} ${count === 1 ? 'blockage' : 'blockages'} · ${total} min total`;
  const x = (min: number) => (min / 1440) * width;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <T v="secondary" weight={600}>
          Today
        </T>
        <T v="secondary" color={theme.textSecondary} tabular>
          {caption}
        </T>
      </View>
      <Pressable
        onPress={onPress}
        onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityLabel={`Today: ${caption}. Open History.`}
        style={[styles.bar, { backgroundColor: theme.track }]}>
        {width > 0 ? (
          <Svg width={width} height={Size.timelineBar}>
            <Defs>
              <Pattern id="tl-stopped" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <Rect width={2} height={4} fill={colors.moving} />
              </Pattern>
              <Pattern id="tl-nodata" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <Rect width={2} height={4} fill={colors.noData} />
              </Pattern>
            </Defs>
            {segments.map((s, i) => (
              <Rect
                key={i}
                x={x(s.startMin)}
                y={0}
                width={Math.max(x(s.durMin), s.kind === 'moving' ? 4 : 6)}
                height={Size.timelineBar}
                fill={s.kind === 'moving' ? colors.moving : s.kind === 'stopped' ? 'url(#tl-stopped)' : 'url(#tl-nodata)'}
              />
            ))}
            <Rect x={x(minuteOfDay(now))} y={0} width={2} height={Size.timelineBar} fill={theme.text} />
          </Svg>
        ) : null}
      </Pressable>
      <View style={styles.axis}>
        {['12 AM', '6 AM', '12 PM', '6 PM'].map((label, i) => (
          <T key={label} v="axis" color={theme.textSecondary} style={[styles.axisLabel, { left: `${i * 25}%` }]}>
            {label}
          </T>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingTop: 4 },
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12 },
  bar: { height: Size.timelineBar, borderRadius: Radius.timelineBar, overflow: 'hidden' },
  axis: { height: 16 },
  axisLabel: { position: 'absolute' },
});
