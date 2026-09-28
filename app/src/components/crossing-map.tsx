import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Svg, { Circle } from 'react-native-svg';

import { DetourPin, StarIcon } from '@/components/icons';
import { MapStyles } from '@/components/map-style';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { StatusStrong, type CrossingState } from '@/constants/theme';
import { clusterCrossings, regionFor, worstState, type MapRegion } from '@/domain/clusters';
import { STATE_WORD } from '@/domain/copy';
import { DETOUR } from '@/domain/crossings';
import type { Crossing } from '@/domain/types';
import { useScheme, useTheme } from '@/hooks/use-theme';

export const MAP_AVAILABLE = true;

type Props = {
  crossings: Crossing[];
  states: Record<string, CrossingState>;
  selectedId: string;
  following: string[];
  onSelect: (id: string) => void;
  /** Dragging the map collapses the sheet to peek. */
  onDrag: () => void;
  topPadding: number;
  bottomPadding: number;
};

/**
 * Apple Maps on iOS, Google Maps on Android (with the JSON style from tokens.json).
 * Markers use the state shapes; below zoom 12 nearby crossings merge into clusters.
 */
export function CrossingMap({ crossings, states, selectedId, following, onSelect, onDrag, topPadding, bottomPadding }: Props) {
  const scheme = useScheme();
  const mapRef = useRef<MapView>(null);
  const initial = useMemo<MapRegion>(
    () => (crossings.length > 1 ? regionFor(crossings) : { latitude: crossings[0].latitude, longitude: crossings[0].longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }),
    [crossings],
  );
  const [region, setRegion] = useState<MapRegion>(initial);
  const [viewport, setViewport] = useState({ width: 400, height: 800 });

  // A different set of crossings (1 vs 12 in the demo) re-fits the map.
  useEffect(() => {
    mapRef.current?.animateToRegion(initial, 400);
  }, [initial]);

  // Keep the selected crossing visible above the sheet as it grows.
  useEffect(() => {
    const c = crossings.find((x) => x.id === selectedId);
    if (c) mapRef.current?.animateCamera({ center: { latitude: c.latitude, longitude: c.longitude } }, { duration: 250 });
  }, [bottomPadding, selectedId, crossings]);

  const items = clusterCrossings(crossings, region, viewport);
  const zoomedIn = region.latitudeDelta < 0.02;

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={initial}
      onRegionChangeComplete={setRegion}
      onLayout={(ev) => setViewport({ width: ev.nativeEvent.layout.width, height: ev.nativeEvent.layout.height })}
      onPanDrag={onDrag}
      customMapStyle={MapStyles[scheme]}
      userInterfaceStyle={scheme}
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      mapPadding={{ top: topPadding, bottom: bottomPadding, left: 0, right: 0 }}>
      {zoomedIn ? (
        <Marker coordinate={DETOUR} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} tappable={false}>
          <DetourMarker />
        </Marker>
      ) : null}
      {items.map((item) =>
        item.kind === 'crossing' ? (
          <CrossingMarker
            key={`${item.crossing.id}-${states[item.crossing.id]}-${item.crossing.id === selectedId}-${following.includes(item.crossing.id)}-${scheme}`}
            crossing={item.crossing}
            state={states[item.crossing.id] ?? 'unknown'}
            selected={item.crossing.id === selectedId}
            followed={following.includes(item.crossing.id)}
            onPress={() => onSelect(item.crossing.id)}
          />
        ) : (
          <ClusterMarker
            key={`${item.id}-${item.crossings.map((c) => states[c.id]).join('')}-${scheme}`}
            count={item.crossings.length}
            states={item.crossings.map((c) => states[c.id] ?? 'unknown')}
            latitude={item.latitude}
            longitude={item.longitude}
            onPress={() => mapRef.current?.animateToRegion(regionFor(item.crossings, 0.006), 350)}
          />
        ),
      )}
    </MapView>
  );
}

/**
 * Custom marker views only redraw while tracksViewChanges is on. Markers are keyed by their look,
 * so a change remounts them; tracking stays on just long enough for the first draw.
 */
function useTrackChanges() {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTrack(false), 400);
    return () => clearTimeout(t);
  }, []);
  return track;
}

function CrossingMarker({ crossing, state, selected, followed, onPress }: { crossing: Crossing; state: CrossingState; selected: boolean; followed: boolean; onPress: () => void }) {
  const theme = useTheme();
  const track = useTrackChanges();
  const size = selected ? 44 : 36;
  const label = `${crossing.name} crossing, ${STATE_WORD[state]}${followed ? ', following' : ''}`;
  return (
    <Marker
      coordinate={{ latitude: crossing.latitude, longitude: crossing.longitude }}
      anchor={{ x: 0.5, y: selected ? 64 / 88 : 0.5 }}
      tracksViewChanges={track}
      onPress={onPress}
      zIndex={selected ? 10 : 1}>
      <View style={selected ? styles.selectedBox : styles.box} accessible accessibilityLabel={label} accessibilityRole="button">
        {selected ? (
          <View style={[styles.pill, { backgroundColor: theme.sheet, borderColor: theme.divider }]}>
            <T v="kicker" weight={600}>
              {crossing.name} · {STATE_WORD[state]}
            </T>
          </View>
        ) : null}
        <View style={styles.hit}>
          <StateIcon state={state} size={size} variant="marker" />
          {followed ? (
            <View style={[styles.star, { right: selected ? -2 : 2 }]}>
              <StarIcon size={10} color="#13213A" filled />
            </View>
          ) : null}
        </View>
      </View>
    </Marker>
  );
}

function ClusterMarker({ count, states, latitude, longitude, onPress }: { count: number; states: CrossingState[]; latitude: number; longitude: number; onPress: () => void }) {
  const scheme = useScheme();
  const theme = useTheme();
  const worst = worstState(states);
  const hot = states.filter((s) => s === 'blocked' || s === 'stopped').length;
  const track = useTrackChanges();
  const circ = 2 * Math.PI * 21;
  const fill = scheme === 'dark' ? '#22304A' : '#FFFFFF';
  return (
    <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} onPress={onPress}>
      <View style={styles.cluster} accessible accessibilityRole="button" accessibilityLabel={`${count} crossings${hot ? `, ${hot} blocked or stopped` : ''}. Zoom in.`}>
        <Svg width={52} height={52} viewBox="0 0 52 52" style={StyleSheet.absoluteFill}>
          <Circle cx={26} cy={26} r={21} fill={fill} stroke="rgba(0,0,0,0.4)" strokeWidth={5} />
          <Circle cx={26} cy={26} r={21} fill={fill} stroke="#FFFFFF" strokeWidth={3} />
          {worst ? (
            <Circle cx={26} cy={26} r={21} fill="none" stroke={StatusStrong[worst].fill} strokeWidth={4} strokeDasharray={`${(circ * hot) / count} ${circ}`} rotation={-90} origin="26,26" />
          ) : null}
        </Svg>
        <T weight={700} color={theme.text}>
          {count}
        </T>
        {worst ? (
          <View style={styles.badge}>
            <StateIcon state={worst} size={20} variant="marker" />
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

function DetourMarker() {
  const theme = useTheme();
  const scheme = useScheme();
  return (
    <View style={styles.detour} accessible accessibilityLabel="West St underpass, detour route">
      <View style={[styles.detourLabel, { backgroundColor: theme.sheet }]}>
        <T v="axis" weight={600}>
          West St underpass
        </T>
      </View>
      <DetourPin color={scheme === 'dark' ? '#8A919C' : '#4A5260'} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  selectedBox: { width: 220, height: 88, alignItems: 'center', justifyContent: 'flex-end' },
  hit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 32, marginBottom: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  star: { position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)' },
  cluster: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', paddingTop: 6, paddingRight: 6 },
  badge: { position: 'absolute', top: 0, right: 0 },
  detour: { alignItems: 'center' },
  detourLabel: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginBottom: 2 },
});
