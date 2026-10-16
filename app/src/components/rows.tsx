import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { CheckIcon, ChevronRightIcon } from '@/components/icons';
import { T } from '@/components/text';
import { plateShadow } from '@/constants/styles';
import { useScheme, useStyle, useTheme } from '@/hooks/use-theme';

/** True inside an inset RowGroup. */
const Inset = createContext(false);

/**
 * Rows that belong together. A flat style (Signal) leaves them on the page between hairlines; an
 * inset style puts them in a rounded group on a surface, with dividers indented to the text.
 */
export function RowGroup({ children }: { children: ReactNode }) {
  const appStyle = useStyle();
  const theme = useTheme();
  const scheme = useScheme();
  if (appStyle.rows === 'flat') return <View>{children}</View>;
  const group = (
    <View style={[styles.group, { backgroundColor: theme.backgroundElement, borderRadius: appStyle.radius.group }]}>
      {/* Pulls the first row's divider out of sight, so only rows between rows show one. */}
      <View style={styles.groupInner}>
        <Inset.Provider value>{children}</Inset.Provider>
      </View>
    </View>
  );
  // The shadow sits on an unclipped wrapper: iOS drops a shadow on a view that clips its content.
  const shadow = plateShadow(appStyle, scheme);
  return shadow ? <View style={[{ borderRadius: appStyle.radius.group }, shadow]}>{group}</View> : group;
}

/** The shared row frame: height from the style, divider above, and the closing divider when flat. */
function useRowFrame(last?: boolean, tall?: boolean) {
  const inset = useContext(Inset);
  const appStyle = useStyle();
  const theme = useTheme();
  return [
    styles.row,
    tall && styles.tall,
    { minHeight: tall ? appStyle.size.rowTall : appStyle.size.row, borderTopColor: theme.divider },
    inset ? styles.inset : last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider },
  ];
}

/** Label left, value right, 48 dp, divider above. */
export function InfoRow({ label, value, valueColor, leading, last }: { label: string; value: string; valueColor?: string; leading?: ReactNode; last?: boolean }) {
  const theme = useTheme();
  const frame = useRowFrame(last);
  return (
    <View
      style={frame}
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
  const frame = useRowFrame(last, !!description);
  return (
    <View style={frame}>
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
  const frame = useRowFrame(false, !!description);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...frame, pressed && { opacity: 0.7 }]}>
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

/** One choice in a single-choice list: label, optional description, and a check when chosen. */
export function RadioRow({ label, description, selected, onPress, last }: { label: string; description?: string; selected: boolean; onPress: () => void; last?: boolean }) {
  const theme = useTheme();
  const frame = useRowFrame(last, !!description);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [...frame, pressed && { opacity: 0.7 }]}>
      <View style={styles.labels}>
        <T weight={selected ? 600 : 400}>{label}</T>
        {description ? (
          <T v="secondary" color={theme.textSecondary}>
            {description}
          </T>
        ) : null}
      </View>
      {selected ? <CheckIcon size={22} color={theme.text} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tall: { paddingVertical: 8 },
  inset: { marginLeft: 16, paddingRight: 16 },
  group: { overflow: 'hidden' },
  groupInner: { marginTop: -StyleSheet.hairlineWidth },
  labels: { flex: 1, gap: 2 },
  value: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  valueText: { textAlign: 'right' },
  navValue: { marginRight: 4 },
});
