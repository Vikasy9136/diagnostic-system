import crypto from 'crypto';
import nodemailer from 'nodemailer';
import {
  CreateManagedUserPayload,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  ROLE_LABELS,
  UserProfile,
  UserRole,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { sendPlatformNotification } from './notification.service';

interface StoredOtpRecord {
  email: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
}

const DEV_OTP_STORE = new Map<string, StoredOtpRecord>();
const DEV_OTP_SESSIONS = new Map<
  string,
  { uid: string; email: string; role: UserRole; labId?: string; phlebotomistId?: string; expiresAt: number }
>();

export function resolveDevSessionToken(token: string) {
  const entry = DEV_OTP_SESSIONS.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    DEV_OTP_SESSIONS.delete(token);
    return null;
  }
  return entry;
}

const DEV_USERS_DIRECTORY = new Map<string, UserProfile>([
  [
    config.admin.email.toLowerCase(),
    {
      id: 'usr-admin-root',
      email: config.admin.email.toLowerCase(),
      displayName: 'LabSetu Platform Admin',
      role: UserRole.ADMIN,
      isActive: true,
      createdByAdmin: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
]);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashOtp(email: string, otp: string): string {
  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(email)}::${otp.trim()}::${config.firebase.projectId}`)
    .digest('hex');
}

function createOtpTransporter() {
  if (!config.smtp.user || !config.smtp.pass) {
    return null;
  }
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

export async function findProvisionedUserByEmail(email: string): Promise<UserProfile | null> {
  const normalized = normalizeEmail(email);
  const { db, auth, isMockMode } = initializeFirebase();

  if (db && !isMockMode) {
    // 1. Check email-keyed admin directory first (supports Google Sign-In + pre-provisioned emails)
    const dirSnap = await db.collection('user_directory').doc(normalized).get();
    if (dirSnap.exists) {
      return dirSnap.data() as UserProfile;
    }

    // 2. Check users collection query by email
    const usersSnap = await db
      .collection('users')
      .where('email', '==', normalized)
      .limit(1)
      .get();
    if (!usersSnap.empty) {
      return usersSnap.docs[0].data() as UserProfile;
    }

    // 3. Fallback check if root admin exists in Auth
    if (normalized === normalizeEmail(config.admin.email) && auth) {
      try {
        const fbUser = await auth.getUserByEmail(normalized);
        return {
          id: fbUser.uid,
          email: normalized,
          displayName: fbUser.displayName || 'LabSetu Platform Admin',
          role: UserRole.ADMIN,
          isActive: !fbUser.disabled,
          createdByAdmin: true,
          createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } catch {
        // Not created yet
      }
    }
  }

  return DEV_USERS_DIRECTORY.get(normalized) || null;
}

export async function listProvisionedUsers(): Promise<UserProfile[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('user_directory').orderBy('createdAt', 'desc').get();
    if (!snap.empty) {
      return snap.docs.map((d) => d.data() as UserProfile);
    }
  }
  return Array.from(DEV_USERS_DIRECTORY.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export async function createOrUpdateManagedUser(
  payload: CreateManagedUserPayload
): Promise<UserProfile> {
  const normalized = normalizeEmail(payload.email);
  if (!normalized || !normalized.includes('@')) {
    throw new AppError('Valid email address is required.', 400, 'BAD_REQUEST');
  }
  if (!payload.displayName?.trim()) {
    throw new AppError('Display name is required.', 400, 'BAD_REQUEST');
  }
  if (!Object.values(UserRole).includes(payload.role)) {
    throw new AppError(`Invalid user role: ${payload.role}`, 400, 'BAD_REQUEST');
  }

  const now = new Date().toISOString();
  const { auth, db, isMockMode } = initializeFirebase();
  let uid = `usr-${Buffer.from(normalized).toString('base64url').slice(0, 14)}`;

  if (auth && db && !isMockMode) {
    try {
      const existing = await auth.getUserByEmail(normalized);
      uid = existing.uid;
      await auth.updateUser(uid, {
        displayName: payload.displayName.trim(),
        disabled: payload.isActive === false,
        ...(payload.password ? { password: payload.password } : {}),
      });
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      if (fbErr.code === 'auth/user-not-found') {
        const created = await auth.createUser({
          email: normalized,
          displayName: payload.displayName.trim(),
          emailVerified: true,
          disabled: payload.isActive === false,
          ...(payload.password ? { password: payload.password } : {}),
        });
        uid = created.uid;
      } else {
        throw err;
      }
    }

    // Stamp RBAC custom claims cleanly
    await auth.setCustomUserClaims(uid, {
      role: payload.role,
      ...(payload.labId ? { labId: payload.labId.trim() } : {}),
      ...(payload.phlebotomistId ? { phlebotomistId: payload.phlebotomistId.trim() } : {}),
    });
  }

  const profile: UserProfile = {
    id: uid,
    email: normalized,
    displayName: payload.displayName.trim(),
    phoneNumber: payload.phoneNumber?.trim(),
    role: payload.role,
    labId: payload.labId?.trim() || undefined,
    phlebotomistId: payload.phlebotomistId?.trim() || undefined,
    isActive: payload.isActive !== false,
    createdByAdmin: true,
    createdAt: now,
    updatedAt: now,
  };

  if (db && !isMockMode) {
    await db.collection('users').doc(uid).set(profile, { merge: true });
    await db.collection('user_directory').doc(normalized).set(profile, { merge: true });
  }
  DEV_USERS_DIRECTORY.set(normalized, profile);

  await sendPlatformNotification({
    title: `LabSetu Account Provisioned (${ROLE_LABELS[payload.role]})`,
    message: `Hello ${profile.displayName}, Admin has provisioned your ${ROLE_LABELS[payload.role]} account for ${normalized}. You can sign in using Google Sign-In, Email OTP${payload.password ? ', or your configured Password' : ''}.`,
    category: NotificationCategory.SYSTEM_ALERT,
    priority: NotificationPriority.NORMAL,
    recipientEmail: normalized,
    recipientUid: uid,
    recipientRole: payload.role,
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  });

  return profile;
}

export async function updateManagedUserStatus(
  identifier: string,
  updates: { isActive?: boolean; role?: UserRole; labId?: string; phlebotomistId?: string }
): Promise<UserProfile> {
  const { auth, db, isMockMode } = initializeFirebase();
  const isEmail = identifier.includes('@');
  let profile: UserProfile | null = null;

  if (isEmail) {
    profile = await findProvisionedUserByEmail(identifier);
  } else {
    if (db && !isMockMode) {
      const snap = await db.collection('users').doc(identifier).get();
      if (snap.exists) profile = snap.data() as UserProfile;
    }
    if (!profile) {
      profile = Array.from(DEV_USERS_DIRECTORY.values()).find((u) => u.id === identifier) || null;
    }
  }

  if (!profile) {
    throw new AppError(`Managed user not found: ${identifier}`, 404, 'NOT_FOUND');
  }

  const nextProfile: UserProfile = {
    ...profile,
    isActive: updates.isActive ?? profile.isActive,
    role: updates.role ?? profile.role,
    labId: updates.labId !== undefined ? updates.labId : profile.labId,
    phlebotomistId:
      updates.phlebotomistId !== undefined ? updates.phlebotomistId : profile.phlebotomistId,
    updatedAt: new Date().toISOString(),
  };

  if (auth && db && !isMockMode) {
    await auth.updateUser(nextProfile.id, { disabled: !nextProfile.isActive });
    await auth.setCustomUserClaims(nextProfile.id, {
      role: nextProfile.role,
      ...(nextProfile.labId ? { labId: nextProfile.labId } : {}),
      ...(nextProfile.phlebotomistId ? { phlebotomistId: nextProfile.phlebotomistId } : {}),
    });
    await db.collection('users').doc(nextProfile.id).set(nextProfile, { merge: true });
    await db
      .collection('user_directory')
      .doc(normalizeEmail(nextProfile.email))
      .set(nextProfile, { merge: true });
  }

  DEV_USERS_DIRECTORY.set(normalizeEmail(nextProfile.email), nextProfile);
  return nextProfile;
}

export async function requestEmailOtp(
  email: string,
  portalRole?: UserRole
): Promise<{ sent: boolean; deliveryMode: 'SMTP' | 'QUEUED_NO_SMTP'; role: UserRole }> {
  const normalized = normalizeEmail(email);
  const profile = await findProvisionedUserByEmail(normalized);

  if (!profile) {
    throw new AppError(
      `Account (${normalized}) has not been added by the Platform Admin. Only Admin-provisioned emails can sign in.`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  if (!profile.isActive) {
    throw new AppError(
      `Account (${normalized}) is suspended. Contact Platform Admin (${config.admin.email}).`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  if (portalRole && profile.role !== portalRole) {
    throw new AppError(
      `Role mismatch: ${normalized} is assigned role ${profile.role}, not ${portalRole}.`,
      403,
      'ROLE_MISMATCH',
      { assignedRole: profile.role }
    );
  }

  const otpCode = String(crypto.randomInt(100000, 999999));
  const record: StoredOtpRecord = {
    email: normalized,
    otpHash: hashOtp(normalized, otpCode),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    attempts: 0,
    used: false,
  };

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('email_otps').doc(normalized).set(record);
  }
  DEV_OTP_STORE.set(normalized, record);

  const transporter = createOtpTransporter();
  if (transporter) {
    await transporter.sendMail({
      from: config.smtp.from,
      to: normalized,
      subject: `LabSetu Sign-In OTP Code: ${otpCode}`,
      text: `Your LabSetu Diagnostics verification OTP is ${otpCode}. It expires in 10 minutes. Do not share this code with anyone.`,
      html: `
        <div style="font-family: Inter, -apple-system, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
          <div style="background: #062226; padding: 20px 24px; color: #FFFFFF;">
            <div style="font-size: 18px; font-weight: 700;">LabSetu Diagnostics Sign-In</div>
            <div style="font-size: 12px; color: #7DD3FC;">One-Time Email Verification Code</div>
          </div>
          <div style="padding: 24px; color: #0F172A;">
            <p style="margin: 0 0 12px 0; font-size: 14px;">Hello <strong>${profile.displayName}</strong> (${ROLE_LABELS[profile.role]}),</p>
            <p style="margin: 0 0 18px 0; font-size: 14px; color: #475569;">Use this 6-digit OTP to sign in to your LabSetu portal:</p>
            <div style="background: #F0FDFA; border: 1px dashed #0D9488; border-radius: 10px; padding: 16px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0F766E;">
              ${otpCode}
            </div>
            <p style="margin: 16px 0 0 0; font-size: 12px; color: #64748B;">Valid for 10 minutes. If you did not request this code, ignore this email.</p>
          </div>
        </div>
      `,
    });
    return { sent: true, deliveryMode: 'SMTP', role: profile.role };
  }

  console.log(`\n🔐 [DEV EMAIL OTP] Recipient: ${normalized} | Role: ${profile.role} | OTP: ${otpCode}\n`);
  return { sent: true, deliveryMode: 'QUEUED_NO_SMTP', role: profile.role };
}

export async function verifyEmailOtp(
  email: string,
  otp: string,
  portalRole?: UserRole
): Promise<{ customToken: string | null; devSessionToken?: string; userProfile: UserProfile }> {
  const normalized = normalizeEmail(email);
  const profile = await findProvisionedUserByEmail(normalized);

  if (!profile || !profile.isActive) {
    throw new AppError('Account not provisioned or inactive.', 403, 'USER_NOT_PROVISIONED');
  }

  if (portalRole && profile.role !== portalRole) {
    throw new AppError(
      `Role mismatch: ${normalized} is assigned role ${profile.role}, cannot access ${portalRole} dashboard.`,
      403,
      'ROLE_MISMATCH',
      { assignedRole: profile.role }
    );
  }

  const { db, auth, isMockMode } = initializeFirebase();
  let record: StoredOtpRecord | undefined = DEV_OTP_STORE.get(normalized);

  if (db && !isMockMode) {
    const snap = await db.collection('email_otps').doc(normalized).get();
    if (snap.exists) {
      record = snap.data() as StoredOtpRecord;
    }
  }

  if (!record || record.used) {
    throw new AppError('OTP not found or already used. Please request a new code.', 400, 'OTP_INVALID');
  }

  if (Date.now() > record.expiresAt) {
    throw new AppError('OTP expired. Please request a fresh code.', 400, 'OTP_EXPIRED');
  }

  if (record.attempts >= 5) {
    throw new AppError('Too many incorrect OTP attempts. Request a new OTP.', 429, 'OTP_LOCKED');
  }

  const candidateHash = hashOtp(normalized, otp);
  if (candidateHash !== record.otpHash) {
    record.attempts += 1;
    DEV_OTP_STORE.set(normalized, record);
    if (db && !isMockMode) {
      await db.collection('email_otps').doc(normalized).set(record, { merge: true });
    }
    throw new AppError('Incorrect OTP code. Please verify and try again.', 401, 'OTP_MISMATCH');
  }

  // Mark OTP used immediately
  record.used = true;
  DEV_OTP_STORE.set(normalized, record);
  if (db && !isMockMode) {
    await db.collection('email_otps').doc(normalized).set(record, { merge: true });
  }

  let customToken: string | null = null;
  if (auth && !isMockMode) {
    let targetUid = profile.id;
    try {
      const fbUser = await auth.getUserByEmail(normalized);
      targetUid = fbUser.uid;
    } catch {
      const created = await auth.createUser({
        email: normalized,
        displayName: profile.displayName,
        emailVerified: true,
      });
      targetUid = created.uid;
    }

    const claims = {
      role: profile.role,
      ...(profile.labId ? { labId: profile.labId } : {}),
      ...(profile.phlebotomistId ? { phlebotomistId: profile.phlebotomistId } : {}),
    };
    await auth.setCustomUserClaims(targetUid, claims);
    customToken = await auth.createCustomToken(targetUid, claims);
    return { customToken, userProfile: profile };
  }

  // Non-production dev mock session token when Admin SDK service account is not yet attached
  let devSessionToken: string | undefined;
  if (config.env !== 'production') {
    devSessionToken = `dev-otp-${crypto.randomBytes(24).toString('hex')}`;
    DEV_OTP_SESSIONS.set(devSessionToken, {
      uid: profile.id,
      email: profile.email,
      role: profile.role,
      labId: profile.labId,
      phlebotomistId: profile.phlebotomistId,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    });
  }

  return { customToken, devSessionToken, userProfile: profile };
}

export async function verifyAndSyncSessionRole(
  uid: string,
  email: string | undefined,
  requiredRole?: UserRole
): Promise<UserProfile> {
  if (!email) {
    throw new AppError('Authenticated user lacks a verified email address.', 403, 'FORBIDDEN');
  }

  const normalized = normalizeEmail(email);
  const profile = await findProvisionedUserByEmail(normalized);

  if (!profile) {
    throw new AppError(
      `Account (${normalized}) is not provisioned by Platform Admin (${config.admin.email}).`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  if (!profile.isActive) {
    throw new AppError(
      `Account (${normalized}) is currently suspended by Platform Admin.`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  const { auth, db, isMockMode } = initializeFirebase();
  if (auth && db && !isMockMode) {
    await auth.setCustomUserClaims(uid, {
      role: profile.role,
      ...(profile.labId ? { labId: profile.labId } : {}),
      ...(profile.phlebotomistId ? { phlebotomistId: profile.phlebotomistId } : {}),
    });

    await db.collection('users').doc(uid).set(
      {
        ...profile,
        id: uid,
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  if (requiredRole && profile.role !== requiredRole) {
    throw new AppError(
      `Access restricted: Your account role is ${profile.role}, which cannot open the ${requiredRole} portal.`,
      403,
      'ROLE_MISMATCH',
      { assignedRole: profile.role }
    );
  }

  return { ...profile, id: uid };
}
