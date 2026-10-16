import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Line, Pattern, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { plateShadow } from '@/constants/styles';
import type { CrossingState } from '@/constants/theme';
import { useScheme, useStyle } from '@/hooks/use-theme';

/** Scenery colors for the model, by scheme. Gate arms, crossbucks and signal lamps keep their real colors. */
const SCENERY = {
  light: {
    table: '#E8E5DE', grass: '#B9C79F', grassDark: '#A6B58A', grassLight: '#C9D5B2', sideRight: '#8E9A78', sideLeft: '#A3AF8A',
    detour: '#2F5FCC', road: '#3A3D42', dash: '#F2EFE6', ballast: '#8C8F94', ballastDark: '#73767B', ballastLight: '#A4A7AB',
    tie: '#5C4A3C', rail: '#4E5258', post: '#1F2124', label: '#1E3F8C', lamp: '#FFF8E8', shadow: 'rgba(40, 32, 20, 0.22)',
  },
  dark: {
    table: '#26211C', grass: '#4F5B45', grassDark: '#45503C', grassLight: '#5A6750', sideRight: '#3A4433', sideLeft: '#465140',
    detour: '#5B84E0', road: '#1A1C1F', dash: '#5E6166', ballast: '#5E6166', ballastDark: '#4C4F54', ballastLight: '#73767B',
    tie: '#3A2F27', rail: '#9CA0A6', post: '#0E0F11', label: '#DCE6FF', lamp: '#FFE6B8', shadow: 'rgba(0, 0, 0, 0.4)',
  },
} as const;

/** How strongly the table lamp lights the board, by scheme. */
const LAMP_STRENGTH = { light: 0.35, dark: 0.12 } as const;

/** Unknown: the same model in neutral grays, so it reads as "no data" and never as a calm crossing. */
const NO_DATA = {
  light: {
    ...SCENERY.light, grass: '#CDCFD2', grassDark: '#C2C4C7', grassLight: '#D6D8DB', sideRight: '#A9ACB0', sideLeft: '#BABDC1',
    detour: '#9FA3A9', road: '#6B6F75', dash: '#E3E4E6', ballast: '#A3A6AA', ballastDark: '#979A9E', ballastLight: '#B0B3B7',
    tie: '#8A8D92', rail: '#7E8288', post: '#5B5F66', label: '#3F444B',
  },
  dark: {
    ...SCENERY.dark, grass: '#3A3D42', grassDark: '#34373B', grassLight: '#404348', sideRight: '#2C2F33', sideLeft: '#33363A',
    detour: '#55595F', road: '#26292D', dash: '#4A4D52', ballast: '#4A4D52', ballastDark: '#43464A', ballastLight: '#54575C',
    tie: '#3A3D42', rail: '#6B6F75', post: '#1A1C1F', label: '#D5D8DC',
  },
} as const;

type Scenery = Record<keyof (typeof SCENERY)['light'], string>;

/** Rolling stock: freight oxide, brown and gray, never a status color. */
const CARS = [
  { top: '#B65335', side: '#7A2F1C', end: '#93391F', door: '#6A2918' },
  { top: '#8A6650', side: '#5A4030', end: '#6B4A38', door: '#4E372A' },
  { top: '#9DA2A8', side: '#646970', end: '#7C8187', door: '#575C62' },
] as const;
const LOCO = { top: '#5C6880', side: '#2F3846', end: '#3D4757', stripe: '#E8DFC8', window: '#141B24', lamp: '#FFE9A8' };
const TRUCK = '#1E1F22';
const LAMP_LIT = '#FF4D3D';
const LAMP_DARK = '#4A1A16';

const W = 358;
const H = 214;
/** Kept short enough that the status card's freshness line stays on screen on a small phone. */
const MAX_HEIGHT = 168;

/** Car spacing along the track, in board units (the board is 1 x 1). */
const PITCH = 0.39;
/** One loop moves the train three cars, so the color sequence repeats seamlessly. */
const LOOP = PITCH * 3;
/** Slow enough to read as a train rolling through, not a busy animation. */
const LOOP_MS = 9600;
/** A crossing signal's lamps alternate about once a second (each lit for about half a second). */
const FLASH_MS = 1100;
/** Frame step while the train rolls (about 20 frames a second), and while only the lamps flash. */
const ROLL_STEP_MS = 50;
const FLASH_STEP_MS = FLASH_MS / 2;

/** A point on the board in view units: u runs to the lower right, v to the lower left, h is height. */
function pt(u: number, v: number, h = 0): [number, number] {
  return [179 + (u - v) * 170, 10 + (u + v) * 98 - h];
}
const pts = (...points: [number, number][]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

const LABEL: Record<CrossingState, string> = {
  clear: 'Model of Center St crossing: no train, gates up.',
  approaching: 'Model of Center St crossing: a train is coming down the track, the lights are flashing and the gates are down.',
  blocked: 'Model of Center St crossing: a moving train is on the crossing, the lights are flashing and the gates are down. The West St underpass is open.',
  stopped: 'Model of Center St crossing: a stopped train is on the crossing and the gates are down. The West St underpass is open.',
  unknown: 'Model of Center St crossing, in gray: no current sensor data.',
};

/**
 * Center St as a lit tabletop model (Model Crossing style): road, ballasted track, the West St
 * underpass in the action blue, crossbuck signals and gates. A train near the crossing lowers the
 * gates and flashes the lights; a blocked crossing shows freight cars rolling slowly through, a
 * stopped one shows them standing still, and an approaching one shows the locomotive coming. With
 * reduced motion nothing moves and the lamps stay lit. The status card under it still says the
 * state in words. Unknown is gray, with no train, lit lamps or gate arms, so it never implies a state.
 *
 * The board fills the plate's width and bleeds off its top and bottom, at most 168 dp tall.
 */
export function CrossingModel({ state }: { state: CrossingState }) {
  const scheme = useScheme();
  const appStyle = useStyle();
  const reduceMotion = useReducedMotion();
  const c: Scenery = state === 'unknown' ? NO_DATA[scheme] : SCENERY[scheme];
  const [width, setWidth] = useState(0);
  const onCrossing = state === 'blocked' || state === 'stopped';
  const trainNear = onCrossing || state === 'approaching';
  const known = state !== 'unknown';

  // Motion runs on a plain clock, only while Status is on screen and something moves. It drives
  // ordinary props, so it behaves the same on Android, iOS and web.
  const focused = useIsFocused();
  const rolling = state === 'blocked' && !reduceMotion;
  const flashing = trainNear && !reduceMotion;
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!focused || !(rolling || flashing)) return;
    const start = Date.now();
    const id = setInterval(() => setClock(Date.now() - start), rolling ? ROLL_STEP_MS : FLASH_STEP_MS);
    return () => clearInterval(id);
  }, [focused, rolling, flashing]);
  const offset = rolling ? ((clock % LOOP_MS) / LOOP_MS) * LOOP : 0;
  // Which lamp of each pair is lit: 0 or 1 while flashing, null for both (reduced motion).
  const lampTurn = flashing ? Math.floor(clock / FLASH_STEP_MS) % 2 : null;

  const plate = (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ borderRadius: appStyle.radius.card, backgroundColor: c.table, overflow: 'hidden' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABEL[state]}>
      {width > 0 ? (
        <Svg width={width} height={Math.min((width * H) / W, MAX_HEIGHT)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          <Defs>
            <Pattern id="mc-grass" width={9} height={9} patternUnits="userSpaceOnUse">
              <Rect width={9} height={9} fill={c.grass} />
              <Circle cx={2} cy={2.5} r={0.9} fill={c.grassDark} />
              <Circle cx={6.5} cy={6} r={0.8} fill={c.grassLight} />
              <Circle cx={6} cy={1.2} r={0.6} fill={c.grassDark} />
              <Circle cx={2.5} cy={7.4} r={0.6} fill={c.grassLight} />
            </Pattern>
            <Pattern id="mc-gravel" width={5} height={5} patternUnits="userSpaceOnUse">
              <Rect width={5} height={5} fill={c.ballast} />
              <Circle cx={1} cy={1.2} r={0.7} fill={c.ballastLight} />
              <Circle cx={3.6} cy={3.2} r={0.8} fill={c.ballastDark} />
              <Circle cx={4} cy={0.6} r={0.45} fill={c.ballastLight} />
              <Circle cx={1.6} cy={4.1} r={0.5} fill={c.ballastDark} />
            </Pattern>
            {/* The lamp over the table, upper left. */}
            <RadialGradient id="mc-lamp" cx="30%" cy="10%" r="75%">
              <Stop offset="0" stopColor={c.lamp} stopOpacity={LAMP_STRENGTH[scheme]} />
              <Stop offset="1" stopColor={c.lamp} stopOpacity={0} />
            </RadialGradient>
            {/* Shadows stay on the board; rolling stock stays on the track, so cars run off its ends. */}
            <ClipPath id="mc-board">
              <Polygon points="179,10 349,108 179,206 9,108" />
            </ClipPath>
            <ClipPath id="mc-track">
              <Polygon points={TRACK_BOX} />
            </ClipPath>
          </Defs>

          {/* The board's shadow on the table, then the board and its two visible edges. */}
          <Polygon points="189,22 357,120 357,128 189,226 19,128 19,120" fill={c.shadow} />
          <Polygon points="179,10 349,108 179,206 9,108" fill="url(#mc-grass)" />
          <Polygon points="179,206 349,108 349,116 179,214" fill={c.sideRight} />
          <Polygon points="179,206 9,108 9,116 179,214" fill={c.sideLeft} />

          {/* West St, passing under the track; Center St and its center line. */}
          <Polygon points={pts(pt(0, 0.06), pt(1, 0.06), pt(1, 0.18), pt(0, 0.18))} fill={c.detour} />
          <Polygon points={pts(pt(0, 0.42), pt(1, 0.42), pt(1, 0.58), pt(0, 0.58))} fill={c.road} />
          <Line x1={94} y1={59} x2={264} y2={157} stroke={c.dash} strokeWidth={1.5} strokeDasharray="6 6" />

          {/* Ballast, ties and rails. */}
          <Polygon points={pts(pt(0.45, 0), pt(0.55, 0), pt(0.55, 1), pt(0.45, 1))} fill="url(#mc-gravel)" />
          {TIES.map(([a, b]) => (
            <Line key={a[1]} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c.tie} strokeWidth={1.6} />
          ))}
          <Line x1={260.6} y1={57} x2={90.6} y2={155} stroke={c.rail} strokeWidth={1.8} />
          <Line x1={267.4} y1={61} x2={97.4} y2={159} stroke={c.rail} strokeWidth={1.8} />

          {/* Lamplight over the board. */}
          <Polygon points="179,10 349,108 179,206 9,108" fill="url(#mc-lamp)" />

          {/* The far signal and gate stand behind the train; the near ones in front of it. */}
          <Signal x={176} y={79} c={c} lit={trainNear && known} turn={lampTurn} />
          {known ? <Gate x={176} y={79} down={trainNear} /> : null}

          <G clipPath="url(#mc-board)">
            {onCrossing ? CONSIST.map((k) => <Polygon key={k} points={CAR.shadow} fill={CAST} transform={carShift(k, offset)} />) : null}
            {state === 'approaching' ? <Polygon points={ENGINE.shadow} fill={CAST} /> : null}
          </G>
          <G clipPath="url(#mc-track)">
            {onCrossing ? CONSIST.map((k) => <Car key={k} k={k} offset={offset} />) : null}
            {state === 'approaching' ? <Locomotive /> : null}
          </G>

          <Signal x={244} y={118} c={c} lit={trainNear && known} turn={lampTurn === null ? null : 1 - lampTurn} />
          {known ? <Gate x={244} y={118} down={trainNear} /> : null}

          {/* Label on a table-colored pill, at the corner where West St enters the board. */}
          <Rect x={30} y={30} width={118} height={17} rx={8.5} fill={c.table} opacity={0.92} />
          <SvgText x={36} y={42} fontSize={12} fontWeight="700" fontFamily={appStyle.faces[700].fontFamily} fill={c.label}>
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

/** Ties across the track bed. */
const TIES = Array.from({ length: 25 }, (_, i) => {
  const v = 0.02 + i * 0.04;
  return [pt(0.455, v), pt(0.545, v)] as const;
});
/** Car slots in the consist. Six cover the board through a whole loop. */
const CONSIST = [-4, -3, -2, -1, 0, 1];

/** Moves a car from the crossing to its slot along the track. */
function carShift(k: number, offset: number) {
  const dv = k * PITCH + offset;
  return `translate(${(-170 * dv).toFixed(1)} ${(98 * dv).toFixed(1)})`;
}

/** One freight car, placed by its slot and the train's offset. */
function Car({ k, offset }: { k: number; offset: number }) {
  return (
    <G transform={carShift(k, offset)}>
      <Boxcar colors={CARS[((k % 3) + 3) % 3]} />
    </G>
  );
}

// Rolling stock geometry, in board units along and across the track and view units of height.
const U0 = 0.5;
const HALF_W = 0.042;
const UL = U0 - HALF_W;
const UR = U0 + HALF_W;
const FLOOR = 5;
const CAST = 'rgba(0, 0, 0, 0.22)';

/** The shadow a box of this length and height casts on the board, toward the lower right. */
function castShadow(v0: number, v1: number, height: number) {
  const s = [0.55 * height, 0.22 * height];
  const base = [pt(UL, v0), pt(UR, v0), pt(UR, v1), pt(UL, v1)];
  return pts(...hull([...base, ...base.map(([x, y]) => [x + s[0], y + s[1]] as [number, number])]));
}

/** Convex hull (monotone chain) of a few points. */
function hull(points: [number, number][]) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** A box's two visible sides and top: the long side faces the lower right, the end the lower left. */
function boxFaces(v0: number, v1: number, h0: number, h1: number) {
  return {
    end: pts(pt(UL, v1, h0), pt(UR, v1, h0), pt(UR, v1, h1), pt(UL, v1, h1)),
    side: pts(pt(UR, v0, h0), pt(UR, v1, h0), pt(UR, v1, h1), pt(UR, v0, h1)),
    top: pts(pt(UL, v0, h1), pt(UR, v0, h1), pt(UR, v1, h1), pt(UL, v1, h1)),
  };
}

/** A truck under a car: the visible face of its frame, with two wheels. */
function truck(v0: number, v1: number) {
  return { frame: pts(pt(UR, v0), pt(UR, v1), pt(UR, v1, FLOOR + 1), pt(UR, v0, FLOOR + 1)), wheels: [pt(UR, v0 + 0.015, 2.4), pt(UR, v1 - 0.015, 2.4)] };
}

/** The track bed as a box tall enough for rolling stock, seen from the viewer: the train's clip. */
const TRACK_BOX = pts(...hull([0.44, 0.56].flatMap((u) => [0, 1].flatMap((v) => [0, 36].map((h) => pt(u, v, h))))));

// Boxcar, centered on the crossing.
const CAR_V0 = 0.32;
const CAR_V1 = 0.68;
const CAR_ROOF = 31;
const CAR = {
  shadow: castShadow(CAR_V0, CAR_V1, CAR_ROOF),
  trucks: [truck(CAR_V0 + 0.02, CAR_V0 + 0.1), truck(CAR_V1 - 0.1, CAR_V1 - 0.02)],
  coupler: pts(pt(U0 - 0.012, CAR_V1, FLOOR + 3), pt(U0 + 0.012, CAR_V1, FLOOR + 3), pt(U0 + 0.012, CAR_V1 + 0.025, FLOOR + 3), pt(U0 - 0.012, CAR_V1 + 0.025, FLOOR + 3)),
  body: boxFaces(CAR_V0, CAR_V1, FLOOR, CAR_ROOF),
  door: pts(pt(UR, 0.45, FLOOR + 3), pt(UR, 0.55, FLOOR + 3), pt(UR, 0.55, CAR_ROOF - 3), pt(UR, 0.45, CAR_ROOF - 3)),
  seam: [pt(UR, 0.5, FLOOR + 3), pt(UR, 0.5, CAR_ROOF - 3)],
  ribs: [-0.14, -0.1, 0.1, 0.14].map((dv) => [pt(UR, 0.5 + dv, FLOOR + 1), pt(UR, 0.5 + dv, CAR_ROOF - 1)]),
  walk: [pt(U0, CAR_V0 + 0.01, CAR_ROOF), pt(U0, CAR_V1 - 0.01, CAR_ROOF)],
};

/** A boxcar on two trucks: sliding door, ribs, roof walk and couplers. */
function Boxcar({ colors }: { colors: (typeof CARS)[number] }) {
  return (
    <>
      {CAR.trucks.map((t) => (
        <G key={t.frame}>
          <Polygon points={t.frame} fill={TRUCK} />
          {t.wheels.map(([x, y]) => (
            <Circle key={x} cx={x} cy={y} r={2.4} fill={TRUCK} stroke="#3A3C40" strokeWidth={0.6} />
          ))}
        </G>
      ))}
      <Polygon points={CAR.coupler} fill={TRUCK} />
      <Polygon points={CAR.body.end} fill={colors.end} />
      <Polygon points={CAR.body.side} fill={colors.side} />
      <Polygon points={CAR.body.top} fill={colors.top} />
      <Polygon points={CAR.door} fill={colors.door} />
      <Line x1={CAR.seam[0][0]} y1={CAR.seam[0][1]} x2={CAR.seam[1][0]} y2={CAR.seam[1][1]} stroke="rgba(255,255,255,0.25)" strokeWidth={0.8} />
      {CAR.ribs.map(([a, b]) => (
        <Line key={a[0]} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(0,0,0,0.28)" strokeWidth={0.8} />
      ))}
      <Line x1={CAR.walk[0][0]} y1={CAR.walk[0][1]} x2={CAR.walk[1][0]} y2={CAR.walk[1][1]} stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} />
    </>
  );
}

// Locomotive, on the far stretch of track with its nose toward the crossing and the viewer.
const LOCO_V0 = 0.03;
const LOCO_V1 = 0.33;
const HOOD = 25;
const CAB = 33;
const CAB_V0 = LOCO_V1 - 0.07;
const ENGINE = {
  shadow: castShadow(LOCO_V0, LOCO_V1, CAB),
  trucks: [truck(LOCO_V0 + 0.02, LOCO_V0 + 0.09), truck(LOCO_V1 - 0.09, LOCO_V1 - 0.02)],
  hood: boxFaces(LOCO_V0, CAB_V0, FLOOR, HOOD),
  cab: boxFaces(CAB_V0, LOCO_V1, FLOOR, CAB),
  windshield: pts(pt(UL + 0.008, LOCO_V1, CAB - 9), pt(UR - 0.008, LOCO_V1, CAB - 9), pt(UR - 0.008, LOCO_V1, CAB - 3), pt(UL + 0.008, LOCO_V1, CAB - 3)),
  sideWindow: pts(pt(UR, CAB_V0 + 0.012, CAB - 9), pt(UR, LOCO_V1 - 0.012, CAB - 9), pt(UR, LOCO_V1 - 0.012, CAB - 3), pt(UR, CAB_V0 + 0.012, CAB - 3)),
  stripe: pts(pt(UR, LOCO_V0, 12), pt(UR, LOCO_V1, 12), pt(UR, LOCO_V1, 15), pt(UR, LOCO_V0, 15)),
  headlight: pt(U0, LOCO_V1, 15),
};

/** A road locomotive: long hood, cab at the front with windows, a side stripe and a lit headlight. */
function Locomotive() {
  const [hx, hy] = ENGINE.headlight;
  return (
    <>
      {ENGINE.trucks.map((t) => (
        <G key={t.frame}>
          <Polygon points={t.frame} fill={TRUCK} />
          {t.wheels.map(([x, y]) => (
            <Circle key={x} cx={x} cy={y} r={2.4} fill={TRUCK} stroke="#3A3C40" strokeWidth={0.6} />
          ))}
        </G>
      ))}
      <Polygon points={ENGINE.hood.side} fill={LOCO.side} />
      <Polygon points={ENGINE.hood.top} fill={LOCO.top} />
      <Polygon points={ENGINE.cab.side} fill={LOCO.side} />
      <Polygon points={ENGINE.cab.top} fill={LOCO.top} />
      <Polygon points={ENGINE.cab.end} fill={LOCO.end} />
      <Polygon points={ENGINE.stripe} fill={LOCO.stripe} />
      <Polygon points={ENGINE.windshield} fill={LOCO.window} />
      <Polygon points={ENGINE.sideWindow} fill={LOCO.window} />
      <Circle cx={hx} cy={hy} r={7} fill={LOCO.lamp} opacity={0.35} />
      <Circle cx={hx} cy={hy} r={2.6} fill={LOCO.lamp} />
    </>
  );
}

/**
 * A crossbuck mast with two red lamps. While a train is near they take turns (`turn` says which is
 * lit), or both stay lit when motion is reduced (`turn` is null).
 */
function Signal({ x, y, c, lit, turn }: { x: number; y: number; c: Scenery; lit: boolean; turn: number | null }) {
  const top = y - 42;
  const lampY = y - 28;
  const lamps = [x - 6, x + 6].map((cx, i) => ({ cx, on: lit && (turn === null || turn === i) }));
  return (
    <>
      {/* Mast and its shadow. */}
      <Line x1={x} y1={y} x2={x + 26} y2={y + 10} stroke={c.shadow} strokeWidth={2} strokeLinecap="round" />
      <Line x1={x} y1={y} x2={x} y2={top} stroke="#5B5F66" strokeWidth={2} />
      {/* Crossbuck: white boards with a dark edge. */}
      <Line x1={x - 11} y1={top - 6} x2={x + 11} y2={top + 6} stroke="#1F2124" strokeWidth={4.6} strokeLinecap="round" />
      <Line x1={x - 11} y1={top + 6} x2={x + 11} y2={top - 6} stroke="#1F2124" strokeWidth={4.6} strokeLinecap="round" />
      <Line x1={x - 11} y1={top - 6} x2={x + 11} y2={top + 6} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Line x1={x - 11} y1={top + 6} x2={x + 11} y2={top - 6} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      {/* Lamp backboard and lamps, with a glow when lit. */}
      <Rect x={x - 12} y={lampY - 5} width={24} height={10} rx={5} fill="#1F2124" />
      {lamps.map((l) => (
        <G key={l.cx}>
          {l.on ? <Circle cx={l.cx} cy={lampY} r={6.5} fill={LAMP_LIT} opacity={0.35} /> : null}
          <Circle cx={l.cx} cy={lampY} r={3.4} fill={l.on ? LAMP_LIT : LAMP_DARK} />
        </G>
      ))}
      <Circle cx={x} cy={y} r={4} fill={c.post} />
    </>
  );
}

/** A gate arm in red and white: across the road when down, straight up when raised. */
function Gate({ x, y, down }: { x: number; y: number; down: boolean }) {
  const x2 = down ? x - 34 : x + 3;
  const y2 = down ? y + 19.6 : y - 40;
  return (
    <>
      <Line x1={x} y1={y} x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
      <Line x1={x} y1={y} x2={x2} y2={y2} stroke="#C62828" strokeWidth={4} strokeDasharray="5 5" />
    </>
  );
}
