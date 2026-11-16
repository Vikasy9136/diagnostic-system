import * as admin from 'firebase-admin';

export const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'labsetu-diagnostics';
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'lab.setu.admin@gmail.com').trim().toLowerCase();
export const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;
export const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBM4u9_Kv7EdingjaLFoMFHrnkqijDI-SA';

export const SMTP_CONFIG = {
  host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE !== 'false',
  user: (process.env.SMTP_USER || ADMIN_EMAIL).trim(),
  pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  from: process.env.NOTIFICATION_FROM_EMAIL || `LabSetu Diagnostics <${ADMIN_EMAIL}>`,
};

export const RAZORPAY_CONFIG = {
  keyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
  keySecret: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
  webhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
  xAccountNumber: (process.env.RAZORPAYX_ACCOUNT_NUMBER || '').trim(),
};

export const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  });
}

export const adminApp = admin.app();
export const db = admin.firestore(adminApp);
db.settings({ ignoreUndefinedProperties: true });
export const auth = admin.auth(adminApp);
export const messaging = admin.messaging(adminApp);

export function deepCleanFirestorePayload<T>(val: T): T {
  if (val === null || val === undefined) {
    return undefined as unknown as T;
  }
  if (val instanceof Date) {
    return val.toISOString() as unknown as T;
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => deepCleanFirestorePayload(item))
      .filter((item) => item !== undefined) as unknown as T;
  }
  if (typeof val === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        const cleaned = deepCleanFirestorePayload(v);
        if (cleaned !== undefined) {
          clean[key] = cleaned;
        }
      }
    }
    return clean as T;
  }
  return val;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

