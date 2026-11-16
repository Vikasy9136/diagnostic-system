import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import * as firebaseAuthNamespace from 'firebase/auth';
import {
  initializeFirestore,
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { KitAllocationRecord } from '@diagnostic/shared';
import {
  getStorage,
  FirebaseStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
} from 'firebase/storage';

declare const process:
  | {
    env?: Record<string, string | undefined>;
  }
  | undefined;

const env = typeof process !== 'undefined' && process.env ? process.env : {};

export const ADMIN_LOGIN_EMAIL =
  env.EXPO_PUBLIC_ADMIN_EMAIL || 'lab.setu.admin@gmail.com';

const isLocalWebHost =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL =
  env.EXPO_PUBLIC_API_URL ||
  (isLocalWebHost
    ? 'http://localhost:5000/api/v1'
    : 'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1');

const defaultPortalOrigin = isLocalWebHost
  ? 'http://localhost:3003'
  : 'https://labsetu-diagnostics.web.app';

export const PORTAL_URLS = {
  PORTAL: env.EXPO_PUBLIC_PORTAL_URL || defaultPortalOrigin,
  ADMIN:
    env.EXPO_PUBLIC_ADMIN_PORTAL_URL ||
    (isLocalWebHost ? 'http://localhost:3002' : `${defaultPortalOrigin}/login?role=ADMIN`),
  SMALL_LAB:
    env.EXPO_PUBLIC_SMALL_LAB_PORTAL_URL ||
    (isLocalWebHost ? 'http://localhost:3000' : `${defaultPortalOrigin}/login?role=SMALL_LAB`),
  LARGE_LAB:
    env.EXPO_PUBLIC_LARGE_LAB_PORTAL_URL ||
    (isLocalWebHost ? 'http://localhost:3001' : `${defaultPortalOrigin}/login?role=LARGE_LAB`),
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

const getRnPersistence = (
  firebaseAuthNamespace as unknown as {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

function resolveFirebaseAuth(firebaseApp: FirebaseApp): Auth {
  if (Platform.OS !== 'web' && typeof getRnPersistence === 'function') {
    try {
      return initializeAuth(firebaseApp, {
        persistence: getRnPersistence(AsyncStorage),
      });
    } catch {
      return getAuth(firebaseApp);
    }
  }
  return getAuth(firebaseApp);
}

export const auth: Auth = resolveFirebaseAuth(app);
export const db: Firestore = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
});
export const storage: FirebaseStorage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function uploadPhleboSampleFile(
  path: string,
  file: Blob | File
): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadPhleboSampleBase64(
  path: string,
  base64Data: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const storageRef = ref(storage, path);
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  await uploadString(storageRef, cleanBase64, 'base64', { contentType });
  return getDownloadURL(storageRef);
}

/**
 * Subscribes to collection kits allocated to this phlebotomist from Central Supply
 */
export function subscribeMyKitAllocations(
  phleboId: string,
  onData: (allocations: KitAllocationRecord[]) => void
): Unsubscribe {
  if (!phleboId) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'kit_allocations'), where('phlebotomistId', '==', phleboId));
  return onSnapshot(
    q,
    (snap) => {
      const list: KitAllocationRecord[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...(doc.data() as Omit<KitAllocationRecord, 'id'>) });
      });
      list.sort((a, b) => (b.allocatedAt || '').localeCompare(a.allocatedAt || ''));
      onData(list);
    },
    (err) => {
      console.warn('[firebase] Error subscribing to kit allocations:', err);
      onData([]);
    }
  );
}

/**
 * Sends a notification to Admin requesting a restock of diagnostic collection kits
 */
export async function requestKitRestock(params: {
  phleboId: string;
  phleboName: string;
  kitCode?: string;
  kitName?: string;
  requestedQuantity?: number;
  notes?: string;
}) {
  const now = new Date().toISOString();
  await addDoc(collection(db, 'notifications'), {
    title: `Kit Restock Requested: ${params.phleboName}`,
    message: `${params.phleboName} requested a restock of ${params.kitName || 'collection kits'} (Qty: ${params.requestedQuantity || 10}). ${params.notes ? `Note: ${params.notes}` : ''}`,
    category: 'SYSTEM_ALERT',
    priority: 'HIGH',
    recipientRole: 'ADMIN',
    channels: ['IN_APP', 'EMAIL'],
    read: false,
    emailSent: false,
    pushSent: false,
    createdAt: now,
  });
}



