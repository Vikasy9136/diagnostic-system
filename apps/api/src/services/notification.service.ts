import nodemailer, { type Transporter } from 'nodemailer';
import {
  PlatformNotification,
  SendNotificationPayload,
  NotificationChannel,
  NotificationPriority,
  NotificationCategory,
  EmailDeliverySettings,
  UserRole,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';

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
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

function buildLabSetuEmailHtml(payload: SendNotificationPayload, createdAt: string): string {
  const priorityColor =
    payload.priority === NotificationPriority.CRITICAL
      ? '#DC2626'
      : payload.priority === NotificationPriority.HIGH
      ? '#F59E0B'
      : '#0D9488';

  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; background: #FFFFFF;">
      <div style="background: #062226; padding: 20px 24px; color: #FFFFFF;">
        <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">LabSetu Diagnostics Network</div>
        <div style="font-size: 12px; color: #7DD3FC; margin-top: 4px;">Automated Platform &amp; Cold-Chain Notification</div>
      </div>
      <div style="padding: 24px; color: #0F172A;">
        <span style="display: inline-block; padding: 4px 10px; border-radius: 999px; background: ${priorityColor}15; color: ${priorityColor}; font-size: 12px; font-weight: 700; margin-bottom: 12px;">
          ${payload.category || NotificationCategory.SYSTEM_ALERT} • ${payload.priority || NotificationPriority.NORMAL}
        </span>
        <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #0F172A;">${payload.title}</h2>
        <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #334155;">${payload.message}</p>
        ${
          payload.orderId
            ? `<div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #475569; margin-bottom: 16px;">
                <strong>Order / Reference ID:</strong> ${payload.orderId}
               </div>`
            : ''
        }
        <div style="font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 14px;">
          Sent at ${new Date(createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST • LabSetu Diagnostics Network
        </div>
      </div>
    </div>
  `;
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
    const htmlBody = buildLabSetuEmailHtml(payload, createdAt);
    const transporter = createMailTransporter();

    if (transporter) {
      try {
        await transporter.sendMail({
          from: config.smtp.from,
          to: recipientEmail,
          subject: `[LabSetu] ${payload.title}`,
          text: `${payload.title}\n\n${payload.message}`,
          html: htmlBody,
        });
        emailSent = true;
        emailStatus = `SENT_SMTP_TO_${recipientEmail}`;
      } catch (smtpErr) {
        console.error('❌ SMTP email delivery failed:', smtpErr);
        emailStatus = `SMTP_ERROR: ${smtpErr instanceof Error ? smtpErr.message : 'Unknown error'}`;
      }
    } else {
      emailStatus = 'QUEUED_FOR_EMAIL';
      console.log(`📧 [Email Notification Queued -> ${recipientEmail}] Subject: ${payload.title}`);
    }

    // Also record in Firestore `mail` collection (Trigger Email Extension compatible)
    if (db && !isMockMode) {
      await db.collection('mail').add({
        to: [recipientEmail],
        message: {
          subject: `[LabSetu] ${payload.title}`,
          text: payload.message,
          html: htmlBody,
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

  const notificationRecord: PlatformNotification = {
    id,
    title: payload.title,
    message: payload.message,
    category: payload.category || NotificationCategory.SYSTEM_ALERT,
    priority: payload.priority || NotificationPriority.NORMAL,
    recipientUid: payload.recipientUid,
    recipientEmail,
    recipientRole: payload.recipientRole || UserRole.ADMIN,
    orderId: payload.orderId,
    labId: payload.labId,
    channels,
    read: false,
    emailSent,
    emailStatus,
    pushSent,
    createdAt,
  };

  // 3. Persist In-App Notification in Firestore `notifications`
  if (db && !isMockMode) {
    const docRef = await db.collection('notifications').add(notificationRecord);
    notificationRecord.id = docRef.id;
  }

  DEV_NOTIFICATIONS.unshift(notificationRecord);
  return notificationRecord;
}
