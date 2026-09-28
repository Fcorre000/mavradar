import { Text, type TextProps } from 'react-native';

import { brandFont, brandText, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof TypeScale;

type Props = TextProps & {
  /** Type scale token from constants/theme. */
  v?: TextVariant;
  color?: string;
  /** Tabular numerals for times and durations, so digits don't shift as they change. */
  tabular?: boolean;
  weight?: 400 | 500 | 600 | 700;
};

/** Brand text: Atkinson Hyperlegible Next at a type scale size, with its font scale cap. */
export function T({ v = 'body', color, tabular, weight, style, ...rest }: Props) {
  const theme = useTheme();
  const base = brandText(v);
  return (
    <Text
      maxFontSizeMultiplier={(TypeScale[v] as { maxFontSizeMultiplier?: number }).maxFontSizeMultiplier}
      style={[
        base,
        { color: color ?? theme.text },
        weight ? brandFont(weight) : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    />
  );
}

