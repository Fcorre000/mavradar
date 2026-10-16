import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

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
    ballast: '#5E6166', rail: '#9CA0A6', carTop: '#9A4229', carSide: '#5E2416', carEnd: '#72301B', post: '#0E0F11', label: '#DCE6FF',
  },
} as const;

/** Unknown: the same model in neutral grays, so it reads as "no data" and never as a calm crossing. */
const NO_DATA = {
  light: {
    ...SCENERY.light, grass: '#CDCFD2', sideRight: '#A9ACB0', sideLeft: '#BABDC1', detour: '#9FA3A9', road: '#6B6F75', dash: '#E3E4E6',
    ballast: '#A3A6AA', rail: '#7E8288', post: '#5B5F66', label: '#3F444B',
  },
  dark: {
    ...SCENERY.dark, grass: '#3A3D42', sideRight: '#2C2F33', sideLeft: '#33363A', detour: '#55595F', road: '#26292D', dash: '#4A4D52',
    ballast: '#4A4D52', rail: '#6B6F75', post: '#1A1C1F', label: '#D5D8DC',
  },
} as const;

type Scenery = Record<keyof (typeof SCENERY)['light'], string>;

const W = 358;
const H = 214;
/** Kept short enough that the status card's freshness line stays on screen on a small phone. */
const MAX_HEIGHT = 168;

const LABEL: Record<CrossingState, string> = {
  clear: 'Model of Center St crossing: no train, gates up.',
  approaching: 'Model of Center St crossing: a train is coming down the track and the gates are down.',
  blocked: 'Model of Center St crossing: a train is on the crossing and the gates are down. The West St underpass is open.',
  stopped: 'Model of Center St crossing: a stopped train is on the crossing and the gates are down. The West St underpass is open.',
  unknown: 'Model of Center St crossing, in gray: no current sensor data.',
};

/**
 * Center St as a small isometric model (Model Crossing style): road, track, the West St underpass in
 * the action blue, gate arms down whenever a train is near, and boxcars on the crossing when it is
 * blocked. It shows the state; the status card under it still says it in words. Unknown draws the
 * model in gray with no train and no gate arms, so it never implies the last state or a clear one.
 *
 * The board fills the plate's width and bleeds off its top and bottom, at most 168 dp tall.
 */
export function CrossingModel({ state }: { state: CrossingState }) {
  const scheme = useScheme();
  const appStyle = useStyle();
  const c: Scenery = state === 'unknown' ? NO_DATA[scheme] : SCENERY[scheme];
  const [width, setWidth] = useState(0);
  const onCrossing = state === 'blocked' || state === 'stopped';
  const gatesDown = onCrossing || state === 'approaching';
  const arms = state !== 'unknown';

  const plate = (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ borderRadius: appStyle.radius.card, backgroundColor: c.table, overflow: 'hidden' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABEL[state]}>
      {width > 0 ? (
        <Svg width={width} height={Math.min((width * H) / W, MAX_HEIGHT)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
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
          {/* The far gate stands behind the train, the near one in front of it. */}
          {arms ? <Gate x={176} y={79} down={gatesDown} /> : null}
          <Circle cx={176} cy={79} r={4} fill={c.post} />
          {onCrossing ? <Boxcars c={c} /> : null}
          {state === 'approaching' ? (
            // One car on the near stretch of track, clear of the road and of the label. Each stretch
            // beyond the road holds one car.
            <G transform="translate(-52 30)">
              <Boxcars c={c} lead />
            </G>
          ) : null}
          {arms ? <Gate x={244} y={118} down={gatesDown} /> : null}
          <Circle cx={244} cy={118} r={4} fill={c.post} />
          {/* A table-colored backing keeps the label readable when a train passes behind it. */}
          <Rect x={208} y={32} width={118} height={17} rx={8.5} fill={c.table} opacity={0.92} />
          <SvgText x={214} y={44} fontSize={12} fontWeight="700" fontFamily={appStyle.faces[700].fontFamily} fill={c.label}>
            West St underpass
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
  // The shadow sits on an unclipped wrapper: iOS drops a shadow on a view that clips its content.
  const shadow = plateShadow(appStyle, scheme);
  return shadow ? <View style={[{ borderRadius: appStyle.radius.card }, shadow]}>{plate}</View> : plate;
}

/** Two coupled boxcars sitting on the crossing, or just the lead car. */
function Boxcars({ c, lead }: { c: Scenery; lead?: boolean }) {
  return (
    <>
      <Polygon points="206.2,54.4 219.8,62.2 151.8,101.4 138.2,93.6" fill={c.carTop} />
      <Polygon points="219.8,62.2 219.8,92.2 151.8,131.4 151.8,101.4" fill={c.carSide} />
      <Polygon points="138.2,93.6 151.8,101.4 151.8,131.4 138.2,123.6" fill={c.carEnd} />
      {lead ? null : (
        <>
          <Polygon points="135,95.4 148.6,103.2 116,122 102.4,114.2" fill={c.carTop} />
          <Polygon points="148.6,103.2 148.6,133.2 116,152 116,122" fill={c.carSide} />
        </>
      )}
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
