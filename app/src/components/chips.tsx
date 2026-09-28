import { Pressable, StyleSheet, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { T } from '@/components/text';
import { Radius, Size } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Single-choice filter chips that wrap onto more lines. 32 dp chips in 48 dp touch targets. */
export function Chips<V extends string | number>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={styles.target}>
            <View
              style={[
                styles.chip,
                { borderColor: on ? theme.backgroundSelected : theme.outline, backgroundColor: on ? theme.backgroundSelected : 'transparent', paddingLeft: on ? 10 : 14 },
              ]}>
              {on ? <CheckIcon color={theme.text} /> : null}
              <T v="secondary" weight={on ? 700 : 500}>
                {o.label}
              </T>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 },
  target: { minHeight: Size.touchTarget, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingRight: 14, paddingVertical: 4, borderRadius: Radius.chip, borderWidth: 1 },
});
