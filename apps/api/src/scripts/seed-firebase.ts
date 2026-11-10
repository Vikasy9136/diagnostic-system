import crypto from 'crypto';
import {
  UserRole,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';

async function seedFirebase(): Promise<void> {
  console.log(`\n🔧 LabSetu Firebase Bootstrap (${config.firebase.projectId})`);

  const { auth, db, isMockMode } = initializeFirebase();
  if (isMockMode || !auth || !db) {
    console.error(
      '\n❌ Firebase Admin SDK is not initialized with serviceAccountKey.json.\n' +
        '   Download the Admin SDK private key from:\n' +
        `   https://console.firebase.google.com/project/${config.firebase.projectId}/settings/serviceaccounts/adminsdk\n` +
        '   and save it as diagnostic-platform/serviceAccountKey.json (gitignored), then re-run:\n' +
        '   npm run seed:firebase\n'
    );
    process.exit(1);
  }

  const adminEmail = config.admin.email;
  const passwordArg = process.argv.find((arg) => arg.startsWith('--password='))?.split('=')[1];
  const configuredPassword = passwordArg || config.admin.initialPassword;

  // 1. Provision or update Admin User in Firebase Auth
  let adminUid: string;
  try {
    const existing = await auth.getUserByEmail(adminEmail);
    adminUid = existing.uid;
    if (configuredPassword) {
      await auth.updateUser(adminUid, {
        password: configuredPassword,
        emailVerified: true,
        displayName: 'LabSetu Admin',
      });
      console.log(`✅ Updated existing Firebase Auth admin user (${adminEmail}) with configured password.`);
    } else {
      await auth.updateUser(adminUid, {
        emailVerified: true,
        displayName: 'LabSetu Admin',
      });
      console.log(`✅ Found existing Firebase Auth admin user (${adminEmail}).`);
    }
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string };
    if (firebaseErr.code === 'auth/user-not-found') {
      const initialPassword =
        configuredPassword || crypto.randomBytes(18).toString('base64url');
      const created = await auth.createUser({
        email: adminEmail,
        password: initialPassword,
        emailVerified: true,
        displayName: 'LabSetu Admin',
      });
      adminUid = created.uid;
      console.log(`✅ Created Firebase Auth admin user: ${adminEmail} (uid: ${adminUid})`);
      if (!configuredPassword) {
        const resetLink = await auth.generatePasswordResetLink(adminEmail);
        console.log('\n🔑 Set your Admin password directly using this Firebase Password Reset link:');
        console.log(`   ${resetLink}\n`);
      }
    } else {
      throw err;
    }
  }

  // 2. Assign ADMIN Custom Claims
  await auth.setCustomUserClaims(adminUid, { role: UserRole.ADMIN });
  console.log(`✅ Stamped Firebase Auth custom claim { role: "ADMIN" } on ${adminEmail}`);

  const now = new Date().toISOString();

  // 3. Create / update Admin User document in Firestore
  await db.collection('users').doc(adminUid).set(
    {
      id: adminUid,
      email: adminEmail,
      displayName: 'LabSetu Platform Owner',
      role: UserRole.ADMIN,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // 4. Platform Settings & Notification Settings in Firestore
  await db.collection('settings').doc('platform').set(
    {
      temperatureRangeCelsius: { min: 2.0, max: 8.0 },
      statPickupSlaMinutes: 45,
      autoReassignDelayMinutes: 15,
      projectId: config.firebase.projectId,
      updatedBy: adminEmail,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection('settings').doc('notifications').set(
    {
      adminEmail,
      enableBookingEmails: true,
      enableColdChainAlerts: true,
      enableReportReadyEmails: true,
      enableDailySummaryEmails: true,
      updatedAt: now,
    },
    { merge: true }
  );

  // 5. Initial Labs, Phlebotomists & System Notification
  await db.collection('labs').doc('LAB-SM-001').set(
    {
      id: 'LAB-SM-001',
      name: 'Bhandup Care Lab',
      type: 'SMALL_LAB',
      city: 'Mumbai',
      verified: true,
      email: 'bhandup.lab@example.org',
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection('labs').doc('LAB-LG-100').set(
    {
      id: 'LAB-LG-100',
      name: 'Metro Diagnostics',
      type: 'LARGE_LAB',
      city: 'Mulund West, Mumbai',
      verified: true,
      email: 'metro.partner@example.org',
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection('notifications').doc('welcome-admin-setup').set(
    {
      id: 'welcome-admin-setup',
      title: 'LabSetu Firebase Setup Initialized',
      message: `Admin account ${adminEmail} and Firestore collections for ${config.firebase.projectId} are active.`,
      category: NotificationCategory.SYSTEM_ALERT,
      priority: NotificationPriority.NORMAL,
      recipientUid: adminUid,
      recipientEmail: adminEmail,
      recipientRole: UserRole.ADMIN,
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      read: false,
      emailSent: false,
      emailStatus: 'INITIALIZED',
      pushSent: false,
      createdAt: now,
    },
    { merge: true }
  );

  console.log('✅ Seeded Firestore users, settings, labs, and initial admin notification.\n');
  process.exit(0);
}

seedFirebase().catch((err) => {
  console.error('❌ Firebase bootstrap failed:', err);
  process.exit(1);
});
