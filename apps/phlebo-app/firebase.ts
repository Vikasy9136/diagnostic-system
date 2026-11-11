import { Platform } from 'react-native';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const env = typeof process !== 'undefined' && process.env ? process.env : {};

export const ADMIN_LOGIN_EMAIL =
  env.EXPO_PUBLIC_ADMIN_EMAIL || 'lab.setu.admin@gmail.com';

export const API_BASE_URL =
  env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'web'
    ? 'http://localhost:5000/api/v1'
    : 'http://10.0.2.2:5000/api/v1');

export const PORTAL_URLS = {
  PORTAL: env.EXPO_PUBLIC_PORTAL_URL || 'http://localhost:3003',
  ADMIN: env.EXPO_PUBLIC_ADMIN_PORTAL_URL || 'http://localhost:3002',
  SMALL_LAB: env.EXPO_PUBLIC_SMALL_LAB_PORTAL_URL || 'http://localhost:3000',
  LARGE_LAB: env.EXPO_PUBLIC_LARGE_LAB_PORTAL_URL || 'http://localhost:3001',
};

const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBM4u9_Kv7EdingjaLFoMFHrnkqijDI-SA',
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'labsetu-diagnostics.firebaseapp.com',
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'labsetu-diagnostics',
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'labsetu-diagnostics.firebasestorage.app',
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '125622512041',
  appId:
    env.EXPO_PUBLIC_FIREBASE_APP_ID ||
    (Platform.OS === 'android'
      ? '1:125622512041:android:5b37da8831aecea14cbcb8'
      : '1:125622512041:web:6484db0479d7d4474cbcb8'),
};

export const app: FirebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

