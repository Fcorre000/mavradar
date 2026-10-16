/**
 * App styles: Settings > Appearance > Style. A color theme only swaps colors; a style also sets the
 * typeface, type scale, corner shapes, spacing, control sizes, list grouping and tab bar treatment,
 * and can bring its own palette and one signature move.
 *
 * The crossing status system is not part of a style. Status colors (`StatusCard`, `StatusStrong`),
 * the state shapes and the state words are the same in every style, because they carry meaning.
 *
 * Signal is the approved design (docs/design, DESIGN.md) and the default. Its values are the tokens
 * in theme.ts, so changing Signal still starts in tokens.json. Clarity, Civic and Model Crossing
 * were approved on the design canvas (page "Styles"). `__tests__/styles.test.ts` checks every style,
 * and `theme.test.ts` checks the contrast of every style that brings its own palette.
 */

import {
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { IBMPlexSans_300Light } from '@expo-google-fonts/ibm-plex-sans/300Light';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { Overpass_400Regular } from '@expo-google-fonts/overpass/400Regular';
import { Overpass_600SemiBold } from '@expo-google-fonts/overpass/600SemiBold';
import { Overpass_700Bold } from '@expo-google-fonts/overpass/700Bold';
import { Overpass_800ExtraBold } from '@expo-google-fonts/overpass/800ExtraBold';
import type { FontSource } from 'expo-font';
import type { TextStyle } from 'react-native';

import { BrandFont, Layout, Radius, Size, TypeScale, type Palette } from './theme';

export type FontWeightToken = 300 | 400 | 500 | 600 | 700 | 800;
export type TextVariant = keyof typeof TypeScale;

export type TypeToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeightToken;
  /** Largest system text scale this text follows. A Text prop, not a style. */
  maxFontSizeMultiplier?: number;
  letterSpacing?: number;
};

/**
 * How to draw one weight. A loaded family has one file per weight, so it sets only `fontFamily`
 * (adding `fontWeight` would make Android synthesize bold on a bold file). The system font has no
 * family and sets only `fontWeight`.
 */
export type FontFace = Pick<TextStyle, 'fontFamily' | 'fontWeight'>;

/** Physical depth for a raised style: a soft shadow under plates, and a base edge under buttons. */
export type Depth = {
  /** `boxShadow` for cards and row groups resting on the page. */
  plate: string;
  /** The darker edge under a filled button. */
  primaryBase: string;
  /** The darker edge under tonal buttons and round keys. */
  tonalBase: string;
  /** `boxShadow` cast upward by the pinned footer when content scrolls under it. */
  lift: string;
};

export interface AppStyle {
  name: string;
  /** One line under the name in Settings. */
  description: string;
  /** Font files loaded before the style applies, by family name. Empty for the system font. */
  fonts: Record<string, FontSource>;
  faces: Record<FontWeightToken, FontFace>;
  type: Record<TextVariant, TypeToken>;
  /** Null: the color theme the person picks (Settings > Appearance). Otherwise this style's own colors. */
  palettes: { light: Palette; dark: Palette } | null;
  radius: {
    card: number;
    button: number;
    /** Top corners of bottom sheets. */
    sheet: number;
    chip: number;
    segmented: number;
    snackbar: number;
    /** Banners, the Status tip, and the boxed notes in Settings. */
    panel: number;
    /** The example notification in the alerts priming sheet. */
    notification: number;
    /** A group of inset rows. Unused when `rows` is 'flat'. */
    group: number;
    timeline: number;
    /** Round controls: capped at half their height, so 999 means fully round. */
    pill: number;
  };
  space: {
    /** Side padding of every screen. */
    screen: number;
    card: number;
    /** Between blocks on a screen. */
    section: number;
  };
  size: {
    /** Filled and tonal buttons. */
    button: number;
    /** Outline and text buttons. Never under 48. */
    buttonCompact: number;
    row: number;
    /** Rows with a description line, and list rows. */
    rowTall: number;
    header: number;
  };
  /** Blocked and Stopped status cards hold this height; calm states always size to content. */
  statusCardMinHeight: number;
  /** 'flat': rows sit on the page between hairlines. 'inset': rows sit in a rounded group on a surface. */
  rows: 'flat' | 'inset';
  /** 'large': the Status header puts its actions on their own row above a large title. */
  header: 'standard' | 'large';
  /** How a chosen chip or segment shows: a filled background, or a rule in the primary color under it. */
  selection: 'fill' | 'underline';
  /** Where a button's icon sits. */
  buttonIcon: 'leading' | 'trailing';
  /** Raised plates and buttons, by scheme. Null: flat. */
  depth: { light: Depth; dark: Depth } | null;
  /** Status shows a model of the crossing above the status card. */
  crossingModel: boolean;
  /** Map camera pitch in degrees. 0 looks straight down. */
  mapPitch: number;
  /** How the pinned Directions footer separates from content scrolling under it. 'shadow' needs `depth`. */
  footerEdge: 'none' | 'hairline' | 'shadow';
  /** The face draws its middle dot against the next word, so text pads it with a thin space. */
  padMiddleDot: boolean;
  tabs: {
    /** Palette color behind the tab bar. */
    surface: keyof Palette;
    /** A pill behind the selected tab (Android and web). */
    indicator: boolean;
    /** Color of the selected tab: the text color, or the primary color like an iOS tint. */
    tint: 'text' | 'primary';
    /** A hairline above the tab bar (web; the native bars draw their own). */
    rule: boolean;
  };
}

const atkinson = (weight: FontWeightToken): FontFace => ({
  fontFamily: weight >= 700 ? BrandFont.bold : weight >= 600 ? BrandFont.semibold : weight >= 500 ? BrandFont.medium : BrandFont.regular,
});

const systemFace = (weight: FontWeightToken): FontFace => ({ fontWeight: String(weight) as TextStyle['fontWeight'] });

const PLEX = { light: 'IBMPlexSans_300Light', regular: 'IBMPlexSans_400Regular', medium: 'IBMPlexSans_500Medium', semibold: 'IBMPlexSans_600SemiBold' } as const;
// Carbon's ladder stops at semibold, so bold and heavier use it too.
const plex = (weight: FontWeightToken): FontFace => ({
  fontFamily: weight >= 600 ? PLEX.semibold : weight >= 500 ? PLEX.medium : weight >= 400 ? PLEX.regular : PLEX.light,
});

const OVERPASS = { regular: 'Overpass_400Regular', semibold: 'Overpass_600SemiBold', bold: 'Overpass_700Bold', extrabold: 'Overpass_800ExtraBold' } as const;
const overpass = (weight: FontWeightToken): FontFace => ({
  fontFamily: weight >= 800 ? OVERPASS.extrabold : weight >= 700 ? OVERPASS.bold : weight >= 500 ? OVERPASS.semibold : OVERPASS.regular,
});

const faces = (face: (w: FontWeightToken) => FontFace) =>
  ({ 300: face(300), 400: face(400), 500: face(500), 600: face(600), 700: face(700), 800: face(800) }) as Record<FontWeightToken, FontFace>;

export const Styles = {
  signal: {
    name: 'Signal',
    description: 'The original MavRadar look. Calm by default, with five color themes.',
    fonts: {
      [BrandFont.regular]: AtkinsonHyperlegibleNext_400Regular,
      [BrandFont.medium]: AtkinsonHyperlegibleNext_500Medium,
      [BrandFont.semibold]: AtkinsonHyperlegibleNext_600SemiBold,
      [BrandFont.bold]: AtkinsonHyperlegibleNext_700Bold,
    },
    faces: faces(atkinson),
    type: TypeScale,
    palettes: null,
    radius: {
      card: Radius.card,
      button: Radius.button,
      sheet: Radius.sheet,
      chip: Radius.chip,
      segmented: Radius.segmented,
      snackbar: Radius.snackbar,
      panel: Radius.button,
      notification: Radius.notification,
      group: Radius.card,
      timeline: Radius.timelineBar,
      pill: Radius.full,
    },
    space: { screen: Layout.screenPadding, card: Layout.cardPadding, section: Layout.sectionGap },
    size: { button: Size.button, buttonCompact: Size.touchTarget, row: Size.row, rowTall: Size.listRow, header: Size.header },
    statusCardMinHeight: Size.statusCardMinHeight,
    rows: 'flat',
    header: 'standard',
    selection: 'fill',
    buttonIcon: 'leading',
    depth: null,
    crossingModel: false,
    mapPitch: 0,
    footerEdge: 'none',
    padMiddleDot: false,
    tabs: { surface: 'backgroundElement', indicator: true, tint: 'text', rule: false },
  },

  /** From Apple's design language: system font, grouped inset lists, large titles, pill buttons. */
  clarity: {
    name: 'Clarity',
    description: 'Clean and familiar, with grouped lists and large titles.',
    fonts: {},
    faces: faces(systemFace),
    type: {
      stateWord: { fontSize: 52, lineHeight: 56, fontWeight: 700, letterSpacing: -0.8, maxFontSizeMultiplier: 1.1 },
      duration: { fontSize: 30, lineHeight: 36, fontWeight: 600, letterSpacing: -0.5, maxFontSizeMultiplier: 1.25 },
      stateLine: { fontSize: 20, lineHeight: 25, fontWeight: 600, letterSpacing: -0.3, maxFontSizeMultiplier: 1.5 },
      crossingName: { fontSize: 34, lineHeight: 41, fontWeight: 700, letterSpacing: -0.4, maxFontSizeMultiplier: 1.3 },
      sheetName: { fontSize: 22, lineHeight: 28, fontWeight: 700, letterSpacing: -0.3 },
      body: { fontSize: 17, lineHeight: 22, fontWeight: 400, letterSpacing: -0.4 },
      secondary: { fontSize: 15, lineHeight: 20, fontWeight: 400, letterSpacing: -0.2 },
      kicker: { fontSize: 13, lineHeight: 18, fontWeight: 600, letterSpacing: -0.1 },
      disclaimer: { fontSize: 13, lineHeight: 18, fontWeight: 400, letterSpacing: -0.1 },
      button: { fontSize: 17, lineHeight: 22, fontWeight: 600, letterSpacing: -0.4, maxFontSizeMultiplier: 1.5 },
      buttonSub: { fontSize: 13, lineHeight: 18, fontWeight: 400, maxFontSizeMultiplier: 1.5 },
      navLabel: { fontSize: 11, lineHeight: 13, fontWeight: 500, maxFontSizeMultiplier: 1.3 },
      axis: { fontSize: 11, lineHeight: 13, fontWeight: 400, maxFontSizeMultiplier: 1.3 },
    },
    // Sheets use the page color, so grouped rows read the same on a page and in a sheet.
    palettes: {
      light: {
        text: '#1D1D1F', textSecondary: '#6E6E73', background: '#F2F2F7', backgroundElement: '#FFFFFF', backgroundSelected: '#E3E3E8',
        divider: '#D8D8DC', outline: '#C7C7CC', tonal: '#E5E5EA', track: '#E5E5EA', sheet: '#F2F2F7', sheetHandle: '#C7C7CC',
        primary: '#0066CC', onPrimary: '#FFFFFF', link: '#0066CC', sensorOk: '#007A6E',
        snackbarBackground: '#1D1D1F', snackbarText: '#F5F5F7', snackbarAction: '#2997FF',
      },
      dark: {
        text: '#F5F5F7', textSecondary: '#98989F', background: '#000000', backgroundElement: '#1C1C1E', backgroundSelected: '#3A3A3C',
        divider: '#38383A', outline: '#48484A', tonal: '#2C2C2E', track: '#39393D', sheet: '#000000', sheetHandle: '#545458',
        primary: '#0071E3', onPrimary: '#FFFFFF', link: '#2997FF', sensorOk: '#7FD9CC',
        snackbarBackground: '#F5F5F7', snackbarText: '#1D1D1F', snackbarAction: '#0066CC',
      },
    },
    radius: { card: 22, button: 999, sheet: 26, chip: 999, segmented: 9, snackbar: 14, panel: 14, notification: 22, group: 12, timeline: 6, pill: 999 },
    space: { screen: 16, card: 20, section: 20 },
    size: { button: 50, buttonCompact: 48, row: 48, rowTall: 60, header: 52 },
    statusCardMinHeight: Size.statusCardMinHeight,
    rows: 'inset',
    header: 'large',
    selection: 'fill',
    buttonIcon: 'leading',
    depth: null,
    crossingModel: false,
    mapPitch: 0,
    footerEdge: 'hairline',
    padMiddleDot: false,
    tabs: { surface: 'backgroundElement', indicator: false, tint: 'primary', rule: true },
  },

  /** From IBM's Carbon: IBM Plex Sans, square corners, a blue rule under what is selected. */
  civic: {
    name: 'Civic',
    description: 'Square and structured, set in a plain civic typeface.',
    fonts: {
      [PLEX.light]: IBMPlexSans_300Light,
      [PLEX.regular]: IBMPlexSans_400Regular,
      [PLEX.medium]: IBMPlexSans_500Medium,
      [PLEX.semibold]: IBMPlexSans_600SemiBold,
    },
    faces: faces(plex),
    type: {
      // The state word stays semibold: a light weight reads poorly at a glance in glare.
      stateWord: { fontSize: 48, lineHeight: 56, fontWeight: 600, maxFontSizeMultiplier: 1.1 },
      duration: { fontSize: 28, lineHeight: 36, fontWeight: 400, maxFontSizeMultiplier: 1.25 },
      stateLine: { fontSize: 20, lineHeight: 28, fontWeight: 400, maxFontSizeMultiplier: 1.5 },
      crossingName: { fontSize: 32, lineHeight: 40, fontWeight: 300, maxFontSizeMultiplier: 1.3 },
      sheetName: { fontSize: 24, lineHeight: 32, fontWeight: 400 },
      body: { fontSize: 16, lineHeight: 24, fontWeight: 400, letterSpacing: 0.16 },
      secondary: { fontSize: 14, lineHeight: 20, fontWeight: 400, letterSpacing: 0.16 },
      kicker: { fontSize: 12, lineHeight: 16, fontWeight: 400, letterSpacing: 0.32 },
      disclaimer: { fontSize: 12, lineHeight: 16, fontWeight: 400, letterSpacing: 0.32 },
      button: { fontSize: 16, lineHeight: 22, fontWeight: 400, letterSpacing: 0.16, maxFontSizeMultiplier: 1.5 },
      buttonSub: { fontSize: 12, lineHeight: 16, fontWeight: 400, letterSpacing: 0.32, maxFontSizeMultiplier: 1.5 },
      navLabel: { fontSize: 12, lineHeight: 16, fontWeight: 400, maxFontSizeMultiplier: 1.3 },
      axis: { fontSize: 12, lineHeight: 16, fontWeight: 400, letterSpacing: 0.32, maxFontSizeMultiplier: 1.3 },
    },
    palettes: {
      light: {
        text: '#161616', textSecondary: '#525252', background: '#FFFFFF', backgroundElement: '#F4F4F4', backgroundSelected: '#E0E0E0',
        divider: '#E0E0E0', outline: '#8D8D8D', tonal: '#E0E0E0', track: '#E0E0E0', sheet: '#FFFFFF', sheetHandle: '#8D8D8D',
        primary: '#0F62FE', onPrimary: '#FFFFFF', link: '#0F62FE', sensorOk: '#007A6E',
        snackbarBackground: '#393939', snackbarText: '#F4F4F4', snackbarAction: '#78A9FF',
      },
      dark: {
        text: '#F4F4F4', textSecondary: '#C6C6C6', background: '#161616', backgroundElement: '#262626', backgroundSelected: '#393939',
        divider: '#393939', outline: '#6F6F6F', tonal: '#393939', track: '#393939', sheet: '#262626', sheetHandle: '#6F6F6F',
        primary: '#0F62FE', onPrimary: '#FFFFFF', link: '#78A9FF', sensorOk: '#7FD9CC',
        snackbarBackground: '#F4F4F4', snackbarText: '#161616', snackbarAction: '#0F62FE',
      },
    },
    radius: { card: 0, button: 0, sheet: 0, chip: 0, segmented: 0, snackbar: 0, panel: 0, notification: 0, group: 0, timeline: 0, pill: 0 },
    space: { screen: 16, card: 16, section: 16 },
    size: { button: 48, buttonCompact: 48, row: 48, rowTall: 64, header: 64 },
    statusCardMinHeight: Size.statusCardMinHeight,
    rows: 'flat',
    header: 'standard',
    selection: 'underline',
    buttonIcon: 'trailing',
    depth: null,
    crossingModel: false,
    mapPitch: 0,
    footerEdge: 'hairline',
    padMiddleDot: false,
    tabs: { surface: 'background', indicator: false, tint: 'text', rule: true },
  },

  /** Center St as a lit tabletop model: the crossing model on Status, raised blocks, a pitched map. */
  model: {
    name: 'Model Crossing',
    description: 'A small model of the crossing shows the train and the gates.',
    fonts: {
      [OVERPASS.regular]: Overpass_400Regular,
      [OVERPASS.semibold]: Overpass_600SemiBold,
      [OVERPASS.bold]: Overpass_700Bold,
      [OVERPASS.extrabold]: Overpass_800ExtraBold,
    },
    faces: faces(overpass),
    type: {
      stateWord: { fontSize: 48, lineHeight: 52, fontWeight: 800, letterSpacing: -0.3, maxFontSizeMultiplier: 1.1 },
      duration: { fontSize: 26, lineHeight: 32, fontWeight: 700, maxFontSizeMultiplier: 1.25 },
      stateLine: { fontSize: 20, lineHeight: 26, fontWeight: 700, maxFontSizeMultiplier: 1.5 },
      crossingName: { fontSize: 26, lineHeight: 32, fontWeight: 800, maxFontSizeMultiplier: 1.5 },
      sheetName: { fontSize: 22, lineHeight: 28, fontWeight: 800 },
      body: { fontSize: 16, lineHeight: 24, fontWeight: 400 },
      secondary: { fontSize: 14, lineHeight: 20, fontWeight: 400 },
      kicker: { fontSize: 14, lineHeight: 18, fontWeight: 600 },
      disclaimer: { fontSize: 13, lineHeight: 18, fontWeight: 400 },
      button: { fontSize: 17, lineHeight: 22, fontWeight: 700, maxFontSizeMultiplier: 1.5 },
      buttonSub: { fontSize: 13, lineHeight: 18, fontWeight: 400, maxFontSizeMultiplier: 1.5 },
      navLabel: { fontSize: 12, lineHeight: 16, fontWeight: 600, maxFontSizeMultiplier: 1.3 },
      axis: { fontSize: 11, lineHeight: 14, fontWeight: 400, maxFontSizeMultiplier: 1.3 },
    },
    palettes: {
      light: {
        text: '#1F2124', textSecondary: '#55585E', background: '#F7F6F2', backgroundElement: '#FFFFFF', backgroundSelected: '#DDE5F7',
        divider: '#DDD9D0', outline: '#C9C6BE', tonal: '#E9E5DC', track: '#E2DED5', sheet: '#FFFFFF', sheetHandle: '#C9C6BE',
        primary: '#2F5FCC', onPrimary: '#FFFFFF', link: '#2F5FCC', sensorOk: '#007A6E',
        snackbarBackground: '#1F2124', snackbarText: '#F7F6F2', snackbarAction: '#A9C0F2',
      },
      dark: {
        text: '#F2F0EA', textSecondary: '#B4B6BA', background: '#15171A', backgroundElement: '#202327', backgroundSelected: '#2A3550',
        divider: '#2E3236', outline: '#45494F', tonal: '#2A2D32', track: '#2E3236', sheet: '#202327', sheetHandle: '#55595F',
        primary: '#8FB0F5', onPrimary: '#15171A', link: '#8FB0F5', sensorOk: '#7FD9CC',
        snackbarBackground: '#F2F0EA', snackbarText: '#1F2124', snackbarAction: '#2F5FCC',
      },
    },
    radius: { card: 18, button: 16, sheet: 24, chip: 12, segmented: 14, snackbar: 12, panel: 14, notification: 18, group: 18, timeline: 6, pill: 999 },
    space: { screen: 16, card: 20, section: 14 },
    size: { button: 56, buttonCompact: 48, row: 48, rowTall: 68, header: 64 },
    // The model already carries the alarm, so Blocked and Stopped size to content too.
    statusCardMinHeight: 0,
    rows: 'inset',
    header: 'standard',
    selection: 'fill',
    buttonIcon: 'leading',
    depth: {
      light: { plate: '0px 6px 16px rgba(40, 36, 28, 0.12)', primaryBase: '#1E3F8C', tonalBase: '#CFCABF', lift: '0px -6px 16px rgba(40, 36, 28, 0.10)' },
      dark: { plate: '0px 6px 16px rgba(0, 0, 0, 0.45)', primaryBase: '#4A68A8', tonalBase: '#0E0F11', lift: '0px -6px 16px rgba(0, 0, 0, 0.40)' },
    },
    crossingModel: true,
    mapPitch: 38,
    footerEdge: 'shadow',
    padMiddleDot: true,
    tabs: { surface: 'backgroundElement', indicator: true, tint: 'text', rule: false },
  },
} as const satisfies Record<string, AppStyle>;

export type StyleId = keyof typeof Styles;
export const DefaultStyle: StyleId = 'signal';

/** Order in Settings > Appearance. */
export const StyleOrder: StyleId[] = ['signal', 'clarity', 'civic', 'model'];

export function styleFor(id: StyleId): AppStyle {
  return Styles[id] ?? Styles[DefaultStyle];
}

/** Corner radius for a round control of this height: fully round at most. */
export function pillRadius(style: AppStyle, height: number): number {
  return Math.min(style.radius.pill, height / 2);
}

/** Text style for a type token in this style, with the face for its weight. */
export function textStyle(style: AppStyle, variant: TextVariant): TextStyle {
  const { fontWeight, maxFontSizeMultiplier: _max, ...size } = style.type[variant];
  return { ...size, ...style.faces[fontWeight] };
}

/** Shadow for a plate resting on the page, or nothing in a flat style. */
export function plateShadow(style: AppStyle, scheme: 'light' | 'dark') {
  return style.depth ? { boxShadow: style.depth[scheme].plate } : null;
}

/** The base edge under a raised button, or nothing in a flat style. */
export function raised(style: AppStyle, scheme: 'light' | 'dark', kind: 'primary' | 'tonal') {
  if (!style.depth) return null;
  return { borderBottomWidth: 4, borderBottomColor: kind === 'primary' ? style.depth[scheme].primaryBase : style.depth[scheme].tonalBase };
}
