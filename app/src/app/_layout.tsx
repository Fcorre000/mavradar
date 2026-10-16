import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols/400Regular';
import { DarkTheme, DefaultTheme, router, ThemeProvider, type Theme } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppTabs from '@/components/app-tabs';
import { MATERIAL_SYMBOLS } from '@/components/icons';
import { PrimingSheet } from '@/components/priming-sheet';
import { ThemeFade } from '@/components/theme-fade';
import { Styles } from '@/constants/styles';
import { useScheme, useTheme } from '@/hooks/use-theme';
import { loadStyleFonts } from '@/lib/style-fonts';
import { startApp } from '@/state/actions';
import { useApp } from '@/state/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useScheme();
  const palette = useTheme();
  const prefsLoaded = useApp((s) => s.prefsLoaded);
  const style = useApp((s) => s.prefs.style);
  // Loaded at runtime so no native rebuild is needed. Move to the expo-font config plugin
  // with the next batch of native changes (the docs recommend it for Android and iOS).
  // Signal's typeface always loads: it is the default style.
  const [fontsLoaded, fontError] = useFonts({
    ...Styles.signal.fonts,
    // Icons on Android and web; iOS draws SF Symbols natively.
    ...(Platform.OS === 'ios' ? {} : { [MATERIAL_SYMBOLS]: MaterialSymbols_400Regular }),
  });
  // A saved style other than Signal brings its own fonts. Later switches load theirs in setStyle.
  const [styleReady, setStyleReady] = useState(false);
  useEffect(() => {
    if (!prefsLoaded) return;
    loadStyleFonts(style)
      .catch((err) => console.warn('Style fonts failed to load, using the system font', err))
      .finally(() => setStyleReady(true));
  }, [prefsLoaded, style]);

  // No permission prompt here: alerts are only requested after the priming sheet, when the
  // person asks for them. Tapping a notification opens Status for that crossing.
  useEffect(() => {
    startApp(() => router.navigate('/'));
  }, []);

  useEffect(() => {
    if (fontError) console.warn('Brand font failed to load, using the system font', fontError);
    if ((fontsLoaded || fontError) && prefsLoaded && styleReady) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, prefsLoaded, styleReady]);

  // Keep the native splash up until the fonts and saved settings are ready, so text never flashes
  // in the fallback font and a chosen theme or style never flashes the default one.
  if ((!fontsLoaded && !fontError) || !prefsLoaded || !styleReady) return null;

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
