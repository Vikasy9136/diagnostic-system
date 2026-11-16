import nodemailer, { type Transporter } from 'nodemailer';
import {
  type EmailDeliverySettings,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type PlatformNotification,
  type SendNotificationPayload,
  UserRole,
} from './types';
import { ADMIN_EMAIL, db, deepCleanFirestorePayload, messaging, SMTP_CONFIG } from './firebaseAdmin';
import { renderQueuedMailDocument, resolveNotificationEmailTemplate } from './emailTemplates';

export function createMailTransporter(): Transporter | null {
  if (!SMTP_CONFIG.user || !SMTP_CONFIG.pass) {
    return null;
  }
  return nodemailer.createTransport({
    host: SMTP_CONFIG.host,
    port: SMTP_CONFIG.port,
    secure: SMTP_CONFIG.secure,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
    auth: {
      user: SMTP_CONFIG.user,
      pass: SMTP_CONFIG.pass,
    },
  });
}

export async function getNotificationSettings(): Promise<EmailDeliverySettings> {
  const defaults: EmailDeliverySettings = {
    adminEmail: ADMIN_EMAIL,
    enableBookingEmails: true,
    enableColdChainAlerts: true,
    enableReportReadyEmails: true,
    enableDailySummaryEmails: true,
    smtpConfigured: Boolean(SMTP_CONFIG.pass),
  };

  const snap = await db.collection('settings').doc('notifications').get();
  if (snap.exists) {
    return {
      ...defaults,
      ...(snap.data() as Partial<EmailDeliverySettings>),
      smtpConfigured: Boolean(SMTP_CONFIG.pass),
    };
  }
  return defaults;
}

export async function updateNotificationSettings(
  updates: Partial<EmailDeliverySettings>
): Promise<EmailDeliverySettings> {
  const current = await getNotificationSettings();
  const next: EmailDeliverySettings = {
    adminEmail: updates.adminEmail || current.adminEmail,
    enableBookingEmails: updates.enableBookingEmails ?? current.enableBookingEmails,
    enableColdChainAlerts: updates.enableColdChainAlerts ?? current.enableColdChainAlerts,
    enableReportReadyEmails: updates.enableReportReadyEmails ?? current.enableReportReadyEmails,
    enableDailySummaryEmails: updates.enableDailySummaryEmails ?? current.enableDailySummaryEmails,
    smtpConfigured: Boolean(SMTP_CONFIG.pass),
  };

  await db
    .collection('settings')
    .doc('notifications')
    .set(
      {
        ...next,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  return next;
}

export async function listNotifications(limitCount = 30): Promise<PlatformNotification[]> {
  const snap = await db
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<PlatformNotification, 'id'>),
  }));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await db.collection('notifications').doc(notificationId).set({ read: true }, { merge: true });
}

export async function registerUserFcmToken(uid: string, fcmToken: string): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  const existing = Array.isArray(snap.data()?.fcmTokens)
    ? (snap.data()?.fcmTokens as string[])
    : [];
  const nextTokens = Array.from(new Set([...existing, fcmToken])).slice(-10);
  await userRef.set(
    {
      fcmTokens: nextTokens,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function sendPlatformNotification(
  payload: SendNotificationPayload
): Promise<PlatformNotification> {
  const createdAt = new Date().toISOString();
  const channels =
    payload.channels && payload.channels.length > 0
      ? payload.channels
      : [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH_FCM];

  const recipientEmail = payload.recipientEmail || ADMIN_EMAIL;
  let emailSent = false;
  let emailStatus = 'SKIPPED';
  let pushSent = false;

  if (channels.includes(NotificationChannel.EMAIL) && recipientEmail) {
    const rendered = resolveNotificationEmailTemplate(payload, createdAt);
    const transporter = createMailTransporter();

    if (transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_CONFIG.from,
          to: recipientEmail,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
        emailSent = true;
        emailStatus = `SENT_SMTP_TO_${recipientEmail}`;
      } catch (err) {
        emailStatus = `SMTP_ERROR: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    } else {
      emailStatus = 'QUEUED_CONFIGURE_SMTP_PASS';
    }

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
      deliveryState: emailSent ? 'DELIVERED_BY_CLOUD_FUNCTION' : 'QUEUED',
      createdAt,
    });
  }

  if (channels.includes(NotificationChannel.PUSH_FCM)) {
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
        usersSnap.forEach((d) => {
          const docTokens = d.data()?.fcmTokens;
          if (Array.isArray(docTokens)) tokens.push(...docTokens);
        });
      }

      const uniqueTokens = Array.from(new Set(tokens)).filter(Boolean);
      if (uniqueTokens.length > 0) {
        const res = await messaging.sendEachForMulticast({
          tokens: uniqueTokens,
          notification: { title: payload.title, body: payload.message },
          data: {
            category: payload.category || NotificationCategory.SYSTEM_ALERT,
            orderId: payload.orderId || '',
          },
        });
        pushSent = res.successCount > 0;
      }
    } catch (fcmErr) {
      console.warn('FCM multicast skipped/failed:', fcmErr);
    }
  }

  const record: Record<string, unknown> = deepCleanFirestorePayload({
    id: `notif-${Date.now()}`,
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

  try {
    const docRef = await db.collection('notifications').add(record);
    record.id = docRef.id;
  } catch (err) {
    console.warn('[mailer] Non-fatal notification collection write failed:', err);
  }
  return record as unknown as PlatformNotification;
}

export async function processQueuedMailDocument(
  mailId: string,
  data: Record<string, unknown>
): Promise<void> {
  const existingState = data.deliveryState as string | undefined;
  if (
    existingState === 'DELIVERED_BY_CLOUD_FUNCTION' ||
    existingState === 'DELIVERED_BY_API_SMTP'
  ) {
    return;
  }

  const toRaw = data.to;
  const recipients = Array.isArray(toRaw)
    ? toRaw.map((x) => String(x)).filter(Boolean)
    : typeof toRaw === 'string' && toRaw
    ? [toRaw]
    : [];
  const message = (data.message || {}) as {
    subject?: string;
    text?: string;
    html?: string;
  };

  if (recipients.length === 0 || (!message.subject && !message.text)) {
    return;
  }

  const rendered = renderQueuedMailDocument(data);
  const transporter = createMailTransporter();
  if (!transporter) {
    await db.collection('mail').doc(mailId).set(
      {
        deliveryState: 'QUEUED_NO_SMTP_PASS',
        ...(rendered.resolvedTemplate ? { resolvedTemplate: rendered.resolvedTemplate } : {}),
        checkedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return;
  }

  try {
    await transporter.sendMail({
      from: SMTP_CONFIG.from,
      to: recipients.join(', '),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html || undefined,
    });

    await db.collection('mail').doc(mailId).set(
      {
        deliveryState: 'DELIVERED_BY_CLOUD_FUNCTION',
        ...(rendered.resolvedTemplate ? { resolvedTemplate: rendered.resolvedTemplate } : {}),
        deliveredAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    await db.collection('mail').doc(mailId).set(
      {
        deliveryState: 'SMTP_DELIVERY_FAILED',
        error: err instanceof Error ? err.message : 'SMTP error',
        attemptedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

