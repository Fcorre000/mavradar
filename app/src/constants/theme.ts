/**
 * MavRadar design tokens, mirrored from docs/design/tokens.json (design handoff v2).
 * Change a value there first, then here. Sizes are dp, type sizes are sp.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Neutral UI colors for one theme. Status colors are separate (see `StatusCard`, `StatusStrong`)
 * and never change with the brand scheme, because they carry meaning.
 */
type Palette = {
  text: string;
  textSecondary: string;
  background: string;
  /** Raised or grouped surfaces: nav bar, chips, cards that are not status cards. */
  backgroundElement: string;
  /** Selected state: nav indicator, pressed segment. */
  backgroundSelected: string;
  divider: string;
  outline: string;
  tonal: string;
  track: string;
  sheet: string;
  sheetHandle: string;
  /** Filled buttons and switch tracks. */
  primary: string;
  onPrimary: string;
  link: string;
  sensorOk: string;
  snackbarBackground: string;
  snackbarText: string;
  snackbarAction: string;
};

/**
 * Brand schemes. Transit Navy is the chosen brand (2026-09-27) and the default. The other
 * candidates stay for reference; each keeps AA contrast and avoids hues that could be mistaken
 * for a crossing state (no red, amber, teal-green or purple).
 */
export const BrandSchemes = {
  graphite: {
    name: 'Graphite',
    light: {
      text: '#111418', textSecondary: '#4A5260', background: '#FFFFFF', backgroundElement: '#F6F7F9', backgroundSelected: '#E3E6EB',
      divider: '#E3E6EB', outline: '#C9CED6', tonal: '#EDF0F3', track: '#ECEEF1', sheet: '#FFFFFF', sheetHandle: '#C9CED6',
      primary: '#111418', onPrimary: '#FFFFFF', link: '#111418', sensorOk: '#007A6E',
      snackbarBackground: '#2B3036', snackbarText: '#F2F4F7', snackbarAction: '#7FD9CC',
    },
    dark: {
      text: '#F2F4F7', textSecondary: '#B6BDC8', background: '#121212', backgroundElement: '#1B1E22', backgroundSelected: '#2C3137',
      divider: '#2C3137', outline: '#3A4048', tonal: '#262A30', track: '#2C3137', sheet: '#1B1E22', sheetHandle: '#5A616B',
      primary: '#F2F4F7', onPrimary: '#121212', link: '#F2F4F7', sensorOk: '#7FD9CC',
      snackbarBackground: '#E3E6EB', snackbarText: '#111418', snackbarAction: '#00594F',
    },
  },
  transitNavy: {
    name: 'Transit Navy',
    light: {
      text: '#13213A', textSecondary: '#4B566A', background: '#FBFAF7', backgroundElement: '#F1EFE9', backgroundSelected: '#DCE4F0',
      divider: '#E3E0D8', outline: '#C8C4BA', tonal: '#E8ECF3', track: '#EAE7E0', sheet: '#FFFFFF', sheetHandle: '#C8C4BA',
      primary: '#1B3A66', onPrimary: '#FFFFFF', link: '#1B3A66', sensorOk: '#007A6E',
      snackbarBackground: '#1B2A42', snackbarText: '#EEF2F8', snackbarAction: '#A9C4EC',
    },
    dark: {
      text: '#EEF2F8', textSecondary: '#AEB9CB', background: '#0D1522', backgroundElement: '#152033', backgroundSelected: '#23395C',
      divider: '#22304A', outline: '#33425E', tonal: '#1C2A42', track: '#22304A', sheet: '#152033', sheetHandle: '#4A5A78',
      primary: '#A9C4EC', onPrimary: '#0D1522', link: '#A9C4EC', sensorOk: '#7FD9CC',
      snackbarBackground: '#DCE4F0', snackbarText: '#13213A', snackbarAction: '#1B3A66',
    },
  },
  cobalt: {
    name: 'Cobalt',
    light: {
      text: '#0F1523', textSecondary: '#4A5366', background: '#FFFFFF', backgroundElement: '#F4F6FB', backgroundSelected: '#DDE6FF',
      divider: '#E1E6F0', outline: '#C3CBDA', tonal: '#EAF0FF', track: '#E8ECF4', sheet: '#FFFFFF', sheetHandle: '#C3CBDA',
      primary: '#2350C8', onPrimary: '#FFFFFF', link: '#2350C8', sensorOk: '#007A6E',
      snackbarBackground: '#1A2233', snackbarText: '#F0F3FA', snackbarAction: '#9DB6FF',
    },
    dark: {
      text: '#F0F3FA', textSecondary: '#B2BACB', background: '#0E1117', backgroundElement: '#171C27', backgroundSelected: '#24345E',
      divider: '#262D3C', outline: '#384257', tonal: '#1E2638', track: '#262D3C', sheet: '#171C27', sheetHandle: '#4B5670',
      primary: '#9DB6FF', onPrimary: '#0E1117', link: '#9DB6FF', sensorOk: '#7FD9CC',
      snackbarBackground: '#DDE6FF', snackbarText: '#0F1523', snackbarAction: '#2350C8',
    },
  },
  prairieSlate: {
    name: 'Prairie Slate',
    light: {
      text: '#1C2227', textSecondary: '#525A61', background: '#F7F5F0', backgroundElement: '#EFECE5', backgroundSelected: '#DDE3E7',
      divider: '#E2DED5', outline: '#C6C1B6', tonal: '#E8ECEE', track: '#E7E3DB', sheet: '#FFFDF9', sheetHandle: '#C6C1B6',
      primary: '#3B5163', onPrimary: '#FFFFFF', link: '#3B5163', sensorOk: '#007A6E',
      snackbarBackground: '#27323B', snackbarText: '#EEF0F1', snackbarAction: '#B7C8D6',
    },
    dark: {
      text: '#EEF0F1', textSecondary: '#B3BBC1', background: '#121517', backgroundElement: '#1B2024', backgroundSelected: '#2B3A45',
      divider: '#2A3136', outline: '#3B454C', tonal: '#232A30', track: '#2A3136', sheet: '#1B2024', sheetHandle: '#525E66',
      primary: '#B7C8D6', onPrimary: '#121517', link: '#B7C8D6', sensorOk: '#7FD9CC',
      snackbarBackground: '#DDE3E7', snackbarText: '#1C2227', snackbarAction: '#3B5163',
    },
  },
  railtie: {
    name: 'Railtie',
    light: {
      text: '#231B15', textSecondary: '#5A5048', background: '#FAF7F2', backgroundElement: '#F2EDE5', backgroundSelected: '#E8DDD0',
      divider: '#E6DFD4', outline: '#CBC1B3', tonal: '#F0E8DE', track: '#EAE3D8', sheet: '#FFFDF9', sheetHandle: '#CBC1B3',
      primary: '#4A3528', onPrimary: '#FFFFFF', link: '#4A3528', sensorOk: '#007A6E',
      snackbarBackground: '#33271E', snackbarText: '#F4EEE7', snackbarAction: '#E2CDB5',
    },
    dark: {
      text: '#F4EEE7', textSecondary: '#C0B4A7', background: '#15110E', backgroundElement: '#1F1915', backgroundSelected: '#3A2E24',
      divider: '#30271F', outline: '#45382C', tonal: '#2A221B', track: '#30271F', sheet: '#1F1915', sheetHandle: '#5E4F41',
      primary: '#E2CDB5', onPrimary: '#15110E', link: '#E2CDB5', sensorOk: '#7FD9CC',
      snackbarBackground: '#E8DDD0', snackbarText: '#231B15', snackbarAction: '#4A3528',
    },
  },
} as const satisfies Record<string, { name: string; light: Palette; dark: Palette }>;

export type BrandScheme = keyof typeof BrandSchemes;
export const DefaultBrand: BrandScheme = 'transitNavy';

export const Colors: { light: Palette; dark: Palette } = {
  light: BrandSchemes[DefaultBrand].light,
  dark: BrandSchemes[DefaultBrand].dark,
};

export type ThemeColor = keyof Palette;

export type CrossingState = 'clear' | 'approaching' | 'blocked' | 'stopped' | 'unknown';

type CardColors = { container: string; onContainer: string; icon?: string; iconGlyph?: string; border?: string };

/** Status card colors. Tinted for calm states, solid for Blocked and Stopped. Same for every brand scheme. */
export const StatusCard: Record<'light' | 'dark', Record<CrossingState, CardColors>> = {
  light: {
    clear: { container: '#E0F2EF', onContainer: '#00594F', icon: '#007A6E', iconGlyph: '#FFFFFF' },
    approaching: { container: '#FFE8A3', onContainer: '#5C3A00', icon: '#F2A900', iconGlyph: '#1A1A1A' },
    blocked: { container: '#C62828', onContainer: '#FFFFFF', icon: '#FFFFFF', iconGlyph: '#C62828' },
    stopped: { container: '#8E1B1B', onContainer: '#FFFFFF', icon: '#FFFFFF', iconGlyph: '#8E1B1B' },
    unknown: { container: '#ECEEF1', onContainer: '#3D4450', border: '#6B7280' },
  },
  dark: {
    clear: { container: '#0E2A27', onContainer: '#7FD9CC', icon: '#7FD9CC', iconGlyph: '#0E2A27' },
    approaching: { container: '#3A2C00', onContainer: '#FFD66B', icon: '#F2A900', iconGlyph: '#1A1A1A' },
    blocked: { container: '#8C1D18', onContainer: '#FFFFFF', icon: '#FFFFFF', iconGlyph: '#8C1D18' },
    stopped: { container: '#5E0F0F', onContainer: '#FFFFFF', icon: '#FFFFFF', iconGlyph: '#5E0F0F' },
    unknown: { container: '#22262B', onContainer: '#C9CED6', border: '#8A919C' },
  },
};

/** Map markers, notification icon circles, list and sheet icons. Same in both themes. */
export const StatusStrong: Record<CrossingState, { fill: string; glyph: string }> = {
  clear: { fill: '#007A6E', glyph: '#FFFFFF' },
  approaching: { fill: '#F2A900', glyph: '#1A1A1A' },
  blocked: { fill: '#C62828', glyph: '#FFFFFF' },
  stopped: { fill: '#8E1B1B', glyph: '#FFFFFF' },
  unknown: { fill: '#6B7280', glyph: '#FFFFFF' },
};

export const HistoryColors = {
  light: { moving: '#C62828', stopped: '#8E1B1B', noData: '#6B7280', neutralBar: '#AEB4BD', peakBar: '#111418' },
  dark: { moving: '#EF5350', stopped: '#C0392B', noData: '#8A919C', neutralBar: '#5A616B', peakBar: '#F2F4F7' },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Brand typeface. Not loaded yet: install @expo-google-fonts/atkinson-hyperlegible-next and load it
 * with expo-font before using these names, or iOS logs an unknown-font error.
 */
export const BrandFont = {
  regular: 'AtkinsonHyperlegibleNext_400Regular',
  medium: 'AtkinsonHyperlegibleNext_500Medium',
  semibold: 'AtkinsonHyperlegibleNext_600SemiBold',
  bold: 'AtkinsonHyperlegibleNext_700Bold',
} as const;

type TypeStyle = { fontSize: number; lineHeight: number; fontWeight: 400 | 500 | 600 | 700; maxFontSizeMultiplier?: number; letterSpacing?: number };

/** Type scale. Every time and duration also sets `fontVariant: ['tabular-nums']`. */
export const TypeScale = {
  stateWord: { fontSize: 48, lineHeight: 52, fontWeight: 700, maxFontSizeMultiplier: 1.1 },
  duration: { fontSize: 32, lineHeight: 36, fontWeight: 600, maxFontSizeMultiplier: 1.25 },
  stateLine: { fontSize: 20, lineHeight: 26, fontWeight: 600, maxFontSizeMultiplier: 1.5 },
  crossingName: { fontSize: 22, lineHeight: 28, fontWeight: 600, maxFontSizeMultiplier: 1.5 },
  sheetName: { fontSize: 20, lineHeight: 26, fontWeight: 600 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: 400 },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: 400 },
  kicker: { fontSize: 13, lineHeight: 16, fontWeight: 500, letterSpacing: 0.2 },
  disclaimer: { fontSize: 13, lineHeight: 18, fontWeight: 400 },
  button: { fontSize: 16, lineHeight: 21, fontWeight: 600, maxFontSizeMultiplier: 1.5 },
  buttonSub: { fontSize: 13, lineHeight: 17, fontWeight: 400, maxFontSizeMultiplier: 1.5 },
  navLabel: { fontSize: 12, lineHeight: 16, fontWeight: 500, maxFontSizeMultiplier: 1.3 },
  axis: { fontSize: 11, lineHeight: 14, fontWeight: 400, maxFontSizeMultiplier: 1.3 },
} as const satisfies Record<string, TypeStyle>;

/** Legacy template spacing steps, still used by the starter screens. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Layout = {
  grid: 4,
  screenPadding: 20,
  cardPadding: 20,
  sectionGap: 16,
  topInset: 36,
  actionAboveNav: 12,
} as const;

export const Radius = {
  card: 20,
  button: 16,
  sheet: 28,
  notification: 24,
  widget: 24,
  chip: 8,
  snackbar: 8,
  segmented: 20,
  timelineBar: 4,
  full: 999,
} as const;

export const Size = {
  touchTarget: 48,
  button: 56,
  row: 48,
  listRow: 72,
  header: 64,
  navBar: 80,
  navIndicatorWidth: 64,
  navIndicatorHeight: 32,
  statusCardMinHeight: 288,
  stateIcon: 40,
  sheetIcon: 24,
  listIcon: 32,
  marker: 36,
  markerSelected: 44,
  markerHitArea: 48,
  cluster: 40,
  sheetPeek: 120,
  sheetHalf: 440,
  sheetFull: 775,
  stripeBand: 8,
  timelineBar: 20,
} as const;

export const Motion = {
  stateCrossfadeMs: 200,
  liveDotPulseMs: 2000,
  sheetSnapMs: 250,
} as const;

/** Seconds since the last reading. Past `delayedMaxSeconds` the crossing shows Unknown, never its last state. */
export const Freshness = {
  liveMaxSeconds: 30,
  delayedMaxSeconds: 90,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: Size.navBar }) ?? 0;
export const MaxContentWidth = 800;
