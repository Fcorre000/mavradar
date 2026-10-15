import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A drag past this distance (dp), or a flick faster than this (dp per ms), closes the sheet. */
const CLOSE_DISTANCE = 100;
const CLOSE_VELOCITY = 0.7;

/**
 * A modal bottom sheet. Tapping outside, Android's back, or dragging the top (handle and header)
 * down closes it; a short drag springs back. Only the top drags, so the body can scroll freely.
 * Built on React Native's own Modal and PanResponder so it behaves the same on every platform.
 */
export function ModalSheet({
  visible,
  onClose,
  header,
  children,
  closeLabel = 'Close',
  style,
}: {
  visible: boolean;
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
  /** Screen reader label for the backdrop, which closes the sheet. */
  closeLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [offset] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (visible) offset.setValue(0);
  }, [visible, offset]);

  const drag = useMemo(() => {
    const springBack = () => Animated.timing(offset, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY ? onClose() : springBack()),
      onPanResponderTerminate: springBack,
    });
  }, [offset, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={closeLabel} />
        <Animated.View
          style={[styles.sheet, { backgroundColor: theme.sheet, paddingBottom: insets.bottom + 20, transform: [{ translateY: offset }] }, style]}
          accessibilityViewIsModal>
          <View style={styles.top} {...drag.panHandlers}>
            <View style={[styles.handle, { backgroundColor: theme.sheetHandle }]} />
            {header}
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, paddingHorizontal: 24, gap: 12 },
  // The drag area: the handle plus the header, comfortably taller than a 48 dp touch target.
  top: { paddingTop: 10, gap: 12 },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, marginBottom: 4 },
});
