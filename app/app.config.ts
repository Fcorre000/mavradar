import type { ExpoConfig } from 'expo/config';

// Every change in here is native config and costs an EAS build. Batch changes.
// Package and bundle ID are permanent once on the stores (Amendment 003, 3.1).
const APP_ID = 'io.github.fcorre000.mavradar';

const config: ExpoConfig = {
  name: 'MavRadar',
  slug: 'mavradar',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'mavradar',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_ID,
    icon: './assets/expo.icon',
    entitlements: {
      // Only ever spent on real train events. iOS asks the user once.
      'com.apple.developer.usernotifications.time-sensitive': true,
    },
  },
  android: {
    package: APP_ID,
    // EAS injects the file path from the GOOGLE_SERVICES_JSON secret. Locally, the
    // gitignored app/google-services.json is used.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-image',
    'expo-web-browser',
    [
      'expo-notifications',
      {
        color: '#208AEF',
        // FCM messages that arrive without a channel_id land here, never on train-alerts.
        defaultChannel: 'service-status',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'f2eced5f-66f1-453d-bbe7-7e5adc3943a1',
    },
  },
  owner: 'fcorre000s-team',
};

export default config;
