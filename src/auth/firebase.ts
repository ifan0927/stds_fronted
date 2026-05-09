import { initializeApp, getApps } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from 'firebase/auth';

type FirebaseAuthConfig =
  | {
      ok: true;
      auth: Auth;
    }
  | {
      ok: false;
      missingKeys: string[];
    };

let cachedAuth: Auth | null = null;
let emulatorConnected = false;

const firebaseEnvKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export function getFirebaseAuth(): FirebaseAuthConfig {
  if (cachedAuth) {
    return { ok: true, auth: cachedAuth };
  }

  const missingKeys = firebaseEnvKeys.filter((key) => !import.meta.env[key]);

  if (missingKeys.length > 0) {
    return { ok: false, missingKeys };
  }

  const app = getApps()[0] ?? initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });

  cachedAuth = getAuth(app);

  if (import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true' && !emulatorConnected) {
    const emulatorUrl = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL ?? 'http://127.0.0.1:9099';
    connectAuthEmulator(cachedAuth, emulatorUrl, { disableWarnings: true });
    emulatorConnected = true;
  }

  return { ok: true, auth: cachedAuth };
}
