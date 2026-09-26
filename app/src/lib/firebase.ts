import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Values come from the Firebase console (a Web app registered in the mavradar project).
// They are not secrets, but they live in app/.env and EAS env vars rather than source so
// GitHub secret scanning doesn't flag the API key. See app/.env.example.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  projectId: 'mavradar-4a74a',
  authDomain: 'mavradar-4a74a.firebaseapp.com',
};

const isFirstInit = getApps().length === 0;

export const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

// AsyncStorage persistence keeps the anonymous user across restarts, so a device keeps
// its uid and can keep updating its own devices/{token} doc. initializeAuth throws if
// called twice, which fast refresh would otherwise do.
export const auth = isFirstInit
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(app);

export const db = getFirestore(app);
