import nodemailer, { type Transporter } from 'nodemailer';
import {
  deepCleanFirestorePayload,
  PlatformNotification,
  SendNotificationPayload,
  NotificationChannel,
  NotificationPriority,
  NotificationCategory,
  EmailDeliverySettings,
  UserRole,
  SupportContactsConfig,
  DEFAULT_SUPPORT_CONTACTS,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';
import { resolveNotificationEmailTemplate } from './emailTemplates.service';

// Local volatile notification store used only until Admin SDK serviceAccountKey.json is attached
const DEV_NOTIFICATIONS: PlatformNotification[] = [];

let devEmailSettings: EmailDeliverySettings = {
  adminEmail: config.admin.email,
  enableBookingEmails: true,
  enableColdChainAlerts: true,
  enableReportReadyEmails: true,
  enableDailySummaryEmails: true,
  smtpConfigured: Boolean(config.smtp.pass),
};

function createMailTransporter(): Transporter | null {
  if (!config.smtp.user || !config.smtp.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
    dnsTimeout: 5000,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

export async function getNotificationSettings(): Promise<EmailDeliverySettings> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    try {
      const doc = await db.collection('settings').doc('notifications').get();
      if (doc.exists) {
        return {
          ...devEmailSettings,
          ...(doc.data() as Partial<EmailDeliverySettings>),
          smtpConfigured: Boolean(config.smtp.pass),
        };
      }
    } catch (err) {
      console.warn('⚠️ Failed to load notification settings from Firestore:', err);
    }
  }
  return { ...devEmailSettings, smtpConfigured: Boolean(config.smtp.pass) };
}

export async function updateNotificationSettings(
  updates: Partial<EmailDeliverySettings>
): Promise<EmailDeliverySettings> {
  devEmailSettings = {
    ...devEmailSettings,
    ...updates,
    smtpConfigured: Boolean(config.smtp.pass),
  };

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db
      .collection('settings')
      .doc('notifications')
      .set(
        {
          adminEmail: devEmailSettings.adminEmail,
          enableBookingEmails: devEmailSettings.enableBookingEmails,
          enableColdChainAlerts: devEmailSettings.enableColdChainAlerts,
          enableReportReadyEmails: devEmailSettings.enableReportReadyEmails,
          enableDailySummaryEmails: devEmailSettings.enableDailySummaryEmails,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }

  return devEmailSettings;
}

export async function listNotifications(limitCount = 30): Promise<PlatformNotification[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    try {
      const snap = await db
        .collection('notifications')
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();
      return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<PlatformNotification, 'id'>) }));
    } catch (err) {
      console.warn('⚠️ Firestore notifications fetch fallback to dev store:', err);
    }
  }
  return DEV_NOTIFICATIONS.slice(0, limitCount);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const localTarget = DEV_NOTIFICATIONS.find((n) => n.id === notificationId);
  if (localTarget) {
    localTarget.read = true;
  }

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('notifications').doc(notificationId).set({ read: true }, { merge: true });
  }
}

export async function markAllNotificationsRead(
  recipientRole?: string,
  recipientUid?: string
): Promise<number> {
  let count = 0;
  for (const n of DEV_NOTIFICATIONS) {
    if (
      (!recipientRole || n.recipientRole === recipientRole) &&
      (!recipientUid || n.recipientUid === recipientUid)
    ) {
      n.read = true;
      count++;
    }
  }

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    try {
      let query: FirebaseFirestore.Query = db.collection('notifications').where('read', '==', false);
      if (recipientUid) {
        query = query.where('recipientUid', '==', recipientUid);
      } else if (recipientRole && recipientRole !== 'ALL' && recipientRole !== UserRole.ADMIN) {
        query = query.where('recipientRole', '==', recipientRole);
      }
      const snap = await query.limit(100).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => {
          batch.update(doc.ref, { read: true, readAt: new Date().toISOString() });
        });
        await batch.commit();
        count = snap.size;
      }
    } catch (err) {
      console.warn('⚠️ Failed to mark all notifications read in Firestore:', err);
    }
  }
  return count;
}

export async function clearAllNotifications(
  recipientRole?: string,
  recipientUid?: string
): Promise<number> {
  let removedCount = 0;
  if (!recipientRole && !recipientUid) {
    removedCount = DEV_NOTIFICATIONS.length;
    DEV_NOTIFICATIONS.length = 0;
  } else {
    for (let i = DEV_NOTIFICATIONS.length - 1; i >= 0; i--) {
      const n = DEV_NOTIFICATIONS[i];
      if (
        (!recipientRole || n.recipientRole === recipientRole) &&
        (!recipientUid || n.recipientUid === recipientUid)
      ) {
        DEV_NOTIFICATIONS.splice(i, 1);
        removedCount++;
      }
    }
  }

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    try {
      let query: FirebaseFirestore.Query = db.collection('notifications');
      if (recipientUid) {
        query = query.where('recipientUid', '==', recipientUid);
      } else if (recipientRole && recipientRole !== 'ALL' && recipientRole !== UserRole.ADMIN) {
        query = query.where('recipientRole', '==', recipientRole);
      }
      const snap = await query.limit(100).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        removedCount = snap.size;
      }
    } catch (err) {
      console.warn('⚠️ Failed to clear all notifications in Firestore:', err);
    }
  }
  return removedCount;
}

export async function getSupportContactsSettings(): Promise<SupportContactsConfig> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    try {
      const doc = await db.collection('settings').doc('support').get();
      if (doc.exists) {
        return {
          ...DEFAULT_SUPPORT_CONTACTS,
          ...(doc.data() as Partial<SupportContactsConfig>),
        };
      }
    } catch (err) {
      console.warn('⚠️ Failed to load support contacts from Firestore:', err);
    }
  }
  return { ...DEFAULT_SUPPORT_CONTACTS };
}

export async function updateSupportContactsSettings(
  updates: Partial<SupportContactsConfig>,
  updatedBy?: string
): Promise<SupportContactsConfig> {
  const merged: SupportContactsConfig = {
    ...DEFAULT_SUPPORT_CONTACTS,
    ...updates,
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  };

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('settings').doc('support').set(deepCleanFirestorePayload(merged), { merge: true });
  }

  return merged;
}

export async function registerUserFcmToken(uid: string, fcmToken: string): Promise<void> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    const existingTokens = Array.isArray(snap.data()?.fcmTokens) ? (snap.data()?.fcmTokens as string[]) : [];
    const updatedTokens = Array.from(new Set([...existingTokens, fcmToken])).slice(-10);
    await userRef.set(
      {
        fcmTokens: updatedTokens,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

export async function sendPlatformNotification(
  payload: SendNotificationPayload
): Promise<PlatformNotification> {
  const { db, messaging, isMockMode } = initializeFirebase();
  const createdAt = new Date().toISOString();
  const id = `notif-${Date.now()}`;
  const channels =
    payload.channels && payload.channels.length > 0
      ? payload.channels
      : [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH_FCM];

  const recipientEmail = payload.recipientEmail || config.admin.email;
  let emailSent = false;
  let emailStatus = 'SKIPPED';
  let pushSent = false;

  // 1. Dispatch Email Notification (SMTP Nodemailer + Firestore 'mail' queue record)
  if (channels.includes(NotificationChannel.EMAIL) && recipientEmail) {
    const rendered = resolveNotificationEmailTemplate(payload, createdAt);
    const transporter = createMailTransporter();

    if (transporter) {
      try {
        await transporter.sendMail({
          from: config.smtp.from,
          to: recipientEmail,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
        emailSent = true;
        emailStatus = `SENT_SMTP_TO_${recipientEmail}`;
      } catch (smtpErr) {
        console.error('❌ SMTP email delivery failed:', smtpErr);
        emailStatus = `SMTP_ERROR: ${smtpErr instanceof Error ? smtpErr.message : 'Unknown error'}`;
      }
    } else {
      emailStatus = 'QUEUED_FOR_EMAIL';
      console.log(`📧 [Email Notification Queued -> ${recipientEmail}] Subject: ${rendered.subject}`);
    }

    // Also record in Firestore `mail` collection (Trigger Email Extension compatible)
    if (db && !isMockMode) {
      await db.collection('mail').add({
        to: [recipientEmail],
        templateType: rendered.templateType,
        category: payload.category || NotificationCategory.SYSTEM_ALERT,
        priority: payload.priority || NotificationPriority.NORMAL,
        message: {
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        },
        deliveryState: emailSent ? 'DELIVERED_BY_API_SMTP' : 'QUEUED',
        createdAt,
      });
    }
  }

  // 2. Dispatch Firebase Cloud Messaging Push Notification
  if (channels.includes(NotificationChannel.PUSH_FCM) && db && messaging && !isMockMode) {
    try {
      const tokens: string[] = [];
      if (payload.recipientUid) {
        const userSnap = await db.collection('users').doc(payload.recipientUid).get();
        const userTokens = userSnap.data()?.fcmTokens;
        if (Array.isArray(userTokens)) tokens.push(...userTokens);
      } else {
        const targetRole = payload.recipientRole || UserRole.ADMIN;
        const usersSnap =
          targetRole === 'ALL'
            ? await db.collection('users').limit(50).get()
            : await db.collection('users').where('role', '==', targetRole).get();
        usersSnap.forEach((doc) => {
          const docTokens = doc.data()?.fcmTokens;
          if (Array.isArray(docTokens)) tokens.push(...docTokens);
        });
      }

      const uniqueTokens = Array.from(new Set(tokens)).filter(Boolean);
      if (uniqueTokens.length > 0) {
        const res = await messaging.sendEachForMulticast({
          tokens: uniqueTokens,
          notification: {
            title: payload.title,
            body: payload.message,
          },
          data: {
            category: payload.category || NotificationCategory.SYSTEM_ALERT,
            orderId: payload.orderId || '',
          },
        });
        pushSent = res.successCount > 0;
      }
    } catch (fcmErr) {
      console.warn('⚠️ FCM push notification skipped or failed:', fcmErr);
    }
  }

  const notificationRecord: PlatformNotification = deepCleanFirestorePayload({
    id,
    title: payload.title,
    message: payload.message,
    category: payload.category || NotificationCategory.SYSTEM_ALERT,
    priority: payload.priority || NotificationPriority.NORMAL,
    ...(payload.recipientUid ? { recipientUid: payload.recipientUid } : {}),
    ...(recipientEmail ? { recipientEmail } : {}),
    recipientRole: payload.recipientRole || UserRole.ADMIN,
    ...(payload.orderId ? { orderId: payload.orderId } : {}),
    ...(payload.labId ? { labId: payload.labId } : {}),
    channels,
    read: false,
    emailSent,
    emailStatus,
    pushSent,
    createdAt,
  });

  // 3. Persist In-App Notification in Firestore `notifications`
  if (db && !isMockMode) {
    try {
      const docRef = await db.collection('notifications').add(notificationRecord);
      notificationRecord.id = docRef.id;
    } catch (notifErr) {
      console.warn('⚠️ Could not persist in-app notification to Firestore:', notifErr);
    }
  }

  DEV_NOTIFICATIONS.unshift(notificationRecord);
  return notificationRecord;
}
