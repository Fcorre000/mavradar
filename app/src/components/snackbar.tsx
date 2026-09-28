import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/text';
import { Colors, Radius } from '@/constants/theme';
import { useScheme } from '@/hooks/use-theme';
import { dismissSnack } from '@/state/actions';
import { useApp } from '@/state/store';

/** Short confirmation at the bottom of the screen, with Undo when the action can be reversed. */
export function Snackbar({ bottom }: { bottom: number }) {
  const snack = useApp((s) => s.ui.snack);
  const palette = Colors[useScheme()];

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(dismissSnack, 4500);
    return () => clearTimeout(t);
  }, [snack]);

  if (!snack) return null;
  return (
    <View
      style={[styles.snack, { bottom, backgroundColor: palette.snackbarBackground }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert">
      <T v="secondary" color={palette.snackbarText} style={styles.text}>
        {snack.text}
      </T>
      {snack.undo ? (
        <Pressable
          onPress={() => {
            snack.undo?.();
            dismissSnack();
          }}
          accessibilityRole="button"
          hitSlop={4}
          style={styles.action}>
          <T v="secondary" weight={700} color={palette.snackbarAction}>
            Undo
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  snack: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 48,
    borderRadius: Radius.snackbar,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: { flex: 1 },
  action: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' },
});
