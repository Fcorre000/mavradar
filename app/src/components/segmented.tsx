import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { T } from '@/components/text';
import { useStyle, useTheme } from '@/hooks/use-theme';

type Option<V extends string | number> = { value: V; label: string; disabled?: boolean };

/** Connected segmented buttons, 40 dp tall. The selected segment shows a check. */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
  style,
}: {
  options: Option<V>[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const appStyle = useStyle();
  return (
    <View style={[styles.group, { borderColor: theme.outline, backgroundColor: theme.sheet, borderRadius: appStyle.radius.segmented }, style]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: o.disabled }}
            // 40 dp to look like Material segmented buttons, 48 dp to tap.
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.item, i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.outline }, on && { backgroundColor: theme.backgroundSelected }]}>
            {on ? <CheckIcon color={theme.text} /> : null}
            <T v="secondary" weight={on ? 700 : 500} color={o.disabled ? theme.textSecondary : theme.text} style={o.disabled ? styles.struck : null}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', minHeight: 40, borderWidth: 1, overflow: 'hidden' },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40 },
  struck: { textDecorationLine: 'line-through' },
});
