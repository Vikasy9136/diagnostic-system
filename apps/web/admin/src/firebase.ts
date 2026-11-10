import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import {
  getStorage,
  connectStorageEmulator,
  FirebaseStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

export const ADMIN_LOGIN_EMAIL =
  import.meta.env.VITE_ADMIN_EMAIL || 'lab.setu.admin@gmail.com';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBM4u9_Kv7EdingjaLFoMFHrnkqijDI-SA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'labsetu-diagnostics.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'labsetu-diagnostics',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'labsetu-diagnostics.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '125622512041',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:125622512041:web:6484db0479d7d4474cbcb8',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-3K3CJZ8590',
};

export const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export async function uploadDiagnosticDocument(path: string, file: File | Blob): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    console.log('🔗 Admin Dashboard connected to local Firebase Emulators');
  } catch (err) {
    console.warn('⚠️ Emulator connection already initialized or failed:', err);
  }
}
