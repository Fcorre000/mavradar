import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { T } from '@/components/text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A modal bottom sheet with a title. Tapping outside or back closes it. */
export function SheetModal({ visible, title, onClose, children, doneLabel }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; doneLabel?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 20 }]} accessibilityViewIsModal>
          <View style={[styles.handle, { backgroundColor: theme.sheetHandle }]} />
          <T v="crossingName" accessibilityRole="header">
            {title}
          </T>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
          {doneLabel ? <Button label={doneLabel} variant="outline" center onPress={onClose} /> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Radio options inside a SheetModal. Picking one closes the sheet. */
export function ChoiceSheet<V extends string | number>({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: V; label: string; sub?: string }[];
  value: V;
  onPick: (v: V) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <SheetModal visible={visible} title={title} onClose={onClose}>
      <View accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => {
                onPick(o.value);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.choice, { borderBottomColor: theme.divider }]}>
              <View style={[styles.radio, { borderColor: on ? theme.primary : theme.textSecondary }]}>{on ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}</View>
              <View style={styles.choiceText}>
                <T>{o.label}</T>
                {o.sub ? (
                  <T v="secondary" color={theme.textSecondary}>
                    {o.sub}
                  </T>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, paddingHorizontal: 24, paddingTop: 10, gap: 12 },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, marginBottom: 4 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 12, paddingBottom: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  choiceText: { flex: 1, gap: 2, paddingVertical: 8 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
