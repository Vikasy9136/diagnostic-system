import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { type Application } from 'express';
import { type UserProfile } from './types';

let cachedCloudApp: Application | null = null;

function getCloudApp(): Application {
  if (!cachedCloudApp) {
    // Lazily load Express app + Firebase Admin SDK on first request so deploy discovery stays < 200ms
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCloudApiApp } = require('./app') as typeof import('./app');
    cachedCloudApp = createCloudApiApp();
  }
  return cachedCloudApp;
}

/**
 * Main HTTPS API Function (rewritten from Firebase Hosting /api/v1/**)
 */
export const api = onRequest(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB',
  },
  (req, res) => {
    const expressApp = getCloudApp();
    expressApp(req, res);
  }
);

/**
 * Automatically synchronizes Firebase Auth users and RBAC custom claims
 * whenever Platform Admin creates, updates, suspends, or deletes a user_directory doc.
 */
export const onUserDirectoryWrite = onDocumentWritten(
  {
    document: 'user_directory/{emailId}',
    region: 'us-central1',
  },
  async (event) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { syncFirebaseUserFromDirectory } = require('./directory') as typeof import('./directory');
    const afterData = event.data?.after.exists
      ? (event.data.after.data() as Partial<UserProfile>)
      : undefined;
    await syncFirebaseUserFromDirectory(event.params.emailId, afterData);
  }
);

/**
 * Automatically delivers queued notification/alert emails via Gmail SMTP
 * whenever a frontend dashboard appends to Firestore `mail/{mailId}`.
 */
export const onMailDocumentCreated = onDocumentCreated(
  {
    document: 'mail/{mailId}',
    region: 'us-central1',
  },
  async (event) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { processQueuedMailDocument } = require('./mailer') as typeof import('./mailer');
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!data) return;
    await processQueuedMailDocument(event.params.mailId, data);
  }
);
