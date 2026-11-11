import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { createCloudApiApp } from './app';
import { syncFirebaseUserFromDirectory } from './directory';
import { processQueuedMailDocument } from './mailer';
import { type UserProfile } from './types';

const cloudApp = createCloudApiApp();

/**
 * Main HTTPS API Function (rewritten from Firebase Hosting /api/v1/**)
 */
export const api = onRequest(
  {
    region: 'us-central1',
    cors: true,
    memory: '256MiB',
  },
  cloudApp
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
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!data) return;
    await processQueuedMailDocument(event.params.mailId, data);
  }
);

