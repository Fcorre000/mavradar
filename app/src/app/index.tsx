import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ClockIcon, CloseIcon, Dot, RouteIcon } from '@/components/icons';
import { DemoBadge, Header, Screen, useBottomInset, useLargeText } from '@/components/layout';
import { InfoRow, SwitchRow } from '@/components/rows';
import { Snackbar } from '@/components/snackbar';
import { StatusCard } from '@/components/status-card';
import { T } from '@/components/text';
import { TodayTimeline } from '@/components/today-timeline';
import { Layout, Radius } from '@/constants/theme';
import { DISCLAIMER, statusCopy } from '@/domain/copy';
import { crossingById } from '@/domain/crossings';
import { effectiveState } from '@/domain/freshness';
import { formatTime } from '@/domain/time';
import { useTheme } from '@/hooks/use-theme';
import { demo, dismissTip, openDirections, toggleFollow } from '@/state/actions';
import { useApp } from '@/state/store';
import { source } from '@/data';

export default function StatusScreen() {
  const theme = useTheme();
  const bottomInset = useBottomInset();
  const largeText = useLargeText();
  const snapshot = useApp((s) => s.snapshot);
  const crossingId = useApp((s) => s.ui.statusCrossingId);
  const following = useApp((s) => s.prefs.following);
  const showTip = useApp((s) => s.demo.showTip || (s.prefs.launches >= 2 && !s.prefs.tipDismissed && s.prefsLoaded));

  const crossing = crossingById(crossingId);
  const isFollowing = following.includes(crossing.id);
  const e = effectiveState(snapshot.readings[crossing.id], snapshot);
  const copy = statusCopy(crossing, e, snapshot.now, isFollowing);
  const events = snapshot.events.filter((ev) => ev.crossingId === crossing.id);
  const last = events[events.length - 1];
  const lastText = last ? `${formatTime(last.start)} · ${last.durationMin} min · ${last.stopped ? 'stopped' : 'moving'}` : 'None recorded yet';
  const disclaimer = (
    <T v="disclaimer" color={theme.textSecondary}>
      {DISCLAIMER}
    </T>
  );

  return (
    <Screen>
      <Header
        title={crossing.name}
        subtitle={`${crossing.city}, TX · USDOT ${crossing.id}`}
        right={source.kind === 'demo' ? <DemoBadge /> : null}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <StatusCard e={e} copy={copy} onRetry={demo.retry} />
        <T>{copy.explanation}</T>

        {showTip ? (
          <View style={[styles.tip, { backgroundColor: theme.backgroundElement, borderColor: theme.divider }]}>
            <ClockIcon color={theme.text} />
            <View style={styles.tipText}>
              <T weight={600}>Set your commute hours so alerts only come when you drive.</T>
              <Pressable onPress={() => router.navigate('/settings')} accessibilityRole="link" style={styles.tipLink}>
                <T v="secondary" weight={700} style={styles.underline}>
                  Set commute hours
                </T>
              </Pressable>
            </View>
            <Pressable onPress={dismissTip} accessibilityRole="button" accessibilityLabel="Dismiss tip" style={styles.tipClose}>
              <CloseIcon color={theme.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <TodayTimeline events={events} e={e} now={snapshot.now} onPress={() => router.navigate('/history')} />
        )}

        <View>
          <SwitchRow label={`Alerts for ${crossing.name}`} value={isFollowing} onChange={() => toggleFollow(crossing.id)} />
          <InfoRow
            label="Sensor"
            value={e.state === 'unknown' ? copy.sensor : `${copy.sensor} · East node`}
            valueColor={e.state === 'unknown' ? theme.textSecondary : theme.text}
            leading={<Dot color={e.state === 'unknown' ? theme.textSecondary : theme.sensorOk} hollow={e.state === 'unknown'} />}
          />
          <InfoRow label="Last blockage" value={lastText} last />
        </View>
        {largeText ? disclaimer : null}
      </ScrollView>

      <View style={styles.pinned}>
        <Button
          label="Directions via West St underpass"
          sublabel="Opens Google Maps"
          variant={e.state === 'clear' ? 'tonal' : 'filled'}
          icon={(c) => <RouteIcon color={c} />}
          onPress={openDirections}
        />
        {largeText ? null : disclaimer}
      </View>
      <View style={{ height: bottomInset }} />
      <Snackbar bottom={bottomInset + 12} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Layout.screenPadding, paddingTop: 8, paddingBottom: 16, gap: Layout.sectionGap },
  pinned: { paddingHorizontal: Layout.screenPadding, paddingTop: 12, paddingBottom: 12, gap: 12 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: Radius.button, borderWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingBottom: 10, paddingLeft: 16, paddingRight: 4 },
  tipText: { flex: 1, gap: 2 },
  tipLink: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  tipClose: { width: 48, height: 48, marginTop: -10, alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
