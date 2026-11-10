import dotenv from 'dotenv';
import path from 'path';

// Load .env from monorepo root if not already loaded
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config(); // fallback to local directory .env

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  admin: {
    email: process.env.ADMIN_EMAIL || 'lab.setu.admin@gmail.com',
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'labsetu-diagnostics',
    clientEmail:
      process.env.FIREBASE_CLIENT_EMAIL ||
      'firebase-adminsdk-fbsvc@labsetu-diagnostics.iam.gserviceaccount.com',
    serviceAccountKeyPath: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json',
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || 'labsetu-diagnostics.firebasestorage.app',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER || 'lab.setu.admin@gmail.com',
    pass: process.env.SMTP_PASS || '',
    from: process.env.NOTIFICATION_FROM_EMAIL || 'LabSetu Diagnostics <lab.setu.admin@gmail.com>',
  },
};
