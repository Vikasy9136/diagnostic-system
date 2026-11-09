import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { config } from './env';

let firebaseApp: admin.app.App | null = null;
let firestoreDb: admin.firestore.Firestore | null = null;
let firebaseAuth: admin.auth.Auth | null = null;

export function initializeFirebase(): {
  app: admin.app.App | null;
  db: admin.firestore.Firestore | null;
  auth: admin.auth.Auth | null;
  isMockMode: boolean;
} {
  if (firebaseApp) {
    return { app: firebaseApp, db: firestoreDb, auth: firebaseAuth, isMockMode: false };
  }

  // Check if emulators are active or service account exists
  const isEmulator = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST
  );

  const resolvedKeyPath = config.firebase.serviceAccountKeyPath
    ? path.resolve(process.cwd(), config.firebase.serviceAccountKeyPath)
    : '';

  const hasServiceAccount = resolvedKeyPath && fs.existsSync(resolvedKeyPath);

  try {
    if (isEmulator) {
      console.log('ℹ️  Firebase Admin: Initializing in Local Emulator mode.');
      firebaseApp = admin.initializeApp({
        projectId: config.firebase.projectId,
      });
    } else if (hasServiceAccount) {
      console.log(`ℹ️  Firebase Admin: Initializing with service account at: ${resolvedKeyPath}`);
      const serviceAccount = JSON.parse(fs.readFileSync(resolvedKeyPath, 'utf8'));
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebase.projectId,
        storageBucket: config.firebase.storageBucket,
      });
    } else {
      console.log('ℹ️  Firebase Admin: No credentials configured yet. Running in Development Mock Mode.');
      return { app: null, db: null, auth: null, isMockMode: true };
    }

    firestoreDb = admin.firestore(firebaseApp);
    firebaseAuth = admin.auth(firebaseApp);

    return { app: firebaseApp, db: firestoreDb, auth: firebaseAuth, isMockMode: false };
  } catch (error) {
    console.warn('⚠️  Firebase Admin initialization skipped or encountered error (Mock mode enabled):', error);
    return { app: null, db: null, auth: null, isMockMode: true };
  }
}
