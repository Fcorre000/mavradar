import Constants from 'expo-constants';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { BellIcon } from '@/components/icons';
import { Screen, useBottomInset } from '@/components/layout';
import { InfoRow, NavRow, SwitchRow } from '@/components/rows';
import { Segmented } from '@/components/segmented';
import { ChoiceSheet, SheetModal } from '@/components/sheet-modal';
import { Snackbar } from '@/components/snackbar';
import { T } from '@/components/text';
import { Layout, Radius } from '@/constants/theme';
import { source } from '@/data';
import type { AlertType } from '@/domain/alerts';
import { DISCLAIMER } from '@/domain/copy';
import { crossingById } from '@/domain/crossings';
import { effectiveState } from '@/domain/freshness';
import { formatAgo } from '@/domain/time';
import type { Connection, ReportedState } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { demo, setAlertType, setPrefs, showSnack } from '@/state/actions';
import { setUi, useApp } from '@/state/store';

const COMMUTE = [
  { value: 0 as const, label: 'All day', sub: 'Alerts any time' },
  { value: 1 as const, label: 'Weekdays 7 to 9 AM, 4 to 7 PM', sub: 'Only while you usually drive' },
];
const QUIET = [
  { value: 0 as const, label: 'Off' },
  { value: 1 as const, label: '10 PM to 6 AM', sub: 'No alerts overnight' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const prefs = useApp((s) => s.prefs);
  const permission = useApp((s) => s.permission);
  const cardFor = useApp((s) => s.ui.settingsCardFor);
  const [sheet, setSheet] = useState<null | 'commute' | 'quiet' | 'how' | 'sensors'>(null);

  const granted = permission === 'granted';
  const statusLine = granted
    ? 'Android notifications are on for MavRadar.'
    : permission === 'denied'
      ? 'Notifications are off for MavRadar.'
      : "Notifications aren't set up yet. They turn on when you follow a crossing.";
  const followedNames = prefs.following.map((id) => crossingById(id).name).join(', ');

  const alertRow = (type: AlertType, label: string, description: string) => (
    <View key={type}>
      <SwitchRow label={label} description={description} value={granted && prefs.alertTypes[type]} onChange={(on) => setAlertType(type, on)} />
      {cardFor === type ? (
        <View style={[styles.offCard, { borderColor: theme.outline }]} accessibilityLiveRegion="polite">
          <T weight={600}>Notifications are off for MavRadar in your phone&apos;s settings.</T>
          <T v="secondary" color={theme.textSecondary}>
            Turn them on there to get alerts. Status still works without them.
          </T>
          <Button
            label="Open settings"
            variant="tonal"
            center
            onPress={() => {
              setUi({ settingsCardFor: null });
              Linking.openSettings().catch(() => showSnack("Couldn't open settings."));
            }}
            style={styles.offButton}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: bottomInset + 32 }]}>
        <T v="crossingName" accessibilityRole="header">
          Settings
        </T>

        <Section title="Alerts">
          <View style={[styles.statusLine, { backgroundColor: theme.backgroundElement }]}>
            <BellIcon color={theme.text} off={!granted} />
            <T v="secondary" style={styles.flex}>
              {statusLine}
            </T>
          </View>
          <T v="secondary" color={theme.textSecondary}>
            {followedNames ? `For crossings you follow: ${followedNames}` : "You're not following a crossing yet. Follow one from Status or the map."}
          </T>
          <View>
            {alertRow('blocked', 'Blocked', 'When a train blocks the crossing')}
            {alertRow('cleared', 'Cleared', 'When the crossing clears')}
            {alertRow('stopped', 'Stopped', 'When a train stops across the road')}
            <SwitchRow label="Approaching" description="Available when early-warning sensors are installed" value={false} onChange={() => {}} disabled last />
          </View>
          <View style={styles.block}>
            <T>Minimum blockage before alerting</T>
            <Segmented
              label="Minimum blockage"
              value={prefs.minBlockMin}
              onChange={(v) => setPrefs({ minBlockMin: v })}
              options={[
                { value: 1, label: '1 min' },
                { value: 3, label: '3 min' },
                { value: 5, label: '5 min' },
              ]}
            />
            <T v="secondary" color={theme.textSecondary}>
              Blockages shorter than this won&apos;t alert you.
            </T>
          </View>
          <View>
            <NavRow label="Commute windows" description="Only alert at set times, like weekdays 7 to 9 AM" value={prefs.commute ? 'Set' : 'All day'} onPress={() => setSheet('commute')} />
            <NavRow label="Quiet hours" description="No alerts overnight or while you sleep" value={prefs.quiet ? 'On' : 'Off'} onPress={() => setSheet('quiet')} />
          </View>
        </Section>

        <Section title="Appearance">
          <Segmented
            label="Theme"
            value={prefs.appearance}
            onChange={(v) => setPrefs({ appearance: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Section>

        <Section title="About">
          <View>
            <NavRow label="How detection works" onPress={() => setSheet('how')} />
            <NavRow label="Sensors" value="1 online" onPress={() => setSheet('sensors')} />
          </View>
          <View style={styles.block}>
            <T>Privacy</T>
            <T v="secondary" color={theme.textSecondary}>
              No account. No location. We store an anonymous device token for alerts.
            </T>
          </View>
          <T v="disclaimer" color={theme.textSecondary}>
            {DISCLAIMER}
          </T>
          <T v="disclaimer" color={theme.textSecondary}>
            Version {Constants.expoConfig?.version ?? '1.0.0'}
          </T>
        </Section>

        {source.kind === 'demo' ? <DemoControls /> : null}
      </ScrollView>

      <ChoiceSheet visible={sheet === 'commute'} title="Commute windows" options={COMMUTE} value={prefs.commute} onPick={(v) => setPrefs({ commute: v })} onClose={() => setSheet(null)} />
      <ChoiceSheet visible={sheet === 'quiet'} title="Quiet hours" options={QUIET} value={prefs.quiet} onPick={(v) => setPrefs({ quiet: v })} onClose={() => setSheet(null)} />
      <SheetModal visible={sheet === 'how'} title="How detection works" onClose={() => setSheet(null)} doneLabel="Done">
        <T>A small solar-powered radar near the tracks watches for trains and reports every few seconds. When a train is on the crossing, MavRadar shows it here and, if you follow the crossing, sends an alert.</T>
        <T>If the sensor goes quiet, MavRadar shows Unknown instead of guessing.</T>
        <T v="disclaimer" color={theme.textSecondary}>
          {DISCLAIMER}
        </T>
      </SheetModal>
      <SheetModal visible={sheet === 'sensors'} title="Sensors" onClose={() => setSheet(null)} doneLabel="Done">
        <SensorList />
      </SheetModal>
      <Snackbar bottom={bottomInset + 12} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <T v="secondary" weight={600} color={theme.textSecondary} accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

function SensorList() {
  const snapshot = useApp((s) => s.snapshot);
  const e = effectiveState(snapshot.readings['794978C'], snapshot);
  return <InfoRow label="Center St · East node" value={e.state === 'unknown' ? 'Offline' : 'Online · battery OK'} last />;
}

const STATES: { value: ReportedState; label: string }[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'approaching', label: 'Approaching' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'sensorOffline', label: 'Sensor offline' },
];
const CONNECTIONS: { value: Connection; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'phone', label: 'Phone offline' },
  { value: 'server', label: 'Server down' },
];

/**
 * Demo controls, standing in for the sensor and the phone until the server is live.
 * Clearly labeled, and only shown while the app runs on simulated data.
 */
function DemoControls() {
  const theme = useTheme();
  const controls = useApp((s) => s.controls);
  const snapshot = useApp((s) => s.snapshot);
  const dataset = useApp((s) => s.demo.dataset);
  const historyEmpty = useApp((s) => s.demo.historyEmpty);
  const showTip = useApp((s) => s.demo.showTip);
  const reading = snapshot.readings['794978C'];
  const beat =
    controls.connection !== 'online'
      ? 'No connection'
      : controls.centerState === 'sensorOffline'
        ? 'Sensor offline'
        : `Last heartbeat ${formatAgo((snapshot.now - reading.lastReadingAt) / 1000)}${controls.frozen ? ' (frozen)' : ''}`;

  return (
    <Section title="Demo">
      <View style={[styles.demoNote, { borderColor: theme.outline }]}>
        <T v="secondary">Crossing states here are simulated. These controls stand in for the sensor and your phone. Demo alerts use the Service status channel, never Train alerts.</T>
      </View>

      <View style={styles.block}>
        <T weight={600}>Center St sensor reports</T>
        <Chips label="Reported state" value={controls.centerState} onChange={demo.setCenterState} options={STATES} />
      </View>
      <Button
        label={controls.scenarioRunning ? 'Train running…' : 'Play a train'}
        sublabel="Approaching, blocked, stopped, cleared at 20x speed"
        variant="filled"
        onPress={() => !controls.scenarioRunning && demo.playTrain()}
      />
      <View>
        <SwitchRow label="Freeze heartbeat" description={`${beat}. Live becomes Delayed at 30 s and Unknown at 90 s.`} value={controls.frozen} onChange={demo.setFrozen} />
      </View>
      <View style={styles.block}>
        <T weight={600}>Clock speed</T>
        <Chips
          label="Clock speed"
          value={controls.speed}
          onChange={demo.setSpeed}
          options={[
            { value: 1, label: '1x' },
            { value: 10, label: '10x' },
            { value: 20, label: '20x' },
            { value: 30, label: '30x' },
          ]}
        />
      </View>
      <View style={styles.block}>
        <T weight={600}>Connection</T>
        <Chips label="Connection" value={controls.connection} onChange={demo.setConnection} options={CONNECTIONS} />
      </View>
      <View style={styles.block}>
        <T weight={600}>Crossings</T>
        <Segmented
          label="Crossings"
          value={dataset}
          onChange={demo.setDataset}
          options={[
            { value: 'one', label: '1 (launch)' },
            { value: 'many', label: '12 on the line' },
          ]}
        />
      </View>
      <View>
        <SwitchRow label="Empty history" description="Show History as a brand new sensor" value={historyEmpty} onChange={demo.setHistoryEmpty} />
        <SwitchRow label="Second-visit tip" description="Show the commute hours tip on Status" value={showTip} onChange={demo.setShowTip} last />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Layout.screenPadding, gap: 8 },
  section: { gap: 12, paddingTop: 20 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: Radius.button },
  flex: { flex: 1 },
  block: { gap: 10, paddingVertical: 4 },
  offCard: { borderWidth: 1, borderRadius: Radius.button, padding: 16, gap: 8, marginVertical: 8 },
  offButton: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 18 },
  demoNote: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.button, padding: 14 },
});
