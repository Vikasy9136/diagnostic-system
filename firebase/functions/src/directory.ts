import crypto from 'crypto';
import {
  type CreateManagedUserPayload,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  ROLE_LABELS,
  type UserProfile,
  UserRole,
} from './types';
import { ADMIN_EMAIL, AppError, auth, db, PROJECT_ID } from './firebaseAdmin';
import { createMailTransporter, sendPlatformNotification } from './mailer';
import { SMTP_CONFIG } from './firebaseAdmin';

interface StoredOtpRecord {
  email: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashOtp(email: string, otp: string): string {
  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(email)}::${otp.trim()}::${PROJECT_ID}`)
    .digest('hex');
}

export async function findProvisionedUserByEmail(email: string): Promise<UserProfile | null> {
  const normalized = normalizeEmail(email);

  const dirSnap = await db.collection('user_directory').doc(normalized).get();
  if (dirSnap.exists) {
    return dirSnap.data() as UserProfile;
  }

  const usersSnap = await db
    .collection('users')
    .where('email', '==', normalized)
    .limit(1)
    .get();
  if (!usersSnap.empty) {
    return usersSnap.docs[0].data() as UserProfile;
  }

  if (normalized === ADMIN_EMAIL) {
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
      return {
        id: 'usr-admin-root',
        email: normalized,
        displayName: 'LabSetu Platform Admin',
        role: UserRole.ADMIN,
        isActive: true,
        createdByAdmin: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  return null;
}

export async function listProvisionedUsers(): Promise<UserProfile[]> {
  const snap = await db.collection('user_directory').orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => d.data() as UserProfile);
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

  let uid: string;
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

  await auth.setCustomUserClaims(uid, {
    role: payload.role,
    ...(payload.labId?.trim() ? { labId: payload.labId.trim() } : {}),
    ...(payload.phlebotomistId?.trim()
      ? { phlebotomistId: payload.phlebotomistId.trim() }
      : {}),
  });

  const now = new Date().toISOString();
  const profile: UserProfile = {
    id: uid,
    email: normalized,
    displayName: payload.displayName.trim(),
    ...(payload.phoneNumber?.trim() ? { phoneNumber: payload.phoneNumber.trim() } : {}),
    role: payload.role,
    ...(payload.labId?.trim() ? { labId: payload.labId.trim() } : {}),
    ...(payload.phlebotomistId?.trim()
      ? { phlebotomistId: payload.phlebotomistId.trim() }
      : {}),
    isActive: payload.isActive !== false,
    createdByAdmin: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('users').doc(uid).set(profile, { merge: true });
  await db.collection('user_directory').doc(normalized).set(profile, { merge: true });

  await sendPlatformNotification({
    title: `LabSetu Account Provisioned (${ROLE_LABELS[payload.role]})`,
    message: `Hello ${profile.displayName}, Admin has provisioned your ${ROLE_LABELS[payload.role]} account for ${normalized}. You can sign in using Google Sign-In, Email OTP${payload.password ? ', or Password' : ''}.`,
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
  const isEmail = identifier.includes('@');
  let profile: UserProfile | null = null;

  if (isEmail) {
    profile = await findProvisionedUserByEmail(identifier);
  } else {
    const snap = await db.collection('users').doc(identifier).get();
    if (snap.exists) profile = snap.data() as UserProfile;
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

  try {
    await auth.updateUser(nextProfile.id, { disabled: !nextProfile.isActive });
    await auth.setCustomUserClaims(nextProfile.id, {
      role: nextProfile.role,
      ...(nextProfile.labId ? { labId: nextProfile.labId } : {}),
      ...(nextProfile.phlebotomistId ? { phlebotomistId: nextProfile.phlebotomistId } : {}),
    });
  } catch (err) {
    console.warn('Auth sync warning in updateManagedUserStatus:', err);
  }

  await db.collection('users').doc(nextProfile.id).set(nextProfile, { merge: true });
  await db
    .collection('user_directory')
    .doc(normalizeEmail(nextProfile.email))
    .set(nextProfile, { merge: true });

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
      `Account (${normalized}) is suspended. Contact Platform Admin (${ADMIN_EMAIL}).`,
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
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    used: false,
  };

  await db.collection('email_otps').doc(normalized).set(record);

  const transporter = createMailTransporter();
  if (transporter) {
    await transporter.sendMail({
      from: SMTP_CONFIG.from,
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

  console.log(`[CLOUD FUNCTION OTP] Recipient: ${normalized} | Role: ${profile.role} (SMTP_PASS not set)`);
  return { sent: true, deliveryMode: 'QUEUED_NO_SMTP', role: profile.role };
}

export async function verifyEmailOtp(
  email: string,
  otp: string,
  portalRole?: UserRole
): Promise<{ customToken: string; userProfile: UserProfile }> {
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

  const otpSnap = await db.collection('email_otps').doc(normalized).get();
  const record = otpSnap.exists ? (otpSnap.data() as StoredOtpRecord) : undefined;

  if (!record || record.used) {
    throw new AppError('OTP not found or already used. Please request a new code.', 400, 'OTP_INVALID');
  }
  if (Date.now() > record.expiresAt) {
    throw new AppError('OTP expired. Please request a fresh code.', 400, 'OTP_EXPIRED');
  }
  if (record.attempts >= 5) {
    throw new AppError('Too many incorrect OTP attempts. Request a new OTP.', 429, 'OTP_LOCKED');
  }

  if (hashOtp(normalized, otp) !== record.otpHash) {
    await db
      .collection('email_otps')
      .doc(normalized)
      .set({ attempts: record.attempts + 1 }, { merge: true });
    throw new AppError('Incorrect OTP code. Please verify and try again.', 401, 'OTP_MISMATCH');
  }

  await db.collection('email_otps').doc(normalized).set({ used: true }, { merge: true });

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
  const customToken = await auth.createCustomToken(targetUid, claims);

  return { customToken, userProfile: { ...profile, id: targetUid } };
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
      `Account (${normalized}) is not provisioned by Platform Admin (${ADMIN_EMAIL}).`,
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

export async function syncFirebaseUserFromDirectory(
  emailId: string,
  afterData: Partial<UserProfile> | undefined
): Promise<void> {
  const normalized = normalizeEmail(afterData?.email || emailId);
  if (!normalized || !normalized.includes('@')) return;

  if (!afterData) {
    // Removed from user_directory -> disable Auth user if present
    try {
      const fbUser = await auth.getUserByEmail(normalized);
      await auth.updateUser(fbUser.uid, { disabled: true });
      await auth.setCustomUserClaims(fbUser.uid, {});
    } catch {
      // User not created yet
    }
    return;
  }

  if (!afterData.role || !Object.values(UserRole).includes(afterData.role)) return;

  let targetUid: string;
  try {
    const fbUser = await auth.getUserByEmail(normalized);
    targetUid = fbUser.uid;
    await auth.updateUser(targetUid, {
      ...(afterData.displayName ? { displayName: afterData.displayName } : {}),
      disabled: afterData.isActive === false,
    });
  } catch (err: unknown) {
    const fbErr = err as { code?: string };
    if (fbErr.code !== 'auth/user-not-found') throw err;
    const created = await auth.createUser({
      email: normalized,
      displayName: afterData.displayName || normalized.split('@')[0],
      emailVerified: true,
      disabled: afterData.isActive === false,
    });
    targetUid = created.uid;
  }

  await auth.setCustomUserClaims(targetUid, {
    role: afterData.role,
    ...(afterData.labId ? { labId: afterData.labId } : {}),
    ...(afterData.phlebotomistId ? { phlebotomistId: afterData.phlebotomistId } : {}),
  });

  await db.collection('users').doc(targetUid).set(
    {
      ...afterData,
      id: targetUid,
      email: normalized,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

