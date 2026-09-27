import {
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
  useFonts,
} from '@expo-google-fonts/atkinson-hyperlegible-next';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { registerDevice } from '@/lib/push';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // Loaded at runtime so no native rebuild is needed. Move to the expo-font config plugin
  // with the next batch of native changes (the docs recommend it for Android and iOS).
  const [fontsLoaded, fontError] = useFonts({
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_500Medium,
    AtkinsonHyperlegibleNext_600SemiBold,
    AtkinsonHyperlegibleNext_700Bold,
  });

  // Setup-phase smoke test (Amendment 003, section 8). Permission prompting moves into
  // onboarding once the template screens are replaced.
  useEffect(() => {
    registerDevice().catch((e) => console.warn('Device registration failed', e));
  }, []);

  useEffect(() => {
    if (fontError) console.warn('Brand font failed to load, using the system font', fontError);
  }, [fontError]);

  // Keep the native splash up until the font is ready, so text never flashes in the fallback.
  // The splash overlay hides it once it mounts. On a load error, carry on with the system font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
