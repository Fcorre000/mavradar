import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { StatusCard, StatusStrong, type CrossingState } from '@/constants/theme';
import { useScheme, useTheme } from '@/hooks/use-theme';

const OCTAGON = 'M15.5 3H32.5L45 15.5V32.5L32.5 45H15.5L3 32.5V15.5Z';
const QUESTION = 'M18.5 19a5.5 5.5 0 1 1 7.8 5c-1.5.7-2.3 1.7-2.3 3.4v.8';
const AMBER = '#F2A900';
const INK = '#1A1A1A';

/**
 * One shape per state, so the state reads without color:
 * clear = circle with check, approaching = warning diamond with a train,
 * blocked = rounded square with X, stopped = octagon with pause bars, unknown = dashed circle with ?.
 *
 * - `card`: inside a status card (colors from StatusCard for the current theme).
 * - `plain`: on neutral surfaces (sheet, list, history).
 * - `marker`: map marker with a white ring and a dark outer stroke, so it holds 3:1 on any tile.
 */
export function StateIcon({ state, size, variant }: { state: CrossingState; size: number; variant: 'card' | 'plain' | 'marker' }) {
  const scheme = useScheme();
  const theme = useTheme();
  const card = StatusCard[scheme][state];
  const strong = StatusStrong[state];

  let fill = strong.fill;
  let glyph = strong.glyph;
  if (variant === 'card') {
    fill = card.icon ?? card.onContainer;
    glyph = card.iconGlyph ?? card.container;
  } else if (variant === 'plain' && state === 'clear') {
    fill = scheme === 'dark' ? StatusCard.dark.clear.onContainer : strong.fill;
    glyph = scheme === 'dark' ? StatusCard.dark.clear.container : strong.glyph;
  }
  const unknownInk = variant === 'card' ? card.onContainer : theme.textSecondary;

  const shape = (color: string, sw?: number, strokeColor?: string, dash?: string) => {
    const s = strokeColor ? { stroke: strokeColor, strokeWidth: sw, strokeLinejoin: 'round' as const, strokeDasharray: dash } : {};
    switch (state) {
      case 'approaching':
        return <Path d="M24 2.5L45.5 24L24 45.5L2.5 24Z" fill={color} {...s} />;
      case 'blocked':
        return <Rect x="3.5" y="3.5" width="41" height="41" rx="9.5" fill={color} {...s} />;
      case 'stopped':
        return <Path d={OCTAGON} fill={color} {...s} />;
      default:
        return <Circle cx="24" cy="24" r="21" fill={color} {...s} />;
    }
  };

  const glyphEl = () => {
    switch (state) {
      case 'clear':
        return <Path d="M14.5 24.5l6.5 6.5 12.5-13" stroke={glyph} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
      case 'approaching':
        return (
          <>
            <Rect x="17" y="14" width="14" height="17" rx="3.5" fill={INK} />
            <Rect x="19.5" y="17" width="9" height="5.5" rx="1.2" fill={AMBER} />
            <Circle cx="20.8" cy="26.8" r="1.6" fill={AMBER} />
            <Circle cx="27.2" cy="26.8" r="1.6" fill={AMBER} />
            <Path d="M19.5 31l-2.5 4M28.5 31l2.5 4" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
          </>
        );
      case 'blocked':
        return <Path d="M16 16L32 32M32 16L16 32" stroke={glyph} strokeWidth={5} strokeLinecap="round" />;
      case 'stopped':
        return (
          <>
            <Rect x="16.5" y="15" width="5.5" height="18" rx="1.5" fill={glyph} />
            <Rect x="26" y="15" width="5.5" height="18" rx="1.5" fill={glyph} />
          </>
        );
      default:
        return (
          <>
            <Path d={QUESTION} stroke={glyph} strokeWidth={4} strokeLinecap="round" fill="none" />
            <Circle cx="24" cy="34.5" r="2.4" fill={glyph} />
          </>
        );
    }
  };

  if (variant === 'marker') {
    return (
      <Svg width={size} height={size} viewBox="-2 -2 52 52">
        {shape(fill, 7, 'rgba(0,0,0,0.4)')}
        {shape(fill, 5, '#FFFFFF', state === 'unknown' ? '7 4' : undefined)}
        {state === 'approaching' ? <Path d="M24 5L43 24L24 43L5 24Z" fill={AMBER} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" /> : null}
        {glyphEl()}
      </Svg>
    );
  }

  if (state === 'unknown') {
    glyph = unknownInk;
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx="24" cy="24" r="19.5" fill="none" stroke={unknownInk} strokeWidth={3.5} strokeDasharray="5.5 4" />
        {glyphEl()}
      </Svg>
    );
  }

  if (state === 'approaching') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path d="M24 3.5L44.5 24L24 44.5L3.5 24Z" fill={AMBER} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        {glyphEl()}
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {shape(fill)}
      {glyphEl()}
    </Svg>
  );
}
