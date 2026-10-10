import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { setThemeTransitionRunner } from '@/lib/theme-transition';

const FADE_IN_MS = 160;
// Long enough for every mounted tab to re-render in the new scheme before the cover lifts.
const HOLD_MS = 240;
const FADE_OUT_MS = 280;
const COLOR_MS = 200;

/**
 * Full-screen cover for Settings > Appearance changes (mode and color theme). It fades in over the
 * old background, the colors switch underneath while the cover blends to the new background, then
 * it fades out, so text and backgrounds arrive together instead of the text lagging a beat behind.
 */
export function ThemeFade() {
  const theme = useTheme();
  const opacity = useSharedValue(0);
  const color = useSharedValue(theme.background);

  useEffect(() => {
    color.value = withTiming(theme.background, { duration: COLOR_MS });
  }, [theme.background, color]);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let pending: (() => void) | null = null;
    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    setThemeTransitionRunner((apply) => {
      clear();
      // A change still waiting from a quick earlier tap (say, the theme just before the mode)
      // applies now instead of being dropped.
      pending?.();
      pending = apply;
      opacity.value = withTiming(1, { duration: FADE_IN_MS });
      timers.push(
        setTimeout(() => {
          pending = null;
          apply();
          timers.push(setTimeout(() => (opacity.value = withTiming(0, { duration: FADE_OUT_MS })), HOLD_MS));
        }, FADE_IN_MS),
      );
    });
    return () => {
      setThemeTransitionRunner(null);
      clear();
    };
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, backgroundColor: color.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} />;
}
