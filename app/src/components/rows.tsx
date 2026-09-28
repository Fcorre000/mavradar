import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ChevronRightIcon } from '@/components/icons';
import { T } from '@/components/text';
import { Size } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Label left, value right, 48 dp, divider above. */
export function InfoRow({ label, value, valueColor, leading, last }: { label: string; value: string; valueColor?: string; leading?: ReactNode; last?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.row, { borderTopColor: theme.divider }, last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}>
      <T>{label}</T>
      <View style={styles.value}>
        {leading}
        <T v="secondary" color={valueColor ?? theme.textSecondary} tabular style={styles.valueText}>
          {value}
        </T>
      </View>
    </View>
  );
}

/** A native switch in a 48 dp row. Neutral colors: status colors stay reserved for status. */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
  last,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, description && styles.tall, { borderTopColor: theme.divider }, last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider }]}>
      <View style={styles.labels}>
        <T color={disabled ? theme.textSecondary : theme.text}>{label}</T>
        {description ? (
          <T v="secondary" color={theme.textSecondary}>
            {description}
          </T>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: theme.track, true: theme.primary }}
        thumbColor={value ? theme.onPrimary : theme.background}
        ios_backgroundColor={theme.track}
      />
    </View>
  );
}

/** Tappable settings row with a value and a chevron. */
export function NavRow({ label, description, value, onPress }: { label: string; description?: string; value?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, description && styles.tall, { borderTopColor: theme.divider }, pressed && { opacity: 0.7 }]}>
      <View style={styles.labels}>
        <T>{label}</T>
        {description ? (
          <T v="secondary" color={theme.textSecondary}>
            {description}
          </T>
        ) : null}
      </View>
      {value ? (
        <T weight={600} style={styles.navValue}>
          {value}
        </T>
      ) : null}
      <ChevronRightIcon color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: Size.row,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tall: { minHeight: Size.listRow, paddingVertical: 8 },
  labels: { flex: 1, gap: 2 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  valueText: { textAlign: 'right' },
  navValue: { marginRight: 4 },
});
