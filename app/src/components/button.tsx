import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { T } from '@/components/text';
import { Radius, Size } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'filled' | 'tonal' | 'outline' | 'text' | 'brand';

type Props = {
  label: string;
  sublabel?: string;
  icon?: (color: string) => ReactNode;
  variant?: Variant;
  color?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Centered label, for single-line actions like "Turn on alerts". */
  center?: boolean;
};

/** 56 dp buttons (48 for text and outline). Filled uses the brand primary. */
export function Button({ label, sublabel, icon, variant = 'filled', color, onPress, accessibilityLabel, style, center }: Props) {
  const theme = useTheme();

  const bg =
    color ??
    (variant === 'brand'
      ? '#2563EB'
      : variant === 'filled'
        ? theme.primary
        : variant === 'tonal'
          ? theme.tonal
          : 'transparent');

  const fg = color
    ? '#FFFFFF'
    : variant === 'brand'
        ? '#FFFFFF'
        : variant === 'filled'
          ? theme.onPrimary
          : theme.text;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, minHeight: variant === 'text' || variant === 'outline' ? Size.touchTarget : Size.button },
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
          <T v="buttonSub" color={color ? '#FFFFFF' : variant === 'filled' || variant === 'brand' ? fg : theme.textSecondary}>
            {sublabel}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.button },
  center: { justifyContent: 'center' },
  labels: { flexShrink: 1 },
  labelsCenter: { alignItems: 'center' },
  pressed: { opacity: 0.85 },
});
