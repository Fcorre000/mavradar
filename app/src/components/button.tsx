import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { T } from '@/components/text';
import { useStyle, useTheme } from '@/hooks/use-theme';

type Variant = 'filled' | 'tonal' | 'outline' | 'text';

type Props = {
  label: string;
  sublabel?: string;
  icon?: (color: string) => ReactNode;
  variant?: Variant;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Centered label, for single-line actions like "Turn on alerts". */
  center?: boolean;
};

/** Filled and tonal buttons at the style's button height (56 in Signal); text and outline at 48. Filled uses the primary color. */
export function Button({ label, sublabel, icon, variant = 'filled', onPress, accessibilityLabel, style, center }: Props) {
  const theme = useTheme();
  const appStyle = useStyle();
  const bg = variant === 'filled' ? theme.primary : variant === 'tonal' ? theme.tonal : 'transparent';
  const fg = variant === 'filled' ? theme.onPrimary : theme.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderRadius: appStyle.radius.button, minHeight: variant === 'text' || variant === 'outline' ? appStyle.size.buttonCompact : appStyle.size.button },
        variant === 'outline' && { borderWidth: 1, borderColor: theme.outline },
        (center || !sublabel) && styles.center,
        pressed && styles.pressed,
        style,
      ]}>
      {icon ? icon(fg) : null}
      <View style={[styles.labels, center && styles.labelsCenter]}>
        <T v="button" color={fg}>
          {label}
        </T>
        {sublabel ? (
          <T v="buttonSub" color={variant === 'filled' ? fg : theme.textSecondary}>
            {sublabel}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 18 },
  center: { justifyContent: 'center' },
  labels: { flexShrink: 1 },
  labelsCenter: { alignItems: 'center' },
  pressed: { opacity: 0.85 },
});
