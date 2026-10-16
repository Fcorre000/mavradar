import { pillRadius, styleFor, StyleOrder, Styles, textStyle, type FontWeightToken, type StyleId } from '../styles';
import { BrandFont, Layout, Radius, Size, TypeScale } from '../theme';

// Every style must cover the whole app and keep it usable. Contrast for styles with their own
// colors is in theme.test.ts.

const ids = Object.keys(Styles) as StyleId[];
const weights: FontWeightToken[] = [300, 400, 500, 600, 700];

describe.each(ids)('%s', (id) => {
  const style = styleFor(id);

  test('is offered in Settings', () => {
    expect(StyleOrder).toContain(id);
  });

  test('defines every type token, with room for the line', () => {
    expect(Object.keys(style.type).sort()).toEqual(Object.keys(TypeScale).sort());
    for (const t of Object.values(style.type)) expect(t.lineHeight).toBeGreaterThanOrEqual(t.fontSize);
  });

  test('body text is at least 16 and nothing is under 11', () => {
    expect(style.type.body.fontSize).toBeGreaterThanOrEqual(16);
    for (const t of Object.values(style.type)) expect(t.fontSize).toBeGreaterThanOrEqual(11);
  });

  test('has a face for every weight, and loads every family it names', () => {
    for (const w of weights) {
      const face = style.faces[w];
      expect(face.fontFamily || face.fontWeight).toBeTruthy();
      if (face.fontFamily) {
        expect(Object.keys(style.fonts)).toContain(face.fontFamily);
        // A loaded family is one file per weight; a fontWeight on top makes Android fake bold.
        expect(face.fontWeight).toBeUndefined();
      }
    }
  });

  test('keeps touch targets at 48 dp', () => {
    expect(style.size.button).toBeGreaterThanOrEqual(48);
    expect(style.size.buttonCompact).toBeGreaterThanOrEqual(48);
    expect(style.size.row).toBeGreaterThanOrEqual(48);
    expect(style.size.rowTall).toBeGreaterThanOrEqual(style.size.row);
  });

  test('keeps a screen margin', () => {
    expect(style.space.screen).toBeGreaterThanOrEqual(16);
  });
});

test('Signal is the approved design, unchanged', () => {
  const signal = styleFor('signal');
  expect(signal.type).toBe(TypeScale);
  expect(signal.palettes).toBeNull();
  expect(signal.radius).toMatchObject({ card: Radius.card, button: Radius.button, sheet: Radius.sheet, chip: Radius.chip, segmented: Radius.segmented, snackbar: Radius.snackbar });
  expect(signal.space).toEqual({ screen: Layout.screenPadding, card: Layout.cardPadding, section: Layout.sectionGap });
  expect(signal.size).toMatchObject({ button: Size.button, row: Size.row, rowTall: Size.listRow, header: Size.header });
  expect(signal.rows).toBe('flat');
  expect(textStyle(signal, 'stateWord')).toEqual({ fontSize: 48, lineHeight: 52, fontFamily: BrandFont.bold });
});

test('pill radius never exceeds half the height', () => {
  expect(pillRadius(styleFor('signal'), 48)).toBe(24);
  expect(pillRadius({ ...styleFor('signal'), radius: { ...styleFor('signal').radius, pill: 4 } }, 48)).toBe(4);
});

test('an unknown style falls back to Signal', () => {
  expect(styleFor('nope' as StyleId)).toBe(Styles.signal);
});
