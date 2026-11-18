import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const saPath = path.join(ROOT_DIR, 'serviceAccountKey.json');
if (!fs.existsSync(saPath)) {
  console.error('serviceAccountKey.json not found');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || 'labsetu-diagnostics',
  });
}

const db = admin.firestore();

async function publishRelease() {
  const version = process.argv[2] || '1.0.1';
  const buildNumber = parseInt(process.argv[3] || '2', 10);
  const downloadUrl =
    process.argv[4] ||
    'https://expo.dev/accounts/vikas775898/projects/labsetu-phlebo/builds';
  const releaseNotes =
    process.argv[5] ||
    'Floating Quick Action Menu (Today Collection, Online/Offline), Real Notification Bar alerts & sound, and in-app self-update.';

  const payload = {
    latestVersion: version,
    versionCode: buildNumber,
    downloadUrl: downloadUrl,
    releaseNotes: releaseNotes,
    isMandatory: false,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.collection('system_config').doc('app_release_phlebo').set(payload, { merge: true });
  console.log('✅ Successfully published Phlebo App Release to Firestore: system_config/app_release_phlebo');
  console.log(JSON.stringify(payload, null, 2));
}

publishRelease().catch((err) => {
  console.error('Failed to publish release:', err);
  process.exit(1);
});
