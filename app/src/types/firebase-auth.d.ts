import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

// firebase/auth ships getReactNativePersistence only in its React Native build, and its
// package exports list the web typings first, so TypeScript never sees it. Metro resolves
// the React Native build at runtime.
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
