import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { plateShadow } from '@/constants/styles';
import type { CrossingState } from '@/constants/theme';
import { useScheme, useStyle } from '@/hooks/use-theme';

/** Scenery colors for the model, by scheme. The gate arms keep their real red and white. */
const SCENERY = {
  light: {
    table: '#E8E5DE', grass: '#B9C79F', sideRight: '#8E9A78', sideLeft: '#A3AF8A', detour: '#2F5FCC', road: '#3A3D42', dash: '#F2EFE6',
    ballast: '#8C8F94', rail: '#5B5F66', carTop: '#B04A2E', carSide: '#7A2F1C', carEnd: '#93391F', post: '#1F2124', label: '#1E3F8C',
  },
  dark: {
    table: '#202327', grass: '#4F5B45', sideRight: '#3A4433', sideLeft: '#465140', detour: '#5B84E0', road: '#1A1C1F', dash: '#5E6166',
    ballast: '#5E6166', rail: '#9CA0A6', carTop: '#9A4229', carSide: '#5E2416', carEnd: '#72301B', post: '#0E0F11', label: '#A9C0F2',
  },
} as const;

const W = 358;
const H = 214;
/** Kept short enough that the status card's freshness line stays on screen on a small phone. */
const MAX_HEIGHT = 168;

const LABEL: Record<CrossingState, string> = {
  clear: 'Model of Center St crossing: no train, gates up.',
  approaching: 'Model of Center St crossing: a train is coming down the track and the gates are down.',
  blocked: 'Model of Center St crossing: a train is on the crossing and the gates are down. The West St underpass is open.',
  stopped: 'Model of Center St crossing: a stopped train is on the crossing and the gates are down. The West St underpass is open.',
  unknown: 'Model of Center St crossing, grayed out: no current sensor data.',
};

/**
 * Center St as a small isometric model (Model Crossing style): road, track, the West St underpass in
 * the action blue, gate arms down whenever a train is near, and boxcars on the crossing when it is
 * blocked. It shows the state; the status card under it still says it in words. Unknown grays the
 * model out and shows neither a train nor the gates down, so it never implies the last state.
 */
export function CrossingModel({ state }: { state: CrossingState }) {
  const scheme = useScheme();
  const appStyle = useStyle();
  const c = SCENERY[scheme];
  const [width, setWidth] = useState(0);
  const onCrossing = state === 'blocked' || state === 'stopped';
  const gatesDown = onCrossing || state === 'approaching';

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ borderRadius: appStyle.radius.card, backgroundColor: c.table, paddingTop: 6, overflow: 'hidden' }, plateShadow(appStyle, scheme)]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABEL[state]}>
      {width > 0 ? (
        <Svg width={width} height={Math.min((width * H) / W, MAX_HEIGHT)} viewBox={`0 0 ${W} ${H}`} opacity={state === 'unknown' ? 0.4 : 1}>
          {/* Board and its two visible edges. */}
          <Polygon points="179,10 349,108 179,206 9,108" fill={c.grass} />
          <Polygon points="179,206 349,108 349,116 179,214" fill={c.sideRight} />
          <Polygon points="179,206 9,108 9,116 179,214" fill={c.sideLeft} />
          {/* West St, passing under the track. */}
          <Polygon points="162,19.8 332,117.8 311.6,129.6 141.6,31.6" fill={c.detour} />
          {/* Center St and its center line. */}
          <Polygon points="107.6,51.2 277.6,149.2 250.4,164.8 80.4,66.8" fill={c.road} />
          <Line x1={94} y1={59} x2={264} y2={157} stroke={c.dash} strokeWidth={1.5} strokeDasharray="6 6" />
          {/* Track bed and rails. */}
          <Polygon points="255.5,54.1 85.5,152.1 102.5,161.9 272.5,63.9" fill={c.ballast} />
          <Line x1={260.6} y1={57} x2={90.6} y2={155} stroke={c.rail} strokeWidth={2} />
          <Line x1={267.4} y1={61} x2={97.4} y2={159} stroke={c.rail} strokeWidth={2} />
          {onCrossing ? <Boxcars c={c} /> : null}
          {state === 'approaching' ? (
            <G transform="translate(70 -40)">
              <Boxcars c={c} />
            </G>
          ) : null}
          <Gate x={176} y={79} down={gatesDown} />
          <Gate x={244} y={118} down={gatesDown} />
          <Circle cx={176} cy={79} r={4} fill={c.post} />
          <Circle cx={244} cy={118} r={4} fill={c.post} />
          <SvgText x={214} y={44} fontSize={11} fontWeight="700" fontFamily={appStyle.faces[700].fontFamily} fill={c.label}>
            West St underpass
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

/** Two coupled boxcars sitting on the crossing. */
function Boxcars({ c }: { c: (typeof SCENERY)['light'] | (typeof SCENERY)['dark'] }) {
  return (
    <>
      <Polygon points="206.2,54.4 219.8,62.2 151.8,101.4 138.2,93.6" fill={c.carTop} />
      <Polygon points="219.8,62.2 219.8,92.2 151.8,131.4 151.8,101.4" fill={c.carSide} />
      <Polygon points="138.2,93.6 151.8,101.4 151.8,131.4 138.2,123.6" fill={c.carEnd} />
      <Polygon points="135,95.4 148.6,103.2 116,122 102.4,114.2" fill={c.carTop} />
      <Polygon points="148.6,103.2 148.6,133.2 116,152 116,122" fill={c.carSide} />
    </>
  );
}

/** A gate arm in red and white: across the road when down, straight up when raised. */
function Gate({ x, y, down }: { x: number; y: number; down: boolean }) {
  const x2 = down ? x - 34 : x;
  const y2 = down ? y + 19.6 : y - 38;
  return (
    <>
      <Line x1={x} y1={y} x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
      <Line x1={x} y1={y} x2={x2} y2={y2} stroke="#C62828" strokeWidth={4} strokeDasharray="5 5" />
    </>
  );
}
