import {
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
  useFonts,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { DarkTheme, DefaultTheme, router, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppTabs from '@/components/app-tabs';
import { PrimingSheet } from '@/components/priming-sheet';
import { ThemeFade } from '@/components/theme-fade';
import { Colors } from '@/constants/theme';
import { useScheme } from '@/hooks/use-theme';
import { startApp } from '@/state/actions';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useScheme();
  // Loaded at runtime so no native rebuild is needed. Move to the expo-font config plugin
  // with the next batch of native changes (the docs recommend it for Android and iOS).
  const [fontsLoaded, fontError] = useFonts({
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_500Medium,
    AtkinsonHyperlegibleNext_600SemiBold,
    AtkinsonHyperlegibleNext_700Bold,
  });

  // No permission prompt here: alerts are only requested after the priming sheet, when the
  // person asks for them. Tapping a notification opens Status for that crossing.
  useEffect(() => {
    startApp(() => router.navigate('/'));
  }, []);

  useEffect(() => {
    if (fontError) console.warn('Brand font failed to load, using the system font', fontError);
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Keep the native splash up until the font is ready, so text never flashes in the fallback.
  if (!fontsLoaded && !fontError) return null;

  const palette = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: { ...base.colors, background: palette.background, card: palette.backgroundElement, text: palette.text, primary: palette.primary, border: palette.divider },
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={navTheme}>
        <AppTabs />
        <PrimingSheet />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {/* Web follows the browser's scheme; the app can't switch it, so there is nothing to cover. */}
        {Platform.OS !== 'web' ? <ThemeFade /> : null}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
