import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CrossingModel } from '@/components/crossing-model';
import { ClockIcon, CloseIcon, Dot, RouteIcon, ShareIcon } from '@/components/icons';
import { DemoBadge, Header, Screen, useBottomInset, useLargeText } from '@/components/layout';
import { InfoRow, RowGroup, SwitchRow } from '@/components/rows';
import { ChoiceSheet } from '@/components/sheet-modal';
import { Snackbar } from '@/components/snackbar';
import { StatusCard } from '@/components/status-card';
import { T } from '@/components/text';
import { TodayTimeline } from '@/components/today-timeline';
import { pillRadius, raised } from '@/constants/styles';
import { DISCLAIMER, sensorLine, shareText, statusCopy, typicalCopy } from '@/domain/copy';
import { crossingById } from '@/domain/crossings';
import { effectiveState } from '@/domain/freshness';
import { formatTime } from '@/domain/time';
import { useScheme, useStyle, useTheme } from '@/hooks/use-theme';
import { demo, DIRECTIONS_APP, dismissTip, openDirections, shareStatus, toggleFollow } from '@/state/actions';
import { setUi, useApp } from '@/state/store';
import { source } from '@/data';

export default function StatusScreen() {
  const theme = useTheme();
  const appStyle = useStyle();
  const scheme = useScheme();
  const bottomInset = useBottomInset();
  const largeText = useLargeText();
  const snapshot = useApp((s) => s.snapshot);
  const crossingId = useApp((s) => s.ui.statusCrossingId);
  const following = useApp((s) => s.prefs.following);
  const showTip = useApp((s) => s.demo.showTip || (s.prefs.launches >= 2 && !s.prefs.tipDismissed && s.prefsLoaded));
  const [switching, setSwitching] = useState(false);
  // Whether content runs under the pinned footer, so the footer can show its edge.
  const [scrollBox, setScrollBox] = useState({ view: 0, content: 0 });
  const underFooter = scrollBox.content > scrollBox.view + 1;

  const crossing = crossingById(crossingId);
  const isFollowing = following.includes(crossing.id);
  const e = effectiveState(snapshot.readings[crossing.id], snapshot);
  const copy = statusCopy(crossing, e, snapshot.now, isFollowing);
  const typical = typicalCopy(e, snapshot.events, crossing.id, snapshot.now);
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
        subtitle={`${crossing.city}, TX`}
        right={
          <View style={styles.headerRight}>
            {following.length > 1 ? (
              <Pressable onPress={() => setSwitching(true)} accessibilityRole="button" accessibilityLabel="Switch crossing" style={styles.switchBtn}>
                <T v="secondary" weight={700} style={styles.underline}>
                  Switch
                </T>
              </Pressable>
            ) : null}
            {source.kind === 'demo' ? <DemoBadge /> : null}
            <Pressable
              onPress={() => shareStatus(shareText(crossing, e, snapshot.now))}
              accessibilityRole="button"
              accessibilityLabel={`Share ${crossing.name} status`}
              style={({ pressed }) => [styles.shareBtn, { backgroundColor: theme.tonal, borderRadius: pillRadius(appStyle, 48) }, raised(appStyle, scheme, 'tonal'), pressed && styles.pressed]}>
              <ShareIcon color={theme.text} />
            </Pressable>
          </View>
        }
      />
      <ScrollView
        onLayout={(ev) => {
          const view = ev.nativeEvent.layout.height;
          setScrollBox((b) => ({ ...b, view }));
        }}
        onContentSizeChange={(_, content) => setScrollBox((b) => ({ ...b, content }))}
        contentContainerStyle={[styles.content, { paddingHorizontal: appStyle.space.screen, gap: appStyle.space.section }]}>
        {appStyle.crossingModel ? <CrossingModel state={e.state} /> : null}
        <StatusCard e={e} copy={copy} typical={typical} onRetry={demo.retry} />
        <T>{copy.explanation}</T>

        <TodayTimeline events={events} e={e} now={snapshot.now} onPress={() => router.navigate('/history')} />

        {/* The second-visit tip sits under the timeline; it never takes the timeline's place. */}
        {showTip ? (
          <View style={[styles.tip, { backgroundColor: theme.backgroundElement, borderColor: theme.divider, borderRadius: appStyle.radius.panel }]}>
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
        ) : null}

        <RowGroup>
          <SwitchRow label={`Alerts for ${crossing.name}`} value={isFollowing} onChange={() => toggleFollow(crossing.id)} />
          <InfoRow
            label="Sensor"
            value={sensorLine(copy, e, snapshot.readings[crossing.id])}
            valueColor={e.state === 'unknown' ? theme.textSecondary : theme.text}
            leading={<Dot color={e.state === 'unknown' ? theme.textSecondary : theme.sensorOk} hollow={e.state === 'unknown'} />}
          />
          <InfoRow label="Last blockage" value={lastText} last />
        </RowGroup>
        {largeText ? disclaimer : null}
      </ScrollView>

      <View
        style={[
          styles.pinned,
          { paddingHorizontal: appStyle.space.screen },
          underFooter && appStyle.footerEdge === 'hairline' && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.divider },
          underFooter && appStyle.footerEdge === 'shadow' && appStyle.depth && { backgroundColor: theme.background, boxShadow: appStyle.depth[scheme].lift },
        ]}>
        <Button
          label="Directions via West St underpass"
          sublabel={`Opens ${DIRECTIONS_APP}`}
          variant={e.state === 'clear' ? 'tonal' : 'filled'}
          icon={(c) => <RouteIcon color={c} />}
          onPress={openDirections}
        />
        {largeText ? null : disclaimer}
      </View>
      <View style={{ height: bottomInset }} />
      <Snackbar bottom={bottomInset + 12} />
      <ChoiceSheet
        visible={switching}
        title="Show on Status"
        value={crossing.id}
        options={following.map((id) => ({ value: id, label: crossingById(id).name, sub: crossingById(id).city }))}
        onPick={(id) => setUi({ statusCrossingId: id })}
        onClose={() => setSwitching(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 16 },
  // Kept tight so the Directions button sits low and the status card above it stays in view.
  pinned: { paddingTop: 8, paddingBottom: 6, gap: 8 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingBottom: 10, paddingLeft: 16, paddingRight: 4 },
  tipText: { flex: 1, gap: 2 },
  tipLink: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  tipClose: { width: 48, height: 48, marginTop: -10, alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  switchBtn: { minHeight: 48, paddingHorizontal: 10, justifyContent: 'center' },
  shareBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  pressed: { opacity: 0.7 },
});
