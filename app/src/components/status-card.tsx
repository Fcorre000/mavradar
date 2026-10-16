import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { ClockIcon } from '@/components/icons';
import { LiveDot } from '@/components/live-dot';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { plateShadow } from '@/constants/styles';
import { Size, StatusCard as CardColors } from '@/constants/theme';
import type { StatusCopy, TypicalCopy } from '@/domain/copy';
import type { Effective } from '@/domain/freshness';
import { useScheme, useStyle, useTheme } from '@/hooks/use-theme';

/**
 * The main status block. Tinted for calm states, solid for Blocked and Stopped. Unknown gets a
 * dashed border and never shows the last state word. A polite live region announces changes.
 */
export function StatusCard({ e, copy, typical, onRetry }: { e: Effective; copy: StatusCopy; typical?: TypicalCopy | null; onRetry?: () => void }) {
  const scheme = useScheme();
  const theme = useTheme();
  const appStyle = useStyle();
  const c = CardColors[scheme][e.state];
  const tinted = e.state === 'clear' || e.state === 'approaching' || e.state === 'unknown';
  const freshColor = e.freshness === 'delayed' && tinted ? theme.textSecondary : c.onContainer;

  return (
    <View
      style={[
        styles.card,
        { borderRadius: appStyle.radius.card, padding: appStyle.space.card },
        // Only Blocked and Stopped hold the tall card; calm states shrink to their content.
        !tinted && { minHeight: appStyle.statusCardMinHeight },
        plateShadow(appStyle, scheme),
        { backgroundColor: c.container },
        c.border ? { borderWidth: 2, borderStyle: 'dashed', borderColor: c.border } : null,
        e.state === 'stopped' && { paddingBottom: appStyle.space.card + Size.stripeBand },
      ]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${copy.word}. ${copy.duration ?? copy.line ?? ''}. ${typical ? `${typical.a11y} ` : ''}${copy.fresh}.`}>
      <View style={styles.icon}>
        <StateIcon state={e.state} size={Size.stateIcon} variant="card" />
      </View>
      <T v="kicker" color={c.onContainer}>
        {copy.kicker}
      </T>
      <T v="stateWord" color={c.onContainer} accessibilityRole="header">
        {copy.word}
      </T>
      {copy.duration ? (
        <View style={styles.durationRow}>
          <T v="duration" color={c.onContainer} tabular>
            {copy.duration}
          </T>
          <T color={c.onContainer} tabular>
            {copy.since}
          </T>
        </View>
      ) : (
        <T v="stateLine" color={c.onContainer} tabular>
          {copy.line}
        </T>
      )}
      {typical ? (
        <View style={styles.typical}>
          <View style={[styles.typicalRule, { backgroundColor: c.onContainer }]} />
          <View style={styles.typicalRow}>
            <ClockIcon size={18} color={c.onContainer} />
            <T color={c.onContainer} tabular style={styles.typicalText}>
              <T weight={700} color={c.onContainer}>
                {typical.lead}
              </T>{' '}
              {typical.rest}
            </T>
          </View>
        </View>
      ) : null}
      {copy.retry && onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
          <T weight={700} color={c.onContainer} style={styles.underline}>
            Retry
          </T>
        </Pressable>
      ) : null}
      <View style={styles.fresh}>
        {e.freshness === 'live' ? (
          <LiveDot color={c.onContainer} />
        ) : (
          <View style={[styles.ring, { borderColor: freshColor }]} />
        )}
        <T v="secondary" color={freshColor} weight={e.freshness === 'delayed' ? 400 : 600} tabular style={styles.freshText}>
          {copy.fresh}
        </T>
      </View>
      {e.state === 'stopped' ? <StripeBand /> : null}
    </View>
  );
}

/** 8 dp band of 45 degree stripes at 12% white, only on Stopped, never behind text. */
function StripeBand() {
  return (
    <Svg style={styles.stripe} width="100%" height={Size.stripeBand}>
      <Defs>
        <Pattern id="stopped-stripes" width={12} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect x={0} y={0} width={6} height={12} fill="rgba(255,255,255,0.12)" />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height={Size.stripeBand} fill="url(#stopped-stripes)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    overflow: 'hidden',
  },
  icon: { marginBottom: 8 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2 },
  typical: { marginTop: 6, gap: 10 },
  typicalRule: { height: StyleSheet.hairlineWidth, opacity: 0.35 },
  typicalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typicalText: { flexShrink: 1 },
  retry: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', marginLeft: -12, paddingHorizontal: 12, marginVertical: -8 },
  underline: { textDecorationLine: 'underline' },
  fresh: { marginTop: 'auto', paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  freshText: { flexShrink: 1 },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  stripe: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
