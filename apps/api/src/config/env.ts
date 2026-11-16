import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env from monorepo root if not already loaded
const envCandidates = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}
dotenv.config(); // fallback to local directory .env

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:8081',
        'http://localhost:19006',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
        'http://127.0.0.1:3003',
      ],
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
    webApiKey:
      process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBM4u9_Kv7EdingjaLFoMFHrnkqijDI-SA',
  },
  smtp: {
    host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false',
    user: (process.env.SMTP_USER || 'lab.setu.admin@gmail.com').trim(),
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    from: process.env.NOTIFICATION_FROM_EMAIL || 'LabSetu Diagnostics <lab.setu.admin@gmail.com>',
  },
  razorpay: {
    keyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
    keySecret: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
    webhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
    xAccountNumber: (process.env.RAZORPAYX_ACCOUNT_NUMBER || '').trim(),
  },
  cloudFunctionsApiUrl:
    process.env.CLOUD_FUNCTIONS_API_URL ||
    'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api',
  googleMapsApiKey:
    (process.env.GOOGLE_MAPS_API_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      'AIzaSyDEUzwXFySwEvwIXanvnnmV0eSs9e5aFeA').trim(),
};
