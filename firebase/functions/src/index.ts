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
    cors: false,
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

/**
 * Idempotently stamps the 30-minute instant payout SLA metadata onto `orders/{orderId}`
 * and linked `settlements` documents when a booking transitions to a terminal/delivered state
 * via either REST API or direct client SDK writes.
 */
export const onOrderWritten = onDocumentWritten(
  {
    document: 'orders/{orderId}',
    region: 'us-central1',
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) return;
    const after = afterSnap.data() as Record<string, unknown>;
    const status = String(after.status || '');
    const isTerminalOrDelivered =
      status === 'DELIVERED_TO_LAB' ||
      status === 'REPORT_UPLOADED' ||
      status === 'COMPLETED';
    if (!isTerminalOrDelivered) return;
    if (after.instantPayoutEligible === true && typeof after.payoutDueAt === 'string' && after.payoutDueAt) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { db } = require('./firebaseAdmin') as typeof import('./firebaseAdmin');
    const now = new Date().toISOString();
    const completedAtStamp =
      typeof after.completedAt === 'string' && after.completedAt ? after.completedAt : now;
    const baseMs = Date.parse(completedAtStamp);
    const payoutDueAtStamp =
      typeof after.payoutDueAt === 'string' && after.payoutDueAt
        ? after.payoutDueAt
        : new Date((Number.isFinite(baseMs) ? baseMs : Date.now()) + 30 * 60 * 1000).toISOString();

    const instantPatch = {
      completedAt: completedAtStamp,
      payoutDueAt: payoutDueAtStamp,
      payoutWindowMinutes: 30,
      instantPayoutEligible: true,
      updatedAt: now,
    };

    await afterSnap.ref.set(instantPatch, { merge: true });

    const orderId = event.params.orderId;
    const directStlId = `STL-${orderId.replace(/^BK-/, '')}`;
    const directStlSnap = await db.collection('settlements').doc(directStlId).get();
    if (directStlSnap.exists) {
      await directStlSnap.ref.set(instantPatch, { merge: true });
    }
    const linkedStls = await db.collection('settlements').where('orderId', '==', orderId).get();
    for (const stlDoc of linkedStls.docs) {
      if (stlDoc.id !== directStlId || !directStlSnap.exists) {
        await stlDoc.ref.set(instantPatch, { merge: true });
      }
    }
  }
);
