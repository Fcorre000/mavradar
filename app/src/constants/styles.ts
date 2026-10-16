/**
 * App styles: Settings > Appearance > Style. A color theme only swaps colors; a style also sets the
 * typeface, type scale, corner shapes, spacing, control sizes, list grouping and tab bar treatment.
 *
 * The crossing status system is not part of a style. Status colors (`StatusCard`, `StatusStrong`),
 * the state shapes and the state words are the same in every style, because they carry meaning.
 *
 * Signal is the approved design (docs/design, DESIGN.md) and the default. Its values are the tokens
 * in theme.ts, so changing Signal still starts in tokens.json. `__tests__/styles.test.ts` checks
 * every style, and `theme.test.ts` checks the contrast of any style that brings its own palette.
 */

import {
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import type { FontSource } from 'expo-font';
import type { TextStyle } from 'react-native';

import { BrandFont, Layout, Radius, Size, TypeScale, type Palette } from './theme';

export type FontWeightToken = 300 | 400 | 500 | 600 | 700;
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
  /** 'flat': rows sit on the page between hairlines. 'inset': rows sit in a rounded group on a surface. */
  rows: 'flat' | 'inset';
  tabs: {
    /** Palette color behind the tab bar. */
    surface: keyof Palette;
    /** A pill behind the selected tab (Android and web). */
    indicator: boolean;
  };
}

const atkinson = (weight: FontWeightToken): FontFace => ({
  fontFamily: weight >= 700 ? BrandFont.bold : weight >= 600 ? BrandFont.semibold : weight >= 500 ? BrandFont.medium : BrandFont.regular,
});

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
    faces: { 300: atkinson(300), 400: atkinson(400), 500: atkinson(500), 600: atkinson(600), 700: atkinson(700) },
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
    rows: 'flat',
    tabs: { surface: 'backgroundElement', indicator: true },
  },
} as const satisfies Record<string, AppStyle>;

export type StyleId = keyof typeof Styles;
export const DefaultStyle: StyleId = 'signal';

/** Order in Settings > Appearance. The Style choice only shows once there is more than one. */
export const StyleOrder: StyleId[] = ['signal'];

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
