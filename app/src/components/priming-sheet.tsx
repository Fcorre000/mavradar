import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ModalSheet } from '@/components/modal-sheet';
import { StateIcon } from '@/components/state-icon';
import { T } from '@/components/text';
import { Radius } from '@/constants/theme';
import { crossingById } from '@/domain/crossings';
import { useTheme } from '@/hooks/use-theme';
import { confirmPriming, dismissPriming } from '@/state/actions';
import { useApp } from '@/state/store';

/**
 * Explains alerts before the system prompt. Android treats two denials as permanent and iOS asks
 * about Time Sensitive once, so the prompt only comes after someone taps "Turn on alerts".
 */
export function PrimingSheet() {
  const request = useApp((s) => s.ui.priming);
  const theme = useTheme();
  const name = request ? crossingById(request.crossingId).name : '';

  return (
    <ModalSheet
      visible={!!request}
      onClose={dismissPriming}
      closeLabel="Not now"
      style={styles.sheet}
      header={
        <T v="crossingName" accessibilityRole="header">
          Get alerts for {name}?
        </T>
      }>
      <T>We&apos;ll notify you when a train blocks the crossing and when it clears. No marketing, and you can change this anytime.</T>

      <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]} accessible accessibilityLabel={`Example notification: ${name} is blocked.`}>
        <View style={styles.previewTop}>
          <StateIcon state="blocked" size={16} variant="plain" />
          <T v="kicker" color={theme.textSecondary}>
            MavRadar · now
          </T>
        </View>
        <T weight={700}>{name} is blocked</T>
        <T v="secondary">Train on the crossing since 2:41 PM. Detour: West St underpass.</T>
      </View>

      <View style={styles.actions}>
        <Button label="Turn on alerts" onPress={confirmPriming} center />
        <Button label="Not now" variant="text" onPress={dismissPriming} center />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 16 },
  preview: { borderRadius: Radius.notification, padding: 16, gap: 4 },
  previewTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { gap: 4, paddingTop: 4 },
});
