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
import { ADMIN_EMAIL, db, messaging, PROJECT_ID, SMTP_CONFIG } from './firebaseAdmin';

export function createMailTransporter(): Transporter | null {
  if (!SMTP_CONFIG.user || !SMTP_CONFIG.pass) {
    return null;
  }
  return nodemailer.createTransport({
    host: SMTP_CONFIG.host,
    port: SMTP_CONFIG.port,
    secure: SMTP_CONFIG.secure,
    auth: {
      user: SMTP_CONFIG.user,
      pass: SMTP_CONFIG.pass,
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
        <div style="font-size: 12px; color: #7DD3FC; margin-top: 4px;">Firebase Cloud Platform &amp; Cold-Chain Alert</div>
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
          Dispatched at ${new Date(createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST • Firebase Project (${PROJECT_ID})
        </div>
      </div>
    </div>
  `;
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
    const htmlBody = buildLabSetuEmailHtml(payload, createdAt);
    const transporter = createMailTransporter();

    if (transporter) {
      try {
        await transporter.sendMail({
          from: SMTP_CONFIG.from,
          to: recipientEmail,
          subject: `[LabSetu] ${payload.title}`,
          text: `${payload.title}\n\n${payload.message}`,
          html: htmlBody,
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
      message: {
        subject: `[LabSetu] ${payload.title}`,
        text: payload.message,
        html: htmlBody,
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

  const record: PlatformNotification = {
    id: `notif-${Date.now()}`,
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

  const docRef = await db.collection('notifications').add(record);
  record.id = docRef.id;
  return record;
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

  if (recipients.length === 0 || !message.subject) {
    return;
  }

  const transporter = createMailTransporter();
  if (!transporter) {
    await db.collection('mail').doc(mailId).set(
      {
        deliveryState: 'QUEUED_NO_SMTP_PASS',
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
      subject: message.subject,
      text: message.text || '',
      html: message.html || undefined,
    });

    await db.collection('mail').doc(mailId).set(
      {
        deliveryState: 'DELIVERED_BY_CLOUD_FUNCTION',
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

