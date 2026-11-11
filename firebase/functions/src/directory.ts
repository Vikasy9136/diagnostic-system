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
import { ADMIN_EMAIL, AppError, auth, db, PROJECT_ID, SMTP_CONFIG } from './firebaseAdmin';
import { createMailTransporter, sendPlatformNotification } from './mailer';
import { buildOtpEmailTemplate, buildPasswordResetEmailTemplate } from './emailTemplates';

const ALLOWED_STATIC_ORIGINS = new Set([
  'https://labsetu-diagnostics.web.app',
  'https://labsetu-diagnostics.firebaseapp.com',
]);

function resolveSafeResetOrigin(requestedOrigin?: string): string {
  const defaultOrigin = 'https://labsetu-diagnostics.web.app';
  if (!requestedOrigin || typeof requestedOrigin !== 'string') {
    return defaultOrigin;
  }
  try {
    const parsed = new URL(requestedOrigin.trim());
    if (ALLOWED_STATIC_ORIGINS.has(parsed.origin)) {
      return parsed.origin;
    }
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return parsed.origin;
    }
  } catch {
    // Fall back safely
  }
  return defaultOrigin;
}

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
        adminSubRole: 'SUPER_ADMIN',
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
        adminSubRole: 'SUPER_ADMIN',
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

  const resolvedAdminSubRole =
    payload.role === UserRole.ADMIN ? payload.adminSubRole || 'SUPER_ADMIN' : undefined;
  const resolvedParentLabId =
    payload.role === UserRole.LARGE_LAB && payload.parentLabId?.trim()
      ? payload.parentLabId.trim()
      : undefined;

  await auth.setCustomUserClaims(uid, {
    role: payload.role,
    ...(resolvedAdminSubRole ? { adminSubRole: resolvedAdminSubRole } : {}),
    ...(payload.labId?.trim() ? { labId: payload.labId.trim() } : {}),
    ...(resolvedParentLabId ? { parentLabId: resolvedParentLabId } : {}),
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
    ...(resolvedAdminSubRole ? { adminSubRole: resolvedAdminSubRole } : {}),
    ...(payload.labId?.trim() ? { labId: payload.labId.trim() } : {}),
    ...(resolvedParentLabId ? { parentLabId: resolvedParentLabId } : {}),
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
    title: `Welcome to LabSetu — ${ROLE_LABELS[payload.role]} Account Ready`,
    message: `Hello ${profile.displayName}, Admin has created your ${ROLE_LABELS[payload.role]} account for ${normalized}. ${
      payload.role === UserRole.PHLEBOTOMIST
        ? `Please open the LabSetu Mobile App and sign in using Email OTP${payload.password ? ' or your Password' : ''}.`
        : `You can sign in using Google Sign-In, Email OTP${payload.password ? ', or Password' : ''}.`
    }`,
    category: NotificationCategory.SYSTEM_ALERT,
    priority: NotificationPriority.NORMAL,
    recipientEmail: normalized,
    recipientUid: uid,
    recipientRole: payload.role,
    ...(profile.labId ? { labId: profile.labId } : {}),
    templateType: 'ACCOUNT_WELCOME',
    metadata: {
      displayName: profile.displayName,
      email: normalized,
      roleLabel: ROLE_LABELS[payload.role],
      ...(profile.labId ? { labId: profile.labId } : {}),
      ...(profile.phlebotomistId ? { phlebotomistId: profile.phlebotomistId } : {}),
      hasPassword: Boolean(payload.password),
    },
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  });

  return profile;
}

export async function updateManagedUserStatus(
  identifier: string,
  updates: {
    isActive?: boolean;
    role?: UserRole;
    adminSubRole?: UserProfile['adminSubRole'];
    labId?: string;
    parentLabId?: string;
    phlebotomistId?: string;
  }
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

  const nextRole = updates.role ?? profile.role;
  const nextAdminSubRole =
    nextRole === UserRole.ADMIN
      ? updates.adminSubRole !== undefined
        ? updates.adminSubRole
        : profile.adminSubRole || 'SUPER_ADMIN'
      : undefined;
  const nextLabId = updates.labId !== undefined ? updates.labId : profile.labId;
  const nextParentLabId =
    nextRole === UserRole.LARGE_LAB
      ? updates.parentLabId !== undefined
        ? updates.parentLabId || undefined
        : profile.parentLabId
      : undefined;
  const nextPhleboId =
    updates.phlebotomistId !== undefined ? updates.phlebotomistId : profile.phlebotomistId;

  const nextProfile: UserProfile = {
    ...profile,
    isActive: updates.isActive ?? profile.isActive,
    role: nextRole,
    ...(nextAdminSubRole ? { adminSubRole: nextAdminSubRole } : {}),
    ...(nextLabId ? { labId: nextLabId } : {}),
    ...(nextParentLabId ? { parentLabId: nextParentLabId } : {}),
    ...(nextPhleboId ? { phlebotomistId: nextPhleboId } : {}),
    updatedAt: new Date().toISOString(),
  };

  try {
    await auth.updateUser(nextProfile.id, { disabled: !nextProfile.isActive });
    await auth.setCustomUserClaims(nextProfile.id, {
      role: nextProfile.role,
      ...(nextProfile.adminSubRole ? { adminSubRole: nextProfile.adminSubRole } : {}),
      ...(nextProfile.labId ? { labId: nextProfile.labId } : {}),
      ...(nextProfile.parentLabId ? { parentLabId: nextProfile.parentLabId } : {}),
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

function assertPlatformAccessPolicy(
  profileRole: UserRole,
  requestedRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE'
): void {
  const isWebClient = clientType === 'WEB';
  if (
    isWebClient &&
    (profileRole === UserRole.PHLEBOTOMIST || requestedRole === UserRole.PHLEBOTOMIST)
  ) {
    throw new AppError(
      'Field Phlebotomist accounts can only sign in using the LabSetu Mobile App, not on the website.',
      403,
      'MOBILE_APP_ONLY',
      { assignedRole: profileRole }
    );
  }
}

export async function requestEmailOtp(
  email: string,
  portalRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE'
): Promise<{ sent: boolean; deliveryMode: 'SMTP' | 'QUEUED_NO_SMTP'; role: UserRole }> {
  const normalized = normalizeEmail(email);
  const profile = await findProvisionedUserByEmail(normalized);

  if (!profile) {
    throw new AppError(
      `Your email (${normalized}) has not been added yet. Please ask your LabSetu Admin (${ADMIN_EMAIL}) to create your account first.`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  if (!profile.isActive) {
    throw new AppError(
      `Your account (${normalized}) is currently paused. Please contact LabSetu Admin (${ADMIN_EMAIL}).`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  assertPlatformAccessPolicy(profile.role, portalRole, clientType);

  if (portalRole && profile.role !== portalRole) {
    throw new AppError(
      `Your email (${normalized}) is registered as ${ROLE_LABELS[profile.role]}, not ${ROLE_LABELS[portalRole]}.`,
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

  const renderedOtp = buildOtpEmailTemplate({
    displayName: profile.displayName,
    email: normalized,
    role: profile.role,
    otpCode,
    expiresMinutes: 10,
    clientType,
  });

  const transporter = createMailTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_CONFIG.from,
        to: normalized,
        subject: renderedOtp.subject,
        text: renderedOtp.text,
        html: renderedOtp.html,
      });
      return { sent: true, deliveryMode: 'SMTP', role: profile.role };
    } catch (mailErr) {
      console.error('OTP email delivery failed:', mailErr);
      throw new AppError(
        'We could not deliver the verification code to your email right now. Please try again in a moment or sign in with Google or your password.',
        502,
        'EMAIL_DELIVERY_FAILED'
      );
    }
  }

  console.warn(`Email service is not configured for OTP delivery to ${normalized}.`);
  throw new AppError(
    'Email verification delivery is not configured yet. Please sign in with Google or your password.',
    503,
    'EMAIL_SERVICE_UNAVAILABLE'
  );
}

export async function requestPasswordReset(
  email: string,
  portalOrigin?: string,
  _clientType?: 'WEB' | 'MOBILE'
): Promise<{
  sent: boolean;
  deliveryMode: 'SMTP';
  role: UserRole;
  roleLabel: string;
}> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) {
    throw new AppError('Please enter a valid email address.', 400, 'BAD_REQUEST');
  }

  const profile = await findProvisionedUserByEmail(normalized);
  if (!profile) {
    throw new AppError(
      `No LabSetu account was found for ${normalized}. Please ask your LabSetu Admin (${ADMIN_EMAIL}) to add your email first.`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  if (!profile.isActive) {
    throw new AppError(
      `Your account (${normalized}) is currently paused. Please contact LabSetu Admin (${ADMIN_EMAIL}).`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  let targetUid = profile.id;
  try {
    const fbUser = await auth.getUserByEmail(normalized);
    targetUid = fbUser.uid;
  } catch (err: unknown) {
    const fbErr = err as { code?: string };
    if (fbErr.code !== 'auth/user-not-found') {
      throw err;
    }
    const created = await auth.createUser({
      email: normalized,
      displayName: profile.displayName || normalized.split('@')[0],
      emailVerified: true,
      disabled: false,
    });
    targetUid = created.uid;
  }

  await auth.setCustomUserClaims(targetUid, {
    role: profile.role,
    ...(profile.adminSubRole ? { adminSubRole: profile.adminSubRole } : {}),
    ...(profile.labId ? { labId: profile.labId } : {}),
    ...(profile.parentLabId ? { parentLabId: profile.parentLabId } : {}),
    ...(profile.phlebotomistId ? { phlebotomistId: profile.phlebotomistId } : {}),
  });

  const rawResetLink = await auth.generatePasswordResetLink(normalized);
  const parsedRaw = new URL(rawResetLink);
  const oobCode = parsedRaw.searchParams.get('oobCode');
  if (!oobCode) {
    throw new AppError(
      'Unable to prepare a secure password reset link right now. Please try again.',
      500,
      'RESET_LINK_GENERATION_FAILED'
    );
  }

  const safeOrigin = resolveSafeResetOrigin(portalOrigin);
  const customResetUrl = `${safeOrigin}/reset-password?oobCode=${encodeURIComponent(
    oobCode
  )}&email=${encodeURIComponent(normalized)}&role=${encodeURIComponent(profile.role)}`;

  const renderedReset = buildPasswordResetEmailTemplate({
    displayName: profile.displayName,
    email: normalized,
    role: profile.role,
    resetUrl: customResetUrl,
    portalOrigin: safeOrigin,
  });

  const transporter = createMailTransporter();
  if (!transporter) {
    throw new AppError(
      'Password reset email delivery is not configured yet. Please sign in with Google or contact your LabSetu Admin.',
      503,
      'EMAIL_SERVICE_UNAVAILABLE'
    );
  }

  try {
    await transporter.sendMail({
      from: SMTP_CONFIG.from,
      to: normalized,
      subject: renderedReset.subject,
      text: renderedReset.text,
      html: renderedReset.html,
    });
  } catch (mailErr) {
    console.error('Password reset email delivery failed:', mailErr);
    throw new AppError(
      'We could not deliver the password reset email right now. Please try again in a moment.',
      502,
      'EMAIL_DELIVERY_FAILED'
    );
  }

  const now = new Date().toISOString();
  const redactedUrl = `${safeOrigin}/reset-password?email=${encodeURIComponent(
    normalized
  )}&role=${encodeURIComponent(profile.role)}&token=REDACTED`;
  await db.collection('mail').add({
    to: [normalized],
    templateType: 'PASSWORD_RESET',
    category: NotificationCategory.SYSTEM_ALERT,
    priority: NotificationPriority.NORMAL,
    message: {
      subject: renderedReset.subject,
      text: `Password reset email delivered to ${normalized} (${ROLE_LABELS[profile.role]}). Audit link token redacted: ${redactedUrl}`,
    },
    deliveryState: 'DELIVERED_BY_CLOUD_FUNCTION',
    deliveredAt: now,
    createdAt: now,
  });

  return {
    sent: true,
    deliveryMode: 'SMTP',
    role: profile.role,
    roleLabel: ROLE_LABELS[profile.role],
  };
}

export async function verifyEmailOtp(
  email: string,
  otp: string,
  portalRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE'
): Promise<{ customToken: string; userProfile: UserProfile }> {
  const normalized = normalizeEmail(email);
  const profile = await findProvisionedUserByEmail(normalized);

  if (!profile || !profile.isActive) {
    throw new AppError('Account not found or currently inactive.', 403, 'USER_NOT_PROVISIONED');
  }

  assertPlatformAccessPolicy(profile.role, portalRole, clientType);

  if (portalRole && profile.role !== portalRole) {
    throw new AppError(
      `Your email (${normalized}) is registered as ${ROLE_LABELS[profile.role]} and cannot open ${ROLE_LABELS[portalRole]}.`,
      403,
      'ROLE_MISMATCH',
      { assignedRole: profile.role }
    );
  }

  const otpSnap = await db.collection('email_otps').doc(normalized).get();
  const record = otpSnap.exists ? (otpSnap.data() as StoredOtpRecord) : undefined;

  if (!record || record.used) {
    throw new AppError('This code is invalid or already used. Please request a new OTP.', 400, 'OTP_INVALID');
  }
  if (Date.now() > record.expiresAt) {
    throw new AppError('This OTP has expired. Please request a new code.', 400, 'OTP_EXPIRED');
  }
  if (record.attempts >= 5) {
    throw new AppError('Too many incorrect attempts. Please request a new OTP.', 429, 'OTP_LOCKED');
  }

  if (hashOtp(normalized, otp) !== record.otpHash) {
    await db
      .collection('email_otps')
      .doc(normalized)
      .set({ attempts: record.attempts + 1 }, { merge: true });
    throw new AppError('Incorrect OTP code. Please check your email and try again.', 401, 'OTP_MISMATCH');
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
    ...(profile.adminSubRole ? { adminSubRole: profile.adminSubRole } : {}),
    ...(profile.labId ? { labId: profile.labId } : {}),
    ...(profile.parentLabId ? { parentLabId: profile.parentLabId } : {}),
    ...(profile.phlebotomistId ? { phlebotomistId: profile.phlebotomistId } : {}),
  };

  await auth.setCustomUserClaims(targetUid, claims);
  const customToken = await auth.createCustomToken(targetUid, claims);

  return { customToken, userProfile: { ...profile, id: targetUid } };
}

export async function verifyAndSyncSessionRole(
  uid: string,
  email: string | undefined,
  requiredRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE'
): Promise<UserProfile> {
  if (!email) {
    throw new AppError('Signed-in account does not include a verified email address.', 403, 'FORBIDDEN');
  }

  const normalized = normalizeEmail(email);
  const profile = await findProvisionedUserByEmail(normalized);

  if (!profile) {
    throw new AppError(
      `Your email (${normalized}) has not been added yet. Please ask LabSetu Admin (${ADMIN_EMAIL}) to create your account.`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  if (!profile.isActive) {
    throw new AppError(
      `Your account (${normalized}) is currently paused by LabSetu Admin.`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  assertPlatformAccessPolicy(profile.role, requiredRole, clientType);

  await auth.setCustomUserClaims(uid, {
    role: profile.role,
    ...(profile.adminSubRole ? { adminSubRole: profile.adminSubRole } : {}),
    ...(profile.labId ? { labId: profile.labId } : {}),
    ...(profile.parentLabId ? { parentLabId: profile.parentLabId } : {}),
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
      `Access denied: Your account role is ${ROLE_LABELS[profile.role]}, which cannot open ${ROLE_LABELS[requiredRole]}.`,
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
    ...(afterData.adminSubRole ? { adminSubRole: afterData.adminSubRole } : {}),
    ...(afterData.labId ? { labId: afterData.labId } : {}),
    ...(afterData.parentLabId ? { parentLabId: afterData.parentLabId } : {}),
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

