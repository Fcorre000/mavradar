import { Pressable, StyleSheet, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { T } from '@/components/text';
import { BrandSchemes, DefaultBrand, paletteFor, Size, ThemeOrder, type BrandScheme } from '@/constants/theme';
import { useScheme, useTheme } from '@/hooks/use-theme';

/**
 * Color theme swatches. Each one previews its theme in the current mode: the page color with the
 * button color inside. The chosen one gets a ring and a check, so the choice never rests on color alone.
 */
export function ThemePicker({ value, onChange }: { value: BrandScheme; onChange: (v: BrandScheme) => void }) {
  const theme = useTheme();
  const scheme = useScheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Color theme">
        {ThemeOrder.map((id) => {
          const p = paletteFor(id, scheme);
          const on = id === value;
          return (
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={BrandSchemes[id].name}
              style={({ pressed }) => [styles.ring, { borderColor: on ? theme.text : 'transparent' }, pressed && styles.pressed]}>
              <View style={[styles.swatch, { backgroundColor: p.background, borderColor: theme.outline }]}>
                <View style={[styles.dot, { backgroundColor: p.primary }]}>{on ? <CheckIcon color={p.onPrimary} /> : null}</View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <T v="secondary" weight={600}>
        {BrandSchemes[value].name}
        {value === DefaultBrand ? ' (default)' : ''}
      </T>
    </View>
  );
}

const RING = Size.touchTarget + 8;

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, padding: 4 },
  swatch: { flex: 1, borderRadius: RING / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
