import * as admin from 'firebase-admin';

export const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'labsetu-diagnostics';
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'lab.setu.admin@gmail.com').trim().toLowerCase();
export const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;

export const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE !== 'false',
  user: process.env.SMTP_USER || ADMIN_EMAIL,
  pass: process.env.SMTP_PASS || '',
  from: process.env.NOTIFICATION_FROM_EMAIL || `LabSetu Diagnostics <${ADMIN_EMAIL}>`,
};

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  });
}

export const adminApp = admin.app();
export const db = admin.firestore(adminApp);
export const auth = admin.auth(adminApp);
export const messaging = admin.messaging(adminApp);

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

