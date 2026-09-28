import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrossingList } from '@/components/crossing-list';
import { CrossingMap, MAP_AVAILABLE } from '@/components/crossing-map';
import { CrossingSheet } from '@/components/crossing-sheet';
import { CloudOffIcon, MapOffIcon } from '@/components/icons';
import { Screen, useBottomInset } from '@/components/layout';
import { Segmented } from '@/components/segmented';
import { Snackbar } from '@/components/snackbar';
import { T } from '@/components/text';
import { Layout, Radius, Size, type CrossingState } from '@/constants/theme';
import { DISCLAIMER, statusCopy } from '@/domain/copy';
import { crossingById } from '@/domain/crossings';
import { effectiveState } from '@/domain/freshness';
import { useTheme } from '@/hooks/use-theme';
import { showSnack } from '@/state/actions';
import { setUi, useApp, visibleCrossings } from '@/state/store';

const PEEK = Size.sheetPeek;
const HALF = Size.sheetHalf;

export default function MapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const snapshot = useApp((s) => s.snapshot);
  const crossings = useApp(visibleCrossings);
  const following = useApp((s) => s.prefs.following);
  const selectedId = useApp((s) => s.ui.selectedCrossingId);
  const mapView = useApp((s) => s.ui.mapView);
  const sheetRef = useRef<BottomSheet>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const [sheetTop, setSheetTop] = useState(0);

  const listMode = mapView === 'list' || !MAP_AVAILABLE;
  const offline = snapshot.connection !== 'online';
  const selected = crossings.find((c) => c.id === selectedId) ?? crossings[0];
  const e = effectiveState(snapshot.readings[selected.id], snapshot);
  const copy = statusCopy(selected, e, snapshot.now, following.includes(selected.id));
  const states = useMemo(() => {
    const out: Record<string, CrossingState> = {};
    for (const c of crossings) out[c.id] = effectiveState(snapshot.readings[c.id], snapshot).state;
    return out;
  }, [crossings, snapshot]);
  const snapPoints = useMemo(() => [PEEK, HALF, '88%'], []);

  const collapse = useCallback(() => {
    if (sheetIndex > 0) sheetRef.current?.snapToIndex(0);
  }, [sheetIndex]);

  const openFromList = (id: string) => {
    if (MAP_AVAILABLE) {
      setUi({ selectedCrossingId: id, mapView: 'map' });
    } else {
      setUi({ statusCrossingId: id });
      router.navigate('/');
    }
  };

  const toggle = (
    <Segmented
      label="View"
      value={listMode ? 'list' : 'map'}
      onChange={(v) => setUi({ mapView: v })}
      options={[
        { value: 'map', label: 'Map', disabled: !MAP_AVAILABLE },
        { value: 'list', label: 'List' },
      ]}
      style={styles.toggle}
    />
  );

  const coverage = (
    <View style={[styles.banner, { backgroundColor: theme.sheet, borderColor: theme.divider }]}>
      <T v="secondary">1 crossing live in Arlington. More coming.</T>
      <Pressable onPress={() => showSnack('Crossing suggestions open once more sensors are funded.')} accessibilityRole="link" style={styles.link}>
        <T v="secondary" weight={700} style={styles.underline}>
          Suggest a crossing
        </T>
      </Pressable>
    </View>
  );

  const offlineBanner = (
    <View style={[styles.banner, styles.offline, { backgroundColor: theme.sheet, borderColor: theme.textSecondary }]} accessibilityLiveRegion="polite">
      <CloudOffIcon color={theme.text} />
      <View style={styles.offlineText}>
        <T weight={700}>{snapshot.connection === 'phone' ? "You're offline." : "Can't reach MavRadar."}</T>
        <T v="secondary" color={theme.textSecondary}>
          Crossings show Unknown until {snapshot.connection === 'phone' ? 'you reconnect' : 'we reconnect'}.
        </T>
      </View>
    </View>
  );

  if (listMode) {
    return (
      <Screen>
        <View style={[styles.listTop, { paddingTop: insets.top + 8 }]}>{toggle}</View>
        {!MAP_AVAILABLE ? (
          <View style={[styles.inlineBanner, { backgroundColor: theme.backgroundElement }]}>
            <MapOffIcon color={theme.text} />
            <T weight={600}>Map unavailable. Showing list.</T>
          </View>
        ) : null}
        {offline ? <View style={styles.inlineWrap}>{offlineBanner}</View> : null}
        <CrossingList
          crossings={crossings}
          snapshot={snapshot}
          following={following}
          onOpen={openFromList}
          footer={
            crossings.length === 1 ? (
              <View style={styles.footer}>
                {coverage}
                <T v="disclaimer" color={theme.textSecondary}>
                  {DISCLAIMER}
                </T>
              </View>
            ) : null
          }
        />
        <View style={{ height: bottomInset }} />
        <Snackbar bottom={bottomInset + 12} />
      </Screen>
    );
  }

  const sheetHeight = screenHeight && sheetTop ? screenHeight - sheetTop : PEEK + bottomInset;

  return (
    <Screen>
      <View style={styles.fill} onLayout={(ev) => setScreenHeight(ev.nativeEvent.layout.height)}>
        <CrossingMap
          crossings={crossings}
          states={states}
          selectedId={selected.id}
          following={following}
          onSelect={(id) => {
            setUi({ selectedCrossingId: id });
            if (sheetIndex < 0) sheetRef.current?.snapToIndex(0);
          }}
          onDrag={collapse}
          topPadding={insets.top + 120}
          bottomPadding={sheetIndex === 0 ? PEEK + bottomInset : Math.min(sheetHeight, HALF + bottomInset)}
        />
        <View style={[styles.mapTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          {toggle}
          {sheetIndex < 2 ? (offline ? offlineBanner : crossings.length === 1 ? coverage : null) : null}
        </View>
        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          bottomInset={bottomInset}
          onChange={(index, position) => {
            setSheetIndex(index);
            setSheetTop(position);
          }}
          backgroundStyle={{ backgroundColor: theme.sheet, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet }}
          handleIndicatorStyle={{ backgroundColor: theme.sheetHandle, width: 32 }}
          accessibilityLabel={`${selected.name} details`}>
          <BottomSheetScrollView>
            <CrossingSheet crossing={crossingById(selected.id)} e={e} copy={copy} following={following.includes(selected.id)} events={snapshot.events} now={snapshot.now} />
          </BottomSheetScrollView>
        </BottomSheet>
        <Snackbar bottom={sheetHeight + 12} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  toggle: { alignSelf: 'center', width: 216 },
  listTop: { paddingHorizontal: Layout.screenPadding, paddingBottom: 12 },
  mapTop: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: Layout.screenPadding, gap: 16 },
  banner: { borderRadius: Radius.button, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  offline: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 2, borderStyle: 'dashed' },
  offlineText: { flex: 1, gap: 2 },
  link: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  inlineBanner: { marginHorizontal: Layout.screenPadding, marginBottom: 8, padding: 14, borderRadius: Radius.button, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineWrap: { paddingHorizontal: Layout.screenPadding, paddingBottom: 8 },
  footer: { padding: Layout.screenPadding, gap: 16 },
});
