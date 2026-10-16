import { styleFor, Styles, type StyleId } from '../styles';
import { BrandSchemes, type BrandScheme } from '../theme';

// Every color theme, and every style that brings its own colors, must stay readable and must never
// look like a crossing state.

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue in degrees and chroma (0 to 1) of a hex color. */
function hueChroma(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) return { hue: 0, chroma };
  const h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return { hue: (h * 60 + 360) % 360, chroma };
}

/** Hues the status colors own: red and amber (Blocked, Stopped, Approaching), teal-green (Clear), purple. */
function looksLikeStatus(hex: string) {
  const { hue, chroma } = hueChroma(hex);
  if (chroma < 0.2) return false; // near-neutral tints are fine, like warm paper or beige
  return hue < 65 || hue >= 330 || (hue >= 150 && hue < 195) || (hue >= 260 && hue < 330);
}

const TEXT = 4.5; // WCAG AA, body text
const UI = 3; // WCAG AA, UI parts such as switch tracks and filled buttons

const modes = ['light', 'dark'] as const;
const cases = [
  ...(Object.keys(BrandSchemes) as BrandScheme[]).flatMap((brand) => modes.map((mode) => [`${BrandSchemes[brand].name} ${mode}`, BrandSchemes[brand][mode]] as const)),
  ...(Object.keys(Styles) as StyleId[]).flatMap((id) => {
    const { palettes } = styleFor(id);
    return palettes ? modes.map((mode) => [`${Styles[id].name} style ${mode}`, palettes[mode]] as const) : [];
  }),
];

describe.each(cases)('%s', (_name, p) => {
  test.each([
    ['text on background', p.text, p.background, TEXT],
    ['text on raised surface', p.text, p.backgroundElement, TEXT],
    ['text on selected', p.text, p.backgroundSelected, TEXT],
    ['text on sheet', p.text, p.sheet, TEXT],
    ['text on tonal button', p.text, p.tonal, TEXT],
    ['secondary text on background', p.textSecondary, p.background, TEXT],
    ['secondary text on raised surface', p.textSecondary, p.backgroundElement, TEXT],
    ['secondary text on sheet', p.textSecondary, p.sheet, TEXT],
    ['filled button label', p.onPrimary, p.primary, TEXT],
    ['link on background', p.link, p.background, TEXT],
    ['link on sheet', p.link, p.sheet, TEXT],
    ['sensor OK on background', p.sensorOk, p.background, TEXT],
    ['sensor OK on sheet', p.sensorOk, p.sheet, TEXT],
    ['snackbar text', p.snackbarText, p.snackbarBackground, TEXT],
    ['snackbar action', p.snackbarAction, p.snackbarBackground, TEXT],
    ['filled button and switch on background', p.primary, p.background, UI],
    ['filled button and switch on sheet', p.primary, p.sheet, UI],
  ])('%s', (_pair, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  test('no brand color takes a status hue', () => {
    const brand = { background: p.background, backgroundElement: p.backgroundElement, backgroundSelected: p.backgroundSelected, sheet: p.sheet, tonal: p.tonal, primary: p.primary, link: p.link };
    expect(Object.entries(brand).filter(([, hex]) => looksLikeStatus(hex))).toEqual([]);
  });
});

test('orange surfaces fail the status-hue check', () => {
  expect(looksLikeStatus('#FFB366')).toBe(true);
  expect(looksLikeStatus('#F58025')).toBe(true);
  expect(looksLikeStatus('#FBFAF7')).toBe(false);
});
