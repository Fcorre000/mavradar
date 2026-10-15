import { SymbolView } from 'expo-symbols';
import { Platform, Text } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { SFSymbol } from 'sf-symbols-typescript';

type IconProps = { size?: number; color: string };

const stroke = (color: string, width = 2) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

/** Font key for Material Symbols, loaded in app/_layout.tsx on Android and web. */
export const MATERIAL_SYMBOLS = 'MaterialSymbols_400Regular';

/** One icon from each platform's own set: an SF Symbol on iOS, a Material Symbols codepoint elsewhere. */
type GlyphName = { sf: SFSymbol; md: number };

const GLYPHS = {
  route: { sf: 'arrow.turn.up.right', md: 0xebab }, // turn_right
  check: { sf: 'checkmark', md: 0xe5ca },
  plus: { sf: 'plus', md: 0xe145 }, // add
  chevronDown: { sf: 'chevron.down', md: 0xe5cf }, // expand_more
  chevronRight: { sf: 'chevron.right', md: 0xe5cc },
  close: { sf: 'xmark', md: 0xe5cd },
  clock: { sf: 'clock', md: 0xe8b5 }, // schedule
  share: { sf: 'square.and.arrow.up', md: 0xe80d }, // each platform's own share mark
  info: { sf: 'info.circle', md: 0xe88e },
  bell: { sf: 'bell', md: 0xe7f4 }, // notifications
  bellOff: { sf: 'bell.slash', md: 0xe7f6 }, // notifications_off
  cloudOff: { sf: 'icloud.slash', md: 0xe2c1 },
  mapOff: { sf: 'mappin.slash', md: 0xe0c7 }, // location_off
} as const satisfies Record<string, GlyphName>;

/**
 * Icons are decoration next to labeled controls, so they're hidden from screen readers. The
 * Material glyph ignores the system font size: the icon keeps its box at any text scale.
 */
function Glyph({ name, size, color }: { name: keyof typeof GLYPHS; size: number; color: string }) {
  const g = GLYPHS[name];
  if (Platform.OS === 'ios') return <SymbolView name={g.sf} size={size} tintColor={color} accessibilityElementsHidden importantForAccessibility="no" />;
  return (
    <Text
      allowFontScaling={false}
      accessible={false}
      aria-hidden
      importantForAccessibility="no"
      style={{ fontFamily: MATERIAL_SYMBOLS, fontSize: size, lineHeight: size, width: size, height: size, color, textAlign: 'center' }}>
      {String.fromCodePoint(g.md)}
    </Text>
  );
}

export const RouteIcon = ({ size = 24, color }: IconProps) => <Glyph name="route" size={size} color={color} />;
export const CheckIcon = ({ size = 16, color }: IconProps) => <Glyph name="check" size={size} color={color} />;
export const PlusIcon = ({ size = 18, color }: IconProps) => <Glyph name="plus" size={size} color={color} />;
export const ChevronDownIcon = ({ size = 20, color }: IconProps) => <Glyph name="chevronDown" size={size} color={color} />;
export const ChevronRightIcon = ({ size = 20, color }: IconProps) => <Glyph name="chevronRight" size={size} color={color} />;
export const CloseIcon = ({ size = 20, color }: IconProps) => <Glyph name="close" size={size} color={color} />;
export const ClockIcon = ({ size = 22, color }: IconProps) => <Glyph name="clock" size={size} color={color} />;
export const ShareIcon = ({ size = 22, color }: IconProps) => <Glyph name="share" size={size} color={color} />;
export const InfoIcon = ({ size = 20, color }: IconProps) => <Glyph name="info" size={size} color={color} />;
export const BellIcon = ({ size = 22, color, off }: IconProps & { off?: boolean }) => <Glyph name={off ? 'bellOff' : 'bell'} size={size} color={color} />;
export const CloudOffIcon = ({ size = 22, color }: IconProps) => <Glyph name="cloudOff" size={size} color={color} />;
export const MapOffIcon = ({ size = 22, color }: IconProps) => <Glyph name="mapOff" size={size} color={color} />;

// Drawn by hand, matched to the platform sets' stroke: Material Symbols has no filled star in this
// font, and the rest are map and status graphics, not interface icons.

export function StarIcon({ size = 24, color, filled }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"
        stroke={color}
        strokeWidth={filled ? 1.5 : 1.8}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

/** Teardrop pin for the detour. Never a status shape. */
export function DetourPin({ color }: { color: string }) {
  return (
    <Svg width={28} height={36} viewBox="0 0 28 36">
      <Path d="M14 35C14 35 2 21.5 2 13.5a12 12 0 0 1 24 0C26 21.5 14 35 14 35z" fill={color} stroke="#FFFFFF" strokeWidth={2} />
      <Path d="M9 19v-4a3 3 0 0 1 3-3h7M16.5 9.5L19 12l-2.5 2.5" {...stroke('#FFFFFF')} />
    </Svg>
  );
}

/** Two signal lights on a post. Used for the app mark in headers. */
export function SignalIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="7" cy="9" r="4" {...stroke(color)} />
      <Circle cx="17" cy="9" r="4" {...stroke(color)} />
      <Path d="M12 13v8M8 21h8" {...stroke(color)} />
    </Svg>
  );
}

export function Dot({ size = 10, color, hollow }: IconProps & { hollow?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      {hollow ? <Circle cx="5" cy="5" r="4" stroke={color} strokeWidth={2} fill="none" /> : <Rect x="0" y="0" width="10" height="10" rx="5" fill={color} />}
    </Svg>
  );
}
