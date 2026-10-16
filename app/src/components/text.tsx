import { Children, type ReactNode } from 'react';
import { Text, type TextProps } from 'react-native';

import { textStyle, type FontWeightToken, type TextVariant } from '@/constants/styles';
import { useStyle, useTheme } from '@/hooks/use-theme';

export type { TextVariant };

type Props = TextProps & {
  /** Type token from the current style (constants/styles). */
  v?: TextVariant;
  color?: string;
  /** Tabular numerals for times and durations, so digits don't shift as they change. */
  tabular?: boolean;
  weight?: FontWeightToken;
};

/** App text: the current style's typeface at a type token's size, with its font scale cap. */
export function T({ v = 'body', color, tabular, weight, style, children, ...rest }: Props) {
  const theme = useTheme();
  const appStyle = useStyle();
  return (
    <Text
      maxFontSizeMultiplier={appStyle.type[v].maxFontSizeMultiplier}
      style={[
        textStyle(appStyle, v),
        { color: color ?? theme.text },
        weight ? appStyle.faces[weight] : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        appStyle.textNudge ? { transform: [{ translateY: appStyle.type[v].fontSize * appStyle.textNudge }] } : null,
        style,
      ]}
      {...rest}>
      {appStyle.padMiddleDot ? padMiddleDots(children) : children}
    </Text>
  );
}

/** Widens the space after each ' · ' separator in plain strings (a thin space on top), leaving nested elements alone. */
function padMiddleDots(children: ReactNode): ReactNode {
  return Children.map(children, (child) => (typeof child === 'string' ? child.replaceAll(' · ', ' · \u2009') : child));
}
