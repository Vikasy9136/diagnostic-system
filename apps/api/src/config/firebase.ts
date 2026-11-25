import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { config } from './env';

let firebaseApp: admin.app.App | null = null;
let firestoreDb: admin.firestore.Firestore | null = null;
let firebaseAuth: admin.auth.Auth | null = null;
let firebaseStorage: admin.storage.Storage | null = null;
let firebaseMessaging: admin.messaging.Messaging | null = null;

function resolveServiceAccountPath(configuredPath: string): string | null {
  if (!configuredPath) return null;

  const candidates = [
    path.resolve(process.cwd(), configuredPath),
    path.resolve(__dirname, '../../../../', configuredPath),
    path.resolve(__dirname, '../../../', configuredPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function initializeFirebase(): {
  app: admin.app.App | null;
  db: admin.firestore.Firestore | null;
  auth: admin.auth.Auth | null;
  storage: admin.storage.Storage | null;
  messaging: admin.messaging.Messaging | null;
  isMockMode: boolean;
} {
  if (process.env.FORCE_FIREBASE_MOCK === 'true') {
    return {
      app: null,
      db: null,
      auth: null,
      storage: null,
      messaging: null,
      isMockMode: true,
    };
  }
  if (firebaseApp) {
    return {
      app: firebaseApp,
      db: firestoreDb,
      auth: firebaseAuth,
      storage: firebaseStorage,
      messaging: firebaseMessaging,
      isMockMode: false,
    };
  }

  const isEmulator = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST
  );

  const resolvedKeyPath = resolveServiceAccountPath(config.firebase.serviceAccountKeyPath);

  try {
    if (isEmulator) {
      console.log('ℹ️  Firebase Admin: Initializing in Local Emulator mode.');
      firebaseApp = admin.initializeApp({
        projectId: config.firebase.projectId,
        storageBucket: config.firebase.storageBucket,
      });
    } else if (resolvedKeyPath) {
      console.log(`ℹ️  Firebase Admin: Initializing with service account at: ${resolvedKeyPath}`);
      const serviceAccount = JSON.parse(fs.readFileSync(resolvedKeyPath, 'utf8'));
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebase.projectId,
        storageBucket: config.firebase.storageBucket,
      });
    } else if (
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FUNCTION_TARGET ||
      process.env.K_SERVICE
    ) {
      console.log('ℹ️  Firebase Admin: Initializing with Application Default Credentials.');
      firebaseApp = admin.initializeApp({
        projectId: config.firebase.projectId,
        storageBucket: config.firebase.storageBucket,
      });
    } else {
      console.log(
        'ℹ️  Firebase Admin: No serviceAccountKey.json found yet. Running in Development Mock Mode.'
      );
      return {
        app: null,
        db: null,
        auth: null,
        storage: null,
        messaging: null,
        isMockMode: true,
      };
    }

    firestoreDb = admin.firestore(firebaseApp);
    firestoreDb.settings({ ignoreUndefinedProperties: true });
    firebaseAuth = admin.auth(firebaseApp);
    firebaseStorage = admin.storage(firebaseApp);
    firebaseMessaging = admin.messaging(firebaseApp);

    return {
      app: firebaseApp,
      db: firestoreDb,
      auth: firebaseAuth,
      storage: firebaseStorage,
      messaging: firebaseMessaging,
      isMockMode: false,
    };
  } catch (error) {
    console.warn(
      '⚠️  Firebase Admin initialization skipped or encountered error (Mock mode enabled):',
      error
    );
    return {
      app: null,
      db: null,
      auth: null,
      storage: null,
      messaging: null,
      isMockMode: true,
    };
  }
}
