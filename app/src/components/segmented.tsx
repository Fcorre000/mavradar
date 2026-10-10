import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { T } from '@/components/text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  return (
    <View style={[styles.group, { borderColor: theme.outline, backgroundColor: '#E5E7EB' }, style]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: o.disabled }}
            style={[styles.item, i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.outline }, { backgroundColor: on ? '#93C5FD' : '#2563EB' }]}>
            {on ? <CheckIcon color="#172554" /> : null}
            <T v="secondary" weight={on ? 700 : 500} color={on ? '#172554' : '#FFFFFF'} style={o.disabled ? styles.struck : null}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', minHeight: 40, borderRadius: Radius.segmented, borderWidth: 1, overflow: 'hidden' },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40 },
  struck: { textDecorationLine: 'line-through' },
});
