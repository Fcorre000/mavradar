import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { T } from '@/components/text';
import { raised } from '@/constants/styles';
import { useScheme, useStyle, useTheme } from '@/hooks/use-theme';

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

/**
 * Filled and tonal buttons at the style's button height (56 in Signal); text and outline at 48. Filled
 * uses the primary color. A raised style gives filled and tonal buttons a base edge that the press
 * pushes down; Civic puts the icon at the trailing end.
 */
export function Button({ label, sublabel, icon, variant = 'filled', onPress, accessibilityLabel, style, center }: Props) {
  const theme = useTheme();
  const appStyle = useStyle();
  const scheme = useScheme();
  const base = variant === 'filled' || variant === 'tonal' ? raised(appStyle, scheme, variant === 'filled' ? 'primary' : 'tonal') : null;
  const trailing = appStyle.buttonIcon === 'trailing';
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
        base,
        (center || !sublabel) && styles.center,
        pressed && (base ? styles.pushed : styles.pressed),
        style,
      ]}>
      {icon && !trailing ? icon(fg) : null}
      <View style={[styles.labels, trailing && !center && styles.labelsFill, center && styles.labelsCenter]}>
        <T v="button" color={fg}>
          {label}
        </T>
        {sublabel ? (
          <T v="buttonSub" color={variant === 'filled' ? fg : theme.textSecondary}>
            {sublabel}
          </T>
        ) : null}
      </View>
      {icon && trailing ? icon(fg) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 18 },
  center: { justifyContent: 'center' },
  labels: { flexShrink: 1 },
  labelsCenter: { alignItems: 'center' },
  pressed: { opacity: 0.85 },
  // A raised button sinks onto its base when pressed.
  pushed: { borderBottomWidth: 1, transform: [{ translateY: 3 }] },
  labelsFill: { flex: 1 },
});
