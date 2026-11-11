import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import {
  getStorage,
  connectStorageEmulator,
  type FirebaseStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

export const ADMIN_LOGIN_EMAIL =
  import.meta.env.VITE_ADMIN_EMAIL || 'lab.setu.admin@gmail.com';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const isLocalHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL =
  configuredApiUrl && (!configuredApiUrl.includes('localhost') || isLocalHost)
    ? configuredApiUrl
    : '/api/v1';

export const PORTAL_URLS = {
  PORTAL: import.meta.env.VITE_PORTAL_URL || 'http://localhost:3003',
  ADMIN: import.meta.env.VITE_ADMIN_PORTAL_URL || 'http://localhost:3002',
  SMALL_LAB: import.meta.env.VITE_SMALL_LAB_PORTAL_URL || 'http://localhost:3000',
  LARGE_LAB: import.meta.env.VITE_LARGE_LAB_PORTAL_URL || 'http://localhost:3001',
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBM4u9_Kv7EdingjaLFoMFHrnkqijDI-SA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'labsetu-diagnostics.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'labsetu-diagnostics',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'labsetu-diagnostics.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '125622512041',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:125622512041:web:6484db0479d7d4474cbcb8',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-3K3CJZ8590',
};

export const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function uploadDiagnosticDocument(
  path: string,
  file: File | Blob
): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    console.log('🔗 LabSetu Unified Portal connected to local Firebase Emulators');
  } catch (err) {
    console.warn('⚠️ Emulator connection already initialized or failed:', err);
  }
}

