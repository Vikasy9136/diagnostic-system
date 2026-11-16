import crypto from 'crypto';
import {
  type CreateManagedUserPayload,
  type FounderRoleCode,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type PermissionCode,
  ROLE_LABELS,
  type UserProfile,
  UserRole,
} from './types';
import {
  ADMIN_EMAIL,
  AppError,
  FIREBASE_WEB_API_KEY,
  auth,
  db,
  PROJECT_ID,
  SMTP_CONFIG,
} from './firebaseAdmin';
import { createMailTransporter, sendPlatformNotification } from './mailer';
import { buildOtpEmailTemplate, buildPasswordResetEmailTemplate } from './emailTemplates';
import {
  ALL_PERMISSION_CODES,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_STARTER_SERVICE_ZONES,
  buildCompactCustomClaims,
  buildDefaultFounderSeats,
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  evaluatePointServiceCoverage,
  generateRoleAssignedId,
  inferDepartmentIdForSubRole,
  isEffectiveSuperAdmin,
  isEmailIdentifier,
  maskEmailAddress,
  normalizeIdentifierCode,
  resolveEffectivePermissions,
  resolveReportingManagerForRole,
} from './orgConstants';
import { recordAuditLog, recordLoginHistory } from './rbac';

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

export interface ActorContext {
  uid?: string;
  email?: string;
  displayName?: string;
  role?: string;
  isSuperAdmin?: boolean;
  primaryDepartmentId?: string;
  ipAddress?: string;
  userAgent?: string;
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

function buildRootAdminDefaultProfile(uid: string, createdAt?: string): UserProfile {
  const now = new Date().toISOString();
  return {
    id: uid,
    email: ADMIN_EMAIL,
    userCode: 'USR-ADM-1001',
    userCodeUpper: 'USR-ADM-1001',
    displayName: 'Vikas (Super Admin & Product & Technology Head)',
    role: UserRole.ADMIN,
    adminSubRole: 'SUPER_ADMIN',
    isSuperAdmin: true,
    founderRoles: ['SUPER_ADMIN', 'PRODUCT_TECHNOLOGY_HEAD'],
    founderSeatKey: 'VIKAS',
    primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
    departmentIds: [
      'PRODUCT_TECHNOLOGY',
      'FINANCE_BUSINESS',
      'OPERATIONS_PARTNERSHIPS',
      'MARKETING_GROWTH',
    ],
    designationTitle: 'Super Admin & Product & Technology Head',
    responsibilities: [
      'Complete platform visibility & administrative authority across all departments',
      'Website, Partner Portals & Phlebo Mobile App development',
      'Backend architecture, system security & RBAC governance',
    ],
    permissions: ALL_PERMISSION_CODES,
    isActive: true,
    createdByAdmin: true,
    createdAt: createdAt || now,
    updatedAt: now,
  };
}

export async function ensureOrganisationBootstrapped(triggerEmail?: string): Promise<{
  bootstrapped: boolean;
  departmentsSeeded: number;
  designationsSeeded: number;
  founderSeatsSeeded: number;
}> {
  const now = new Date().toISOString();
  let departmentsSeeded = 0;
  let designationsSeeded = 0;
  let founderSeatsSeeded = 0;

  const [deptSnap, desigSnap, seatSnap, commSnap, settingsSnap, plansSnap, zonesSnap, rootDirSnap] =
    await Promise.all([
      db.collection('departments').get(),
      db.collection('designations').get(),
      db.collection('founder_seats').get(),
      db.collection('settings').doc('commission').get(),
      db.collection('settings').doc('platform').get(),
      db.collection('subscription_plans').get(),
      db.collection('service_zones').limit(1).get(),
      db.collection('user_directory').doc(ADMIN_EMAIL).get(),
    ]);

  const batch = db.batch();
  let writes = 0;

  const existingDeptIds = new Set(deptSnap.docs.map((d) => d.id));
  for (const dept of DEFAULT_DEPARTMENTS) {
    if (!existingDeptIds.has(dept.id)) {
      batch.set(db.collection('departments').doc(dept.id), dept);
      departmentsSeeded += 1;
      writes += 1;
    }
  }

  const existingDesigIds = new Set(desigSnap.docs.map((d) => d.id));
  for (const desig of DEFAULT_DESIGNATIONS) {
    if (!existingDesigIds.has(desig.id)) {
      batch.set(db.collection('designations').doc(desig.id), desig);
      designationsSeeded += 1;
      writes += 1;
    }
  }

  const existingSeatIds = new Set(seatSnap.docs.map((d) => d.id));
  for (const seat of buildDefaultFounderSeats(ADMIN_EMAIL)) {
    if (!existingSeatIds.has(seat.seatKey)) {
      batch.set(db.collection('founder_seats').doc(seat.seatKey), seat);
      founderSeatsSeeded += 1;
      writes += 1;
    }
  }

  if (!commSnap.exists) {
    batch.set(db.collection('settings').doc('commission'), {
      ...DEFAULT_COMMISSION_CONFIG,
      updatedBy: triggerEmail || ADMIN_EMAIL,
      updatedAt: now,
    });
    writes += 1;
  } else {
    const existingComm = commSnap.data() || {};
    if (existingComm.instantPayoutEnabled === undefined || existingComm.hideSubscriptionsUi === undefined) {
      batch.set(
        db.collection('settings').doc('commission'),
        {
          billingMode:
            existingComm.billingMode === 'SUBSCRIPTION_AND_PLATFORM_FEES' &&
              existingComm.instantPayoutEnabled === undefined
              ? 'INSTANT_30M_PAYOUT'
              : existingComm.billingMode || 'INSTANT_30M_PAYOUT',
          hideSubscriptionsUi: existingComm.hideSubscriptionsUi ?? true,
          enableSubscriptionsModule: existingComm.enableSubscriptionsModule ?? false,
          enablePartnerLabPayouts: existingComm.enablePartnerLabPayouts ?? true,
          instantPayoutEnabled: existingComm.instantPayoutEnabled ?? true,
          instantPayoutWindowMinutes: existingComm.instantPayoutWindowMinutes ?? 30,
          autoReleaseInstantPayouts: existingComm.autoReleaseInstantPayouts ?? true,
          platformServiceFeePct: existingComm.platformServiceFeePct ?? existingComm.commissionPct ?? 5,
          defaultSubscriptionGraceDays: existingComm.defaultSubscriptionGraceDays ?? 7,
          updatedAt: now,
        },
        { merge: true }
      );
      writes += 1;
    }
  }

  if (!settingsSnap.exists) {
    batch.set(db.collection('settings').doc('platform'), {
      temperatureRangeCelsius: { min: 2, max: 8 },
      statPickupSlaMinutes: 25,
      autoReassignDelayMinutes: 10,
      projectId: PROJECT_ID,
      updatedBy: triggerEmail || ADMIN_EMAIL,
      updatedAt: now,
    });
    writes += 1;
  }

  if (plansSnap.empty) {
    const defaultPlans = [
      {
        id: 'PLAN-SM-STARTER',
        code: 'SM_STARTER',
        name: 'Collection Lab Starter (Monthly)',
        targetTier: 'SMALL_LAB',
        billingCycle: 'MONTHLY',
        priceInr: 999,
        platformServiceFeePct: 5,
        includedMonthlyPickups: 60,
        graceDays: 7,
        features: ['Smart Large Lab Rate Matcher', 'Live Phlebo Dispatch Tracking', 'Digital PDF Report Access'],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'PLAN-SM-GROWTH',
        code: 'SM_GROWTH',
        name: 'Collection Lab Growth (Monthly)',
        targetTier: 'SMALL_LAB',
        billingCycle: 'MONTHLY',
        priceInr: 2499,
        platformServiceFeePct: 3.5,
        includedMonthlyPickups: 250,
        graceDays: 7,
        features: ['Priority Courier Dispatch', 'Reduced Platform Service Fee', 'Multi-User Lab Access'],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'PLAN-LG-HUB',
        code: 'LG_PARTNER_HUB',
        name: 'Reference Hub Annual Partner',
        targetTier: 'LARGE_LAB',
        billingCycle: 'YEARLY',
        priceInr: 19999,
        platformServiceFeePct: 4,
        includedMonthlyPickups: 1000,
        graceDays: 10,
        features: ['Multi-Branch Collection Center Hierarchy', 'Custom B2B Test & Package Tariff Control', 'Automated SLA Alerts'],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const plan of defaultPlans) {
      batch.set(db.collection('subscription_plans').doc(plan.id), plan);
      writes += 1;
    }
  }

  if (zonesSnap.empty) {
    for (const starterZone of DEFAULT_STARTER_SERVICE_ZONES) {
      batch.set(db.collection('service_zones').doc(starterZone.id), starterZone);
      writes += 1;
    }
  }

  if (!rootDirSnap.exists) {
    let rootUid = 'usr-admin-root';
    try {
      const fbUser = await auth.getUserByEmail(ADMIN_EMAIL);
      rootUid = fbUser.uid;
    } catch {
      // Keep placeholder ID until first sign-in or password reset
    }
    const rootProfile = buildRootAdminDefaultProfile(rootUid, now);
    batch.set(db.collection('user_directory').doc(ADMIN_EMAIL), rootProfile);
    writes += 1;
  } else {
    const existingRoot = rootDirSnap.data() as Partial<UserProfile>;
    if (
      !existingRoot.revokedSuperAdmin &&
      (!existingRoot.founderRoles ||
        !existingRoot.primaryDepartmentId ||
        !existingRoot.userCode ||
        !existingRoot.userCodeUpper)
    ) {
      batch.set(
        db.collection('user_directory').doc(ADMIN_EMAIL),
        {
          isSuperAdmin: true,
          adminSubRole: 'SUPER_ADMIN',
          userCode: existingRoot.userCode || 'USR-ADM-1001',
          userCodeUpper: normalizeIdentifierCode(existingRoot.userCode || 'USR-ADM-1001'),
          founderSeatKey: existingRoot.founderSeatKey || 'VIKAS',
          founderRoles: existingRoot.founderRoles || ['SUPER_ADMIN', 'PRODUCT_TECHNOLOGY_HEAD'],
          primaryDepartmentId: existingRoot.primaryDepartmentId || 'PRODUCT_TECHNOLOGY',
          departmentIds: existingRoot.departmentIds || [
            'PRODUCT_TECHNOLOGY',
            'FINANCE_BUSINESS',
            'OPERATIONS_PARTNERSHIPS',
            'MARKETING_GROWTH',
          ],
          permissions: existingRoot.permissions?.length ? existingRoot.permissions : ALL_PERMISSION_CODES,
          updatedAt: now,
        },
        { merge: true }
      );
      writes += 1;
    }
  }

  if (writes > 0) {
    await batch.commit();
  }

  await db
    .collection('settings')
    .doc('org_bootstrap')
    .set(
      {
        bootstrappedAt: now,
        rootAdminEmail: ADMIN_EMAIL,
        departmentsCount: Math.max(deptSnap.size, DEFAULT_DEPARTMENTS.length),
        designationsCount: Math.max(desigSnap.size, DEFAULT_DESIGNATIONS.length),
        founderSeatsCount: Math.max(seatSnap.size, 4),
        dummyEmployeesCount: 0,
      },
      { merge: true }
    );

  return {
    bootstrapped: true,
    departmentsSeeded,
    designationsSeeded,
    founderSeatsSeeded,
  };
}

export async function findProvisionedUserByEmail(email: string): Promise<UserProfile | null> {
  const normalized = normalizeEmail(email);

  const dirSnap = await db.collection('user_directory').doc(normalized).get();
  if (dirSnap.exists) {
    const data = dirSnap.data() as UserProfile;
    if (normalized === ADMIN_EMAIL && !data.revokedSuperAdmin) {
      return {
        ...buildRootAdminDefaultProfile(data.id || 'usr-admin-root', data.createdAt),
        ...data,
        userCode: data.userCode || 'USR-ADM-1001',
        userCodeUpper: normalizeIdentifierCode(data.userCode || 'USR-ADM-1001'),
        isSuperAdmin: data.isSuperAdmin ?? true,
        founderRoles: data.founderRoles || ['SUPER_ADMIN', 'PRODUCT_TECHNOLOGY_HEAD'],
        primaryDepartmentId: data.primaryDepartmentId || 'PRODUCT_TECHNOLOGY',
        permissions:
          Array.isArray(data.permissions) && data.permissions.length > 0
            ? data.permissions
            : ALL_PERMISSION_CODES,
      };
    }
    return data;
  }

  const usersSnap = await db
    .collection('users')
    .where('email', '==', normalized)
    .limit(1)
    .get();
  if (!usersSnap.empty) {
    return usersSnap.docs[0].data() as UserProfile;
  }

  const phleboSnap = await db
    .collection('phlebotomists')
    .where('email', '==', normalized)
    .limit(1)
    .get();
  if (!phleboSnap.empty) {
    const phDoc = phleboSnap.docs[0];
    const phData = phDoc.data() as Record<string, unknown>;
    const now = new Date().toISOString();
    const assignedCode = normalizeIdentifierCode(String(phData.userCode || phDoc.id));
    return {
      id: String(phData.uid || phDoc.id),
      email: normalized,
      userCode: assignedCode,
      userCodeUpper: assignedCode,
      displayName: String(phData.name || phData.displayName || normalized.split('@')[0]),
      ...(phData.phone ? { phoneNumber: String(phData.phone) } : {}),
      role: UserRole.PHLEBOTOMIST,
      phlebotomistId: phDoc.id,
      isActive: phData.isActive !== false,
      createdByAdmin: true,
      createdAt: String(phData.createdAt || now),
      updatedAt: String(phData.updatedAt || now),
    };
  }

  if (normalized === ADMIN_EMAIL) {
    try {
      const fbUser = await auth.getUserByEmail(normalized);
      return buildRootAdminDefaultProfile(fbUser.uid, fbUser.metadata.creationTime);
    } catch {
      return buildRootAdminDefaultProfile('usr-admin-root');
    }
  }

  return null;
}

export async function resolveProvisionedUserByIdentifier(
  identifier: string
): Promise<UserProfile | null> {
  const clean = String(identifier || '').trim();
  if (!clean) return null;
  if (isEmailIdentifier(clean)) {
    return findProvisionedUserByEmail(clean);
  }

  const codeUpper = normalizeIdentifierCode(clean);
  if (codeUpper === 'USR-ADM-1001') {
    const rootProfile = await findProvisionedUserByEmail(ADMIN_EMAIL);
    if (rootProfile) {
      return {
        ...rootProfile,
        userCode: rootProfile.userCode || 'USR-ADM-1001',
        userCodeUpper: 'USR-ADM-1001',
      };
    }
  }

  const dirFields = ['userCodeUpper', 'employeeId', 'labId', 'phlebotomistId'] as const;
  for (const field of dirFields) {
    const candidateVals =
      field === 'labId' || field === 'phlebotomistId' ? [codeUpper, clean] : [codeUpper];
    for (const val of candidateVals) {
      const snap = await db.collection('user_directory').where(field, '==', val).limit(1).get();
      if (!snap.empty) {
        return snap.docs[0].data() as UserProfile;
      }
    }
  }

  for (const labDocId of Array.from(new Set([clean, codeUpper]))) {
    const labSnap = await db.collection('labs').doc(labDocId).get();
    if (labSnap.exists) {
      const labData = labSnap.data() as Record<string, unknown>;
      if (labData.email) {
        const profile = await findProvisionedUserByEmail(String(labData.email));
        if (profile) {
          return {
            ...profile,
            labId: profile.labId || labSnap.id,
            userCode: profile.userCode || String(labData.userCode || codeUpper),
            userCodeUpper: normalizeIdentifierCode(
              String(profile.userCode || labData.userCode || codeUpper)
            ),
          };
        }
      }
    }
  }
  const labByCode = await db.collection('labs').where('userCodeUpper', '==', codeUpper).limit(1).get();
  if (!labByCode.empty) {
    const labData = labByCode.docs[0].data() as Record<string, unknown>;
    if (labData.email) {
      const profile = await findProvisionedUserByEmail(String(labData.email));
      if (profile) {
        return {
          ...profile,
          labId: profile.labId || labByCode.docs[0].id,
          userCode: profile.userCode || String(labData.userCode || codeUpper),
          userCodeUpper: codeUpper,
        };
      }
    }
  }

  for (const phDocId of Array.from(new Set([clean, codeUpper]))) {
    const phSnap = await db.collection('phlebotomists').doc(phDocId).get();
    if (phSnap.exists) {
      const phData = phSnap.data() as Record<string, unknown>;
      if (phData.email) {
        const profile = await findProvisionedUserByEmail(String(phData.email));
        if (profile) {
          return {
            ...profile,
            phlebotomistId: profile.phlebotomistId || phSnap.id,
            userCode: profile.userCode || String(phData.userCode || codeUpper),
            userCodeUpper: normalizeIdentifierCode(
              String(profile.userCode || phData.userCode || codeUpper)
            ),
          };
        }
      }
    }
  }
  const phByCode = await db
    .collection('phlebotomists')
    .where('userCodeUpper', '==', codeUpper)
    .limit(1)
    .get();
  if (!phByCode.empty) {
    const phData = phByCode.docs[0].data() as Record<string, unknown>;
    if (phData.email) {
      const profile = await findProvisionedUserByEmail(String(phData.email));
      if (profile) {
        return {
          ...profile,
          phlebotomistId: profile.phlebotomistId || phByCode.docs[0].id,
          userCode: profile.userCode || String(phData.userCode || codeUpper),
          userCodeUpper: codeUpper,
        };
      }
    }
  }

  for (const empField of ['employeeId', 'userCodeUpper'] as const) {
    const empSnap = await db.collection('employees').where(empField, '==', codeUpper).limit(1).get();
    if (!empSnap.empty) {
      const empData = empSnap.docs[0].data() as Record<string, unknown>;
      if (empData.email) {
        return findProvisionedUserByEmail(String(empData.email));
      }
    }
  }

  return null;
}

export async function collectExistingAssignedCodes(): Promise<string[]> {
  const codes: string[] = [];
  const [dirSnap, labsSnap, phSnap, empSnap] = await Promise.all([
    db.collection('user_directory').get(),
    db.collection('labs').get(),
    db.collection('phlebotomists').get(),
    db.collection('employees').get(),
  ]);
  dirSnap.docs.forEach((d) => {
    const u = d.data() as Partial<UserProfile>;
    if (u.userCode) codes.push(u.userCode);
    if (u.employeeId) codes.push(u.employeeId);
    if (u.labId) codes.push(u.labId);
    if (u.phlebotomistId) codes.push(u.phlebotomistId);
  });
  labsSnap.docs.forEach((d) => {
    codes.push(d.id);
    const data = d.data() as Record<string, unknown>;
    if (data.userCode) codes.push(String(data.userCode));
  });
  phSnap.docs.forEach((d) => {
    codes.push(d.id);
    const data = d.data() as Record<string, unknown>;
    if (data.userCode) codes.push(String(data.userCode));
  });
  empSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (data.employeeId) codes.push(String(data.employeeId));
    if (data.userCode) codes.push(String(data.userCode));
  });
  return codes;
}

async function ensureUserCodeOnProfile(profile: UserProfile): Promise<string> {
  if (profile.userCode?.trim()) {
    return normalizeIdentifierCode(profile.userCode);
  }
  if (normalizeEmail(profile.email) === ADMIN_EMAIL || profile.isSuperAdmin) {
    return 'USR-ADM-1001';
  }
  const preferred =
    profile.employeeId?.trim() || profile.labId?.trim() || profile.phlebotomistId?.trim() || '';
  if (preferred) {
    return normalizeIdentifierCode(preferred);
  }
  const existingCodes = await collectExistingAssignedCodes();
  return normalizeIdentifierCode(
    generateRoleAssignedId({
      role: profile.role,
      centerType: profile.parentLabId ? 'COLLECTION_CENTER' : undefined,
      isEmployee: profile.role === UserRole.ADMIN && !profile.isSuperAdmin,
      existingCodes,
    })
  );
}

export async function listProvisionedUsers(): Promise<UserProfile[]> {
  const snap = await db.collection('user_directory').orderBy('createdAt', 'desc').get();
  return snap.docs.map((d) => d.data() as UserProfile);
}

async function resolveLabIdForEmailIfMissing(
  role: UserRole,
  email: string,
  explicitLabId?: string
): Promise<string | undefined> {
  if (explicitLabId?.trim()) return explicitLabId.trim();
  if (role !== UserRole.SMALL_LAB && role !== UserRole.LARGE_LAB) return undefined;
  const labsSnap = await db
    .collection('labs')
    .where('email', '==', normalizeEmail(email))
    .limit(1)
    .get();
  if (!labsSnap.empty) {
    return labsSnap.docs[0].id;
  }
  return undefined;
}

async function resolvePhleboIdForEmailIfMissing(
  role: UserRole,
  email: string,
  explicitPhleboId?: string
): Promise<string | undefined> {
  if (explicitPhleboId?.trim()) return explicitPhleboId.trim();
  if (role !== UserRole.PHLEBOTOMIST) return undefined;
  const snap = await db
    .collection('phlebotomists')
    .where('email', '==', normalizeEmail(email))
    .limit(1)
    .get();
  if (!snap.empty) {
    return snap.docs[0].id;
  }
  return undefined;
}

async function countActiveSuperAdmins(): Promise<UserProfile[]> {
  const dirSnap = await db
    .collection('user_directory')
    .where('role', '==', UserRole.ADMIN)
    .get();
  return dirSnap.docs
    .map((d) => d.data() as UserProfile)
    .filter((u) => isEffectiveSuperAdmin(u, ADMIN_EMAIL));
}

function assertPrivilegeAssignmentAllowed(
  payload: {
    role?: UserRole;
    adminSubRole?: UserProfile['adminSubRole'];
    isSuperAdmin?: boolean;
    founderRoles?: FounderRoleCode[];
    permissions?: PermissionCode[];
  },
  actor?: ActorContext
): void {
  if (actor?.isSuperAdmin) return;
  const requestedPrivileged =
    payload.isSuperAdmin === true ||
    payload.adminSubRole === 'SUPER_ADMIN' ||
    payload.founderRoles?.includes('SUPER_ADMIN') ||
    payload.permissions?.includes('FULL_PLATFORM_CONTROL') ||
    payload.permissions?.includes('MANAGE_FOUNDER_SEATS') ||
    payload.permissions?.includes('MANAGE_SYSTEM_SECURITY') ||
    payload.permissions?.includes('APPROVE_SENSITIVE_ACTIONS');

  if (requestedPrivileged) {
    throw new AppError(
      'Only an active Super Admin can grant Super Admin or sensitive system security privileges.',
      403,
      'PRIVILEGE_ESCALATION_BLOCKED'
    );
  }
}

async function loadOrgReportingContext(): Promise<{
  departments: Array<{ id: string; name: string; shortName?: string; headName: string; headEmail?: string }>;
  founderSeats: Array<{
    seatKey: 'VIKAS' | 'ASHWANI' | 'AKASH' | 'VISHAL';
    founderName: string;
    assignedEmail?: string;
    isSuperAdmin: boolean;
    founderRoles: FounderRoleCode[];
    primaryDepartmentId: 'FINANCE_BUSINESS' | 'OPERATIONS_PARTNERSHIPS' | 'MARKETING_GROWTH' | 'PRODUCT_TECHNOLOGY';
  }>;
}> {
  try {
    const [deptSnap, seatSnap] = await Promise.all([
      db.collection('departments').get(),
      db.collection('founder_seats').get(),
    ]);
    const departments = deptSnap.empty
      ? DEFAULT_DEPARTMENTS
      : deptSnap.docs.map(
        (d) =>
          d.data() as {
            id: string;
            name: string;
            shortName?: string;
            headName: string;
            headEmail?: string;
          }
      );
    const founderSeats = seatSnap.empty
      ? buildDefaultFounderSeats(ADMIN_EMAIL)
      : seatSnap.docs.map(
        (d) =>
          d.data() as {
            seatKey: 'VIKAS' | 'ASHWANI' | 'AKASH' | 'VISHAL';
            founderName: string;
            assignedEmail?: string;
            isSuperAdmin: boolean;
            founderRoles: FounderRoleCode[];
            primaryDepartmentId: 'FINANCE_BUSINESS' | 'OPERATIONS_PARTNERSHIPS' | 'MARKETING_GROWTH' | 'PRODUCT_TECHNOLOGY';
          }
      );
    return { departments, founderSeats };
  } catch {
    return {
      departments: DEFAULT_DEPARTMENTS,
      founderSeats: buildDefaultFounderSeats(ADMIN_EMAIL),
    };
  }
}

export async function createOrUpdateManagedUser(
  payload: CreateManagedUserPayload,
  actor?: ActorContext
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
  const initialPasswordTrimmed = payload.password ? payload.password.trim() : '';
  if (initialPasswordTrimmed && initialPasswordTrimmed.length < 6) {
    throw new AppError('Initial password must be at least 6 characters long.', 400, 'WEAK_PASSWORD');
  }
  const hasInitialPassword = initialPasswordTrimmed.length >= 6;

  assertPrivilegeAssignmentAllowed(payload, actor);

  const existingDir = await findProvisionedUserByEmail(normalized);
  if (existingDir && isEffectiveSuperAdmin(existingDir, ADMIN_EMAIL)) {
    if (payload.isActive === false || payload.role !== UserRole.ADMIN) {
      const superAdmins = await countActiveSuperAdmins();
      if (superAdmins.length <= 1 && superAdmins.some((s) => s.email === normalized)) {
        throw new AppError(
          'Cannot deactivate or remove the last active Super Admin. Transfer Super Admin access first.',
          400,
          'LAST_SUPER_ADMIN_LOCKOUT'
        );
      }
    }
  }

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(normalized);
    uid = existing.uid;
    await auth.updateUser(uid, {
      displayName: payload.displayName.trim(),
      disabled: payload.isActive === false,
      ...(hasInitialPassword ? { password: initialPasswordTrimmed } : {}),
    });
  } catch (err: unknown) {
    const fbErr = err as { code?: string };
    if (fbErr.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email: normalized,
        displayName: payload.displayName.trim(),
        emailVerified: true,
        disabled: payload.isActive === false,
        ...(hasInitialPassword ? { password: initialPasswordTrimmed } : {}),
      });
      uid = created.uid;
    } else {
      throw err;
    }
  }

  const resolvedLabId = await resolveLabIdForEmailIfMissing(payload.role, normalized, payload.labId);
  const resolvedPhleboId = await resolvePhleboIdForEmailIfMissing(
    payload.role,
    normalized,
    payload.phlebotomistId
  );

  const resolvedAdminSubRole =
    payload.role === UserRole.ADMIN
      ? payload.adminSubRole || (payload.isSuperAdmin ? 'SUPER_ADMIN' : 'DEPARTMENT_EMPLOYEE')
      : undefined;
  const resolvedParentLabId =
    payload.role === UserRole.LARGE_LAB && payload.parentLabId?.trim()
      ? payload.parentLabId.trim()
      : undefined;

  const isSuper =
    payload.role === UserRole.ADMIN &&
    (payload.isSuperAdmin === true ||
      resolvedAdminSubRole === 'SUPER_ADMIN' ||
      payload.founderRoles?.includes('SUPER_ADMIN'));

  const inferredPrimaryDeptId =
    payload.role === UserRole.ADMIN
      ? payload.primaryDepartmentId || inferDepartmentIdForSubRole(resolvedAdminSubRole)
      : undefined;

  const { departments, founderSeats } = await loadOrgReportingContext();
  const resolvedManager = resolveReportingManagerForRole({
    role: payload.role,
    adminSubRole: resolvedAdminSubRole,
    isSuperAdmin: isSuper,
    founderRoles: payload.founderRoles,
    primaryDepartmentId: inferredPrimaryDeptId,
    targetEmail: normalized,
    departments,
    founderSeats,
    rootAdminEmail: ADMIN_EMAIL,
  });

  const preferredCode =
    payload.userCode?.trim() ||
    existingDir?.userCode?.trim() ||
    (payload.role === UserRole.ADMIN && payload.employeeId?.trim() ? payload.employeeId.trim() : '') ||
    ((payload.role === UserRole.SMALL_LAB || payload.role === UserRole.LARGE_LAB) && resolvedLabId
      ? resolvedLabId
      : '') ||
    (payload.role === UserRole.PHLEBOTOMIST && resolvedPhleboId ? resolvedPhleboId : '');

  const existingCodes = preferredCode ? [] : await collectExistingAssignedCodes();
  const assignedUserCode = normalizeIdentifierCode(
    preferredCode ||
    generateRoleAssignedId({
      role: payload.role,
      centerType: resolvedParentLabId ? 'COLLECTION_CENTER' : undefined,
      isEmployee: payload.role === UserRole.ADMIN && !isSuper,
      existingCodes,
    })
  );

  const now = new Date().toISOString();
  const profile: UserProfile = {
    id: uid,
    email: normalized,
    userCode: assignedUserCode,
    userCodeUpper: assignedUserCode,
    displayName: payload.displayName.trim(),
    ...(payload.phoneNumber?.trim() ? { phoneNumber: payload.phoneNumber.trim() } : {}),
    role: payload.role,
    ...(resolvedAdminSubRole ? { adminSubRole: resolvedAdminSubRole } : {}),
    ...(payload.role === UserRole.ADMIN ? { isSuperAdmin: Boolean(isSuper) } : {}),
    ...(Array.isArray(payload.founderRoles) && payload.founderRoles.length > 0
      ? { founderRoles: payload.founderRoles }
      : {}),
    ...(payload.founderSeatKey ? { founderSeatKey: payload.founderSeatKey } : {}),
    ...(payload.employeeId
      ? { employeeId: payload.employeeId }
      : payload.role === UserRole.ADMIN && !isSuper && assignedUserCode.startsWith('EMP-')
        ? { employeeId: assignedUserCode }
        : {}),
    ...(inferredPrimaryDeptId ? { primaryDepartmentId: inferredPrimaryDeptId } : {}),
    ...(Array.isArray(payload.departmentIds) && payload.departmentIds.length > 0
      ? { departmentIds: payload.departmentIds }
      : inferredPrimaryDeptId
        ? { departmentIds: [inferredPrimaryDeptId] }
        : {}),
    ...(payload.designationId ? { designationId: payload.designationId } : {}),
    ...(payload.designationTitle ? { designationTitle: payload.designationTitle } : {}),
    ...(payload.role === UserRole.ADMIN && resolvedManager.reportingManagerEmail
      ? { reportingManagerEmail: resolvedManager.reportingManagerEmail }
      : {}),
    ...(payload.role === UserRole.ADMIN && resolvedManager.reportingManagerName
      ? { reportingManagerName: resolvedManager.reportingManagerName }
      : {}),
    ...(Array.isArray(payload.responsibilities)
      ? { responsibilities: payload.responsibilities }
      : {}),
    ...(Array.isArray(payload.permissions) ? { permissions: payload.permissions } : {}),
    ...(payload.assignedCity ? { assignedCity: payload.assignedCity } : {}),
    ...(payload.assignedZone ? { assignedZone: payload.assignedZone } : {}),
    ...(payload.joiningDate ? { joiningDate: payload.joiningDate } : {}),
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedParentLabId ? { parentLabId: resolvedParentLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
    isActive: payload.isActive !== false,
    createdByAdmin: true,
    ...(hasInitialPassword
      ? {
        initialPasswordSet: true,
        initialPasswordUpdatedAt: now,
        initialPasswordUpdatedBy: actor?.email || ADMIN_EMAIL,
        mustChangePassword: true,
      }
      : existingDir?.initialPasswordSet
        ? {
          initialPasswordSet: existingDir.initialPasswordSet,
          ...(existingDir.initialPasswordUpdatedAt
            ? { initialPasswordUpdatedAt: existingDir.initialPasswordUpdatedAt }
            : {}),
          ...(existingDir.initialPasswordUpdatedBy
            ? { initialPasswordUpdatedBy: existingDir.initialPasswordUpdatedBy }
            : {}),
          ...(typeof existingDir.mustChangePassword === 'boolean'
            ? { mustChangePassword: existingDir.mustChangePassword }
            : {}),
        }
        : { initialPasswordSet: false }),
    createdAt: existingDir?.createdAt || now,
    updatedAt: now,
  };

  if (profile.role === UserRole.ADMIN) {
    profile.permissions = resolveEffectivePermissions(profile, ADMIN_EMAIL);
  }

  const compactClaims = buildCompactCustomClaims(profile, ADMIN_EMAIL);
  await auth.setCustomUserClaims(uid, compactClaims);

  await db.collection('users').doc(uid).set(profile, { merge: true });
  await db.collection('user_directory').doc(normalized).set(profile, { merge: true });

  if (resolvedLabId) {
    const labSnap = await db.collection('labs').doc(resolvedLabId).get();
    if (labSnap.exists && (!labSnap.data()?.userCode || hasInitialPassword)) {
      await labSnap.ref.set(
        {
          ...(!labSnap.data()?.userCode
            ? { userCode: assignedUserCode, userCodeUpper: assignedUserCode }
            : {}),
          ...(hasInitialPassword
            ? { initialPasswordSet: true, initialPasswordUpdatedAt: now }
            : {}),
          updatedAt: now,
        },
        { merge: true }
      );
    }
  }
  if (resolvedPhleboId) {
    const phSnap = await db.collection('phlebotomists').doc(resolvedPhleboId).get();
    if (phSnap.exists && !phSnap.data()?.userCode) {
      await phSnap.ref.set(
        { userCode: assignedUserCode, userCodeUpper: assignedUserCode, updatedAt: now },
        { merge: true }
      );
    }
  }

  await recordAuditLog({
    actorUid: actor?.uid,
    actorEmail: actor?.email,
    actorName: actor?.displayName,
    actorRole: actor?.role || 'ADMIN',
    action: existingDir ? 'USER_UPDATED' : 'USER_PROVISIONED',
    resourceType: 'USER_DIRECTORY',
    resourceId: normalized,
    ...(profile.primaryDepartmentId ? { departmentId: profile.primaryDepartmentId } : {}),
    severity: isSuper ? 'CRITICAL' : 'SENSITIVE',
    summary: `${existingDir ? 'Updated' : 'Created'} ${ROLE_LABELS[profile.role]} account for ${normalized} (ID: ${assignedUserCode})`,
    details: {
      role: profile.role,
      userCode: assignedUserCode,
      adminSubRole: profile.adminSubRole || null,
      primaryDepartmentId: profile.primaryDepartmentId || null,
      isSuperAdmin: Boolean(profile.isSuperAdmin),
    },
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  await sendPlatformNotification({
    title: `Welcome to LabSetu — ${ROLE_LABELS[payload.role]} Account Ready (${assignedUserCode})`,
    message: `Hello ${profile.displayName}, Admin has created your ${ROLE_LABELS[payload.role]} account (${normalized} | Assigned Login ID: ${assignedUserCode}). ${payload.role === UserRole.PHLEBOTOMIST
        ? `Please open the LabSetu Mobile App and sign in using Email OTP${payload.password ? ' or your Password using your Email or Assigned ID' : ''}.`
        : `You can sign in using Google Sign-In, Email OTP${payload.password ? ', or your Email/Assigned ID and Password' : ''}.`
      }`,
    category: NotificationCategory.SYSTEM_ALERT,
    priority: NotificationPriority.NORMAL,
    recipientEmail: normalized,
    ...(uid ? { recipientUid: uid } : {}),
    recipientRole: payload.role,
    ...(profile.labId ? { labId: profile.labId } : {}),
    templateType: 'ACCOUNT_WELCOME',
    metadata: {
      displayName: profile.displayName,
      email: normalized,
      userCode: assignedUserCode,
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
    isSuperAdmin?: boolean;
    founderRoles?: FounderRoleCode[];
    primaryDepartmentId?: string;
    departmentIds?: string[];
    designationId?: string;
    designationTitle?: string;
    permissions?: PermissionCode[];
    labId?: string;
    parentLabId?: string;
    phlebotomistId?: string;
  },
  actor?: ActorContext
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

  assertPrivilegeAssignmentAllowed(updates, actor);

  if (isEffectiveSuperAdmin(profile, ADMIN_EMAIL)) {
    const demotingOrDisabling =
      updates.isActive === false ||
      (updates.role && updates.role !== UserRole.ADMIN) ||
      updates.isSuperAdmin === false;
    if (demotingOrDisabling) {
      const activeSuperAdmins = await countActiveSuperAdmins();
      if (
        activeSuperAdmins.length <= 1 &&
        activeSuperAdmins.some((s) => s.email === normalizeEmail(profile!.email))
      ) {
        throw new AppError(
          'Cannot deactivate or demote the last active Super Admin.',
          400,
          'LAST_SUPER_ADMIN_LOCKOUT'
        );
      }
    }
  }

  const nextRole = updates.role ?? profile.role;
  const nextAdminSubRole =
    nextRole === UserRole.ADMIN
      ? updates.adminSubRole !== undefined
        ? updates.adminSubRole
        : profile.adminSubRole || 'DEPARTMENT_EMPLOYEE'
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

  const nextPrimaryDepartmentId =
    updates.primaryDepartmentId !== undefined
      ? updates.primaryDepartmentId
      : profile.primaryDepartmentId ||
      (nextRole === UserRole.ADMIN ? inferDepartmentIdForSubRole(nextAdminSubRole) : undefined);

  const nextIsSuperAdmin =
    nextRole === UserRole.ADMIN
      ? updates.isSuperAdmin !== undefined
        ? updates.isSuperAdmin
        : nextAdminSubRole === 'SUPER_ADMIN'
          ? true
          : profile.isSuperAdmin
      : false;

  const { departments, founderSeats } = await loadOrgReportingContext();
  const autoManager =
    nextRole === UserRole.ADMIN
      ? resolveReportingManagerForRole({
        role: nextRole,
        adminSubRole: nextAdminSubRole,
        isSuperAdmin: nextIsSuperAdmin,
        founderRoles: updates.founderRoles ?? profile.founderRoles,
        primaryDepartmentId: nextPrimaryDepartmentId,
        targetEmail: profile.email,
        departments,
        founderSeats,
        rootAdminEmail: ADMIN_EMAIL,
      })
      : null;

  const nextProfile: UserProfile = {
    ...profile,
    isActive: updates.isActive ?? profile.isActive,
    role: nextRole,
    ...(nextAdminSubRole ? { adminSubRole: nextAdminSubRole } : {}),
    ...(nextRole === UserRole.ADMIN ? { isSuperAdmin: Boolean(nextIsSuperAdmin) } : {}),
    ...(updates.founderRoles !== undefined ? { founderRoles: updates.founderRoles } : {}),
    ...(nextPrimaryDepartmentId ? { primaryDepartmentId: nextPrimaryDepartmentId } : {}),
    ...(updates.departmentIds !== undefined
      ? { departmentIds: updates.departmentIds }
      : nextPrimaryDepartmentId
        ? { departmentIds: [nextPrimaryDepartmentId] }
        : {}),
    ...(updates.designationId !== undefined ? { designationId: updates.designationId } : {}),
    ...(updates.designationTitle !== undefined
      ? { designationTitle: updates.designationTitle }
      : {}),
    ...(autoManager?.reportingManagerName
      ? { reportingManagerName: autoManager.reportingManagerName }
      : {}),
    ...(autoManager?.reportingManagerEmail !== undefined
      ? { reportingManagerEmail: autoManager.reportingManagerEmail }
      : {}),
    ...(updates.permissions !== undefined ? { permissions: updates.permissions } : {}),
    ...(nextLabId ? { labId: nextLabId } : {}),
    ...(nextParentLabId ? { parentLabId: nextParentLabId } : {}),
    ...(nextPhleboId ? { phlebotomistId: nextPhleboId } : {}),
    updatedAt: new Date().toISOString(),
  };

  if (nextProfile.role === UserRole.ADMIN) {
    nextProfile.permissions = resolveEffectivePermissions(nextProfile, ADMIN_EMAIL);
  }

  try {
    await auth.updateUser(nextProfile.id, { disabled: !nextProfile.isActive });
    await auth.setCustomUserClaims(
      nextProfile.id,
      buildCompactCustomClaims(nextProfile, ADMIN_EMAIL)
    );
    if (!nextProfile.isActive || updates.role || updates.isSuperAdmin !== undefined || updates.permissions) {
      await auth.revokeRefreshTokens(nextProfile.id);
    }
  } catch (err) {
    console.warn('Auth sync warning in updateManagedUserStatus:', err);
  }

  await db.collection('users').doc(nextProfile.id).set(nextProfile, { merge: true });
  await db
    .collection('user_directory')
    .doc(normalizeEmail(nextProfile.email))
    .set(nextProfile, { merge: true });

  await recordAuditLog({
    actorUid: actor?.uid,
    actorEmail: actor?.email,
    actorName: actor?.displayName,
    actorRole: actor?.role || 'ADMIN',
    action: 'USER_STATUS_OR_ROLE_UPDATED',
    resourceType: 'USER_DIRECTORY',
    resourceId: normalizeEmail(nextProfile.email),
    departmentId: nextProfile.primaryDepartmentId,
    severity: 'SENSITIVE',
    summary: `Updated status/access for ${nextProfile.email} (active=${nextProfile.isActive}, role=${nextProfile.role})`,
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  return nextProfile;
}

export async function setManagedUserInitialPassword(
  identifier: string,
  newPassword: string,
  opts?: { mustChangePassword?: boolean; sendNotificationEmail?: boolean },
  actor?: ActorContext
): Promise<{ profile: UserProfile; passwordUpdatedAt: string }> {
  const cleanPwd = String(newPassword || '').trim();
  if (cleanPwd.length < 6) {
    throw new AppError('Initial password must be at least 6 characters long.', 400, 'WEAK_PASSWORD');
  }

  const cleanId = String(identifier || '').trim();
  let profile: UserProfile | null = null;
  if (cleanId.includes('@')) {
    profile = await findProvisionedUserByEmail(cleanId);
  } else {
    const snap = await db.collection('users').doc(cleanId).get();
    if (snap.exists) profile = snap.data() as UserProfile;
    if (!profile) {
      const codeSnap = await db
        .collection('user_directory')
        .where('userCodeUpper', '==', normalizeIdentifierCode(cleanId))
        .limit(1)
        .get();
      if (!codeSnap.empty) profile = codeSnap.docs[0].data() as UserProfile;
    }
  }

  if (!profile) {
    throw new AppError(`Managed user not found: ${identifier}`, 404, 'NOT_FOUND');
  }

  if (isEffectiveSuperAdmin(profile, ADMIN_EMAIL) && !actor?.isSuperAdmin) {
    throw new AppError(
      'Only an active Super Admin can update a Super Admin password.',
      403,
      'PRIVILEGE_ESCALATION_BLOCKED'
    );
  }

  const now = new Date().toISOString();
  const normalized = normalizeEmail(profile.email);
  let targetUid = profile.id;

  try {
    const fbUser = await auth.getUserByEmail(normalized);
    targetUid = fbUser.uid;
    await auth.updateUser(targetUid, { password: cleanPwd });
  } catch (err: unknown) {
    const fbErr = err as { code?: string };
    if (fbErr.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email: normalized,
        displayName: profile.displayName || normalized.split('@')[0],
        emailVerified: true,
        disabled: profile.isActive === false,
        password: cleanPwd,
      });
      targetUid = created.uid;
    } else {
      throw err;
    }
  }

  await auth.setCustomUserClaims(targetUid, buildCompactCustomClaims(profile, ADMIN_EMAIL));
  if (actor?.uid && targetUid !== actor.uid) {
    await auth.revokeRefreshTokens(targetUid);
  }

  const updatedProfile: UserProfile = {
    ...profile,
    id: targetUid,
    initialPasswordSet: true,
    initialPasswordUpdatedAt: now,
    initialPasswordUpdatedBy: actor?.email || ADMIN_EMAIL,
    mustChangePassword: opts?.mustChangePassword !== false,
    updatedAt: now,
  };

  await db.collection('users').doc(targetUid).set(updatedProfile, { merge: true });
  await db.collection('user_directory').doc(normalized).set(updatedProfile, { merge: true });
  if (updatedProfile.labId) {
    const labSnap = await db.collection('labs').doc(updatedProfile.labId).get();
    if (labSnap.exists) {
      await labSnap.ref.set(
        { initialPasswordSet: true, initialPasswordUpdatedAt: now, updatedAt: now },
        { merge: true }
      );
    }
  }

  await recordAuditLog({
    actorUid: actor?.uid,
    actorEmail: actor?.email,
    actorName: actor?.displayName,
    actorRole: actor?.role || 'ADMIN',
    action: 'INITIAL_PASSWORD_SET',
    resourceType: 'USER_DIRECTORY',
    resourceId: normalized,
    departmentId: updatedProfile.primaryDepartmentId,
    severity: 'SENSITIVE',
    summary: `Initial password configured/updated for ${normalized} (${updatedProfile.userCode || updatedProfile.id})`,
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  if (opts?.sendNotificationEmail !== false) {
    await sendPlatformNotification({
      title: `Your LabSetu Login Password Is Ready (${updatedProfile.userCode || updatedProfile.id})`,
      message: `Hello ${updatedProfile.displayName}, an initial sign-in password has been configured for your ${ROLE_LABELS[updatedProfile.role]} account (${normalized}). Contact your administrator for your temporary sign-in password and change it after logging in.`,
      category: NotificationCategory.SYSTEM_ALERT,
      priority: NotificationPriority.NORMAL,
      recipientEmail: normalized,
      ...(targetUid ? { recipientUid: targetUid } : {}),
      recipientRole: updatedProfile.role,
      templateType: 'OPERATIONAL_NOTIFICATION',
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });
  }

  return { profile: updatedProfile, passwordUpdatedAt: now };
}

export async function provisionBranchCenterFacility(
  payload: {
    parentLabId: string;
    name: string;
    city: string;
    address: string;
    pincode?: string;
    latitude: number;
    longitude: number;
    serviceRadiusKm?: number;
    phone?: string;
    nablNumber?: string;
    createSeparateLogin?: boolean;
    email?: string;
    password?: string;
    managerName?: string;
  },
  actor?: ActorContext
): Promise<{
  branchId: string;
  lab: Record<string, unknown>;
  profile: UserProfile | null;
}> {
  const parentId = String(payload.parentLabId || '').trim();
  if (!parentId) {
    throw new AppError('Parent Large Lab HQ ID is required.', 400, 'BAD_REQUEST');
  }
  const parentSnap = await db.collection('labs').doc(parentId).get();
  if (!parentSnap.exists) {
    throw new AppError(`Parent Reference Lab Hub not found: ${parentId}`, 404, 'NOT_FOUND');
  }
  const parentLab = parentSnap.data() as Record<string, unknown>;
  if (parentLab.type !== 'LARGE_LAB' || parentLab.centerType === 'COLLECTION_CENTER') {
    throw new AppError(
      'Branches can only be registered under a Large Reference Lab Main Hub.',
      400,
      'INVALID_PARENT_HUB'
    );
  }

  const branchName = String(payload.name || '').trim();
  if (!branchName) {
    throw new AppError('Branch / Collection Center name is required.', 400, 'BAD_REQUEST');
  }

  const zonesSnap = await db.collection('service_zones').get();
  const zones = zonesSnap.empty
    ? DEFAULT_STARTER_SERVICE_ZONES
    : zonesSnap.docs.map((d) => d.data() as (typeof DEFAULT_STARTER_SERVICE_ZONES)[number]);

  const lat = Number(payload.latitude) || Number(parentLab.latitude) || 19.124;
  const lng = Number(payload.longitude) || Number(parentLab.longitude) || 72.866;
  const coverage = evaluatePointServiceCoverage(zones, lat, lng, payload.pincode);

  const existingCodes = await collectExistingAssignedCodes();
  const branchId = normalizeIdentifierCode(
    generateRoleAssignedId({
      role: UserRole.LARGE_LAB,
      centerType: 'COLLECTION_CENTER',
      existingCodes,
    })
  );

  const cleanEmail = payload.email?.trim() ? normalizeEmail(payload.email) : '';
  const wantSeparateLogin = payload.createSeparateLogin !== false && Boolean(cleanEmail);
  if (payload.createSeparateLogin && !cleanEmail) {
    throw new AppError(
      'Please enter a branch login email to create a separate Branch Portal account.',
      400,
      'BAD_REQUEST'
    );
  }

  if (wantSeparateLogin) {
    const existingDir = await findProvisionedUserByEmail(cleanEmail);
    if (
      existingDir &&
      (existingDir.role !== UserRole.LARGE_LAB ||
        (existingDir.parentLabId && existingDir.parentLabId !== parentId))
    ) {
      throw new AppError(
        `Email ${cleanEmail} is already assigned to another role or lab organization.`,
        409,
        'EMAIL_CONFLICT'
      );
    }
  }

  const now = new Date().toISOString();
  const hasInitialPassword = Boolean(payload.password && payload.password.trim().length >= 6);
  const labRecord: Record<string, unknown> = {
    id: branchId,
    userCode: branchId,
    userCodeUpper: branchId,
    name: branchName,
    type: 'LARGE_LAB',
    centerType: 'COLLECTION_CENTER',
    parentLabId: parentId,
    parentLabName: String(parentLab.name || parentId),
    city: String(payload.city || parentLab.city || 'Mumbai').trim(),
    address: String(payload.address || `${branchName}, ${payload.city || 'Mumbai'}`).trim(),
    ...(payload.pincode?.trim() ? { pincode: payload.pincode.trim() } : {}),
    latitude: lat,
    longitude: lng,
    serviceRadiusKm: Number(payload.serviceRadiusKm) || 15,
    ...(coverage.matchedZone
      ? {
        serviceZoneId: coverage.matchedZone.id,
        serviceZoneName: coverage.matchedZone.name,
      }
      : {}),
    email: cleanEmail || String(parentLab.email || ''),
    phone: String(payload.phone || parentLab.phone || '').trim(),
    nablNumber: String(payload.nablNumber || parentLab.nablNumber || 'NABL ISO 15189').trim(),
    verified: true,
    verificationStatus: 'VERIFIED',
    ...(hasInitialPassword
      ? { initialPasswordSet: true, initialPasswordUpdatedAt: now }
      : {}),
    cutoffWindow: String(parentLab.cutoffWindow || '08:30 PM Daily Cutoff'),
    rating: 5.0,
    courierEtaMins: 15,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('labs').doc(branchId).set(labRecord, { merge: true });

  let createdProfile: UserProfile | null = null;
  if (wantSeparateLogin) {
    createdProfile = await createOrUpdateManagedUser(
      {
        email: cleanEmail,
        displayName: (payload.managerName?.trim() || branchName).slice(0, 80),
        phoneNumber: payload.phone?.trim() || undefined,
        role: UserRole.LARGE_LAB,
        userCode: branchId,
        labId: branchId,
        parentLabId: parentId,
        password: payload.password?.trim() || undefined,
        isActive: true,
      },
      actor
    );
  }

  await recordAuditLog({
    actorUid: actor?.uid,
    actorEmail: actor?.email,
    actorName: actor?.displayName,
    actorRole: actor?.role || 'LARGE_LAB',
    action: 'BRANCH_FACILITY_PROVISIONED',
    resourceType: 'LAB_FACILITY',
    resourceId: branchId,
    severity: 'SENSITIVE',
    summary: `Registered branch ${branchName} (${branchId}) under HQ ${parentId}${createdProfile ? ` with dedicated login ${createdProfile.email}` : ''
      }`,
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  return { branchId, lab: labRecord, profile: createdProfile };
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
  identifier: string,
  portalRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE'
): Promise<{
  sent: boolean;
  deliveryMode: 'SMTP' | 'QUEUED_NO_SMTP';
  role: UserRole;
  maskedEmail: string;
}> {
  const cleanInput = String(identifier || '').trim();
  const usedEmail = isEmailIdentifier(cleanInput);
  const profile = await resolveProvisionedUserByIdentifier(cleanInput);

  if (!profile) {
    throw new AppError(
      usedEmail
        ? `Your email (${normalizeEmail(cleanInput)}) has not been added yet. Please ask your LabSetu Admin (${ADMIN_EMAIL}) to create your account first.`
        : `No LabSetu account was found for Login ID "${normalizeIdentifierCode(cleanInput)}". Check your assigned ID or sign in with your registered email.`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  const normalized = normalizeEmail(profile.email);
  const maskedEmail = maskEmailAddress(normalized);
  const displayTarget = usedEmail ? normalized : maskedEmail;

  if (!profile.isActive) {
    throw new AppError(
      `Your account (${displayTarget}) is currently paused. Please contact LabSetu Admin (${ADMIN_EMAIL}).`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  assertPlatformAccessPolicy(profile.role, portalRole, clientType);

  if (portalRole && profile.role !== portalRole) {
    throw new AppError(
      `Your account (${displayTarget}) is registered as ${ROLE_LABELS[profile.role]}, not ${ROLE_LABELS[portalRole]}.`,
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
    userCode: profile.userCode,
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
      return { sent: true, deliveryMode: 'SMTP', role: profile.role, maskedEmail };
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
  identifier: string,
  portalOrigin?: string,
  _clientType?: 'WEB' | 'MOBILE',
  actor?: ActorContext
): Promise<{
  sent: boolean;
  deliveryMode: 'SMTP';
  role: UserRole;
  roleLabel: string;
  maskedEmail: string;
}> {
  const cleanInput = String(identifier || '').trim();
  if (!cleanInput) {
    throw new AppError('Please enter your registered email address or Login ID.', 400, 'BAD_REQUEST');
  }

  const usedEmail = isEmailIdentifier(cleanInput);
  const profile = await resolveProvisionedUserByIdentifier(cleanInput);
  if (!profile) {
    throw new AppError(
      usedEmail
        ? `No LabSetu account was found for ${normalizeEmail(cleanInput)}. Please ask your LabSetu Admin (${ADMIN_EMAIL}) to add your email first.`
        : `No LabSetu account was found for Login ID "${normalizeIdentifierCode(cleanInput)}". Check your ID or contact your LabSetu Admin.`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  const normalized = normalizeEmail(profile.email);
  const maskedEmail = maskEmailAddress(normalized);
  const displayTarget = usedEmail ? normalized : maskedEmail;

  if (!profile.isActive) {
    throw new AppError(
      `Your account (${displayTarget}) is currently paused. Please contact LabSetu Admin (${ADMIN_EMAIL}).`,
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

  await auth.setCustomUserClaims(targetUid, buildCompactCustomClaims(profile, ADMIN_EMAIL));

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
    userCode: profile.userCode,
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

  await recordAuditLog({
    actorUid: actor?.uid || targetUid,
    actorEmail: actor?.email || normalized,
    actorName: actor?.displayName || profile.displayName,
    actorRole: actor?.role || profile.role,
    action: 'PASSWORD_RESET_LINK_SENT',
    resourceType: 'AUTH',
    resourceId: normalized,
    severity: 'SENSITIVE',
    summary: `Password setup/reset email delivered to ${normalized}`,
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  return {
    sent: true,
    deliveryMode: 'SMTP',
    role: profile.role,
    roleLabel: ROLE_LABELS[profile.role],
    maskedEmail,
  };
}

export async function loginWithIdentifierAndPassword(
  identifier: string,
  password: string,
  portalRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE',
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<{ customToken: string; userProfile: UserProfile }> {
  const cleanInput = String(identifier || '').trim();
  if (!cleanInput || !password) {
    throw new AppError('Login ID or email and password are required.', 400, 'BAD_REQUEST');
  }

  let profile = await resolveProvisionedUserByIdentifier(cleanInput);
  if (!profile) {
    throw new AppError('Invalid Login ID / email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const normalized = normalizeEmail(profile.email);
  const usedEmail = isEmailIdentifier(cleanInput);
  const displayTarget = usedEmail ? normalized : maskEmailAddress(normalized);

  if (!profile.isActive) {
    await recordLoginHistory({
      uid: profile.id || 'suspended',
      email: normalized,
      role: profile.role,
      ...(profile.primaryDepartmentId ? { departmentId: profile.primaryDepartmentId } : {}),
      clientType: clientType || 'WEB',
      authMethod: 'PASSWORD_IDENTIFIER',
      success: false,
      failureReason: 'ACCOUNT_SUSPENDED',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError(
      `Your account (${displayTarget}) is currently paused by LabSetu Admin.`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  assertPlatformAccessPolicy(profile.role, portalRole, clientType);

  if (portalRole && profile.role !== portalRole) {
    await recordLoginHistory({
      uid: profile.id,
      email: normalized,
      role: profile.role,
      ...(profile.primaryDepartmentId ? { departmentId: profile.primaryDepartmentId } : {}),
      clientType: clientType || 'WEB',
      authMethod: 'PASSWORD_IDENTIFIER',
      success: false,
      failureReason: 'ROLE_MISMATCH',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError(
      `Your account (${displayTarget}) is registered as ${ROLE_LABELS[profile.role]}, not ${ROLE_LABELS[portalRole]}.`,
      403,
      'ROLE_MISMATCH',
      { assignedRole: profile.role }
    );
  }

  const webApiKey = FIREBASE_WEB_API_KEY?.trim();
  if (!webApiKey) {
    throw new AppError(
      'Server password verification key is not configured. Please sign in with your email address or Email OTP.',
      503,
      'PASSWORD_LOGIN_UNCONFIGURED'
    );
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
      webApiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalized,
        password,
        returnSecureToken: false,
      }),
    }
  );

  if (!verifyRes.ok) {
    const errBody = (await verifyRes.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const fbMsg = errBody?.error?.message || 'INVALID_CREDENTIALS';
    await recordLoginHistory({
      uid: profile.id,
      email: normalized,
      role: profile.role,
      ...(profile.primaryDepartmentId ? { departmentId: profile.primaryDepartmentId } : {}),
      clientType: clientType || 'WEB',
      authMethod: 'PASSWORD_IDENTIFIER',
      success: false,
      failureReason: fbMsg,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    if (fbMsg.includes('TOO_MANY_ATTEMPTS')) {
      throw new AppError(
        'Too many unsuccessful sign-in attempts. Please wait a few minutes or use Email OTP.',
        429,
        'TOO_MANY_ATTEMPTS'
      );
    }
    throw new AppError('Invalid Login ID / email or password.', 401, 'INVALID_CREDENTIALS');
  }

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

  const resolvedLabId = await resolveLabIdForEmailIfMissing(profile.role, normalized, profile.labId);
  const resolvedPhleboId = await resolvePhleboIdForEmailIfMissing(
    profile.role,
    normalized,
    profile.phlebotomistId
  );
  const now = new Date().toISOString();
  const ensuredCode = await ensureUserCodeOnProfile({
    ...profile,
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
  });

  const enrichedProfile: UserProfile = {
    ...profile,
    id: targetUid,
    userCode: ensuredCode,
    userCodeUpper: ensuredCode,
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
    ...(profile.role === UserRole.ADMIN
      ? { permissions: resolveEffectivePermissions(profile, ADMIN_EMAIL) }
      : {}),
    lastLoginAt: now,
    updatedAt: now,
  };

  const claims = buildCompactCustomClaims(enrichedProfile, ADMIN_EMAIL);
  await auth.setCustomUserClaims(targetUid, claims);
  const customToken = await auth.createCustomToken(targetUid, claims);

  await db.collection('users').doc(targetUid).set(enrichedProfile, { merge: true });
  await db.collection('user_directory').doc(normalized).set(enrichedProfile, { merge: true });

  await recordLoginHistory({
    uid: targetUid,
    email: normalized,
    role: enrichedProfile.role,
    departmentId: enrichedProfile.primaryDepartmentId,
    clientType: clientType || 'WEB',
    authMethod: 'PASSWORD_IDENTIFIER',
    success: true,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  if (enrichedProfile.role === UserRole.ADMIN) {
    await ensureOrganisationBootstrapped(normalized).catch(() => { });
  }

  return { customToken, userProfile: enrichedProfile };
}

export async function verifyEmailOtp(
  identifier: string,
  otp: string,
  portalRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE',
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<{ customToken: string; userProfile: UserProfile }> {
  const cleanInput = String(identifier || '').trim();
  const usedEmail = isEmailIdentifier(cleanInput);
  const profile = await resolveProvisionedUserByIdentifier(cleanInput);

  if (!profile || !profile.isActive) {
    await recordLoginHistory({
      uid: 'unprovisioned',
      email: usedEmail ? normalizeEmail(cleanInput) : normalizeIdentifierCode(cleanInput),
      role: portalRole || 'UNKNOWN',
      clientType: clientType || 'WEB',
      authMethod: 'EMAIL_OTP',
      success: false,
      failureReason: !profile ? 'USER_NOT_PROVISIONED' : 'ACCOUNT_SUSPENDED',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError('Account not found or currently inactive.', 403, 'USER_NOT_PROVISIONED');
  }

  const normalized = normalizeEmail(profile.email);
  const displayTarget = usedEmail ? normalized : maskEmailAddress(normalized);

  assertPlatformAccessPolicy(profile.role, portalRole, clientType);

  if (portalRole && profile.role !== portalRole) {
    await recordLoginHistory({
      uid: profile.id,
      email: normalized,
      role: profile.role,
      ...(profile.primaryDepartmentId ? { departmentId: profile.primaryDepartmentId } : {}),
      clientType: clientType || 'WEB',
      authMethod: 'EMAIL_OTP',
      success: false,
      failureReason: 'ROLE_MISMATCH',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError(
      `Your account (${displayTarget}) is registered as ${ROLE_LABELS[profile.role]} and cannot open ${ROLE_LABELS[portalRole]}.`,
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
    await recordLoginHistory({
      uid: profile.id,
      email: normalized,
      role: profile.role,
      ...(profile.primaryDepartmentId ? { departmentId: profile.primaryDepartmentId } : {}),
      clientType: clientType || 'WEB',
      authMethod: 'EMAIL_OTP',
      success: false,
      failureReason: 'OTP_MISMATCH',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError('Incorrect OTP code. Please check your email and try again.', 401, 'OTP_MISMATCH');
  }

  await db.collection('email_otps').doc(normalized).set({ used: true }, { merge: true });

  const resolvedLabId = await resolveLabIdForEmailIfMissing(profile.role, normalized, profile.labId);
  const resolvedPhleboId = await resolvePhleboIdForEmailIfMissing(
    profile.role,
    normalized,
    profile.phlebotomistId
  );

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

  const now = new Date().toISOString();
  const ensuredCode = await ensureUserCodeOnProfile({
    ...profile,
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
  });
  const enrichedProfile: UserProfile = {
    ...profile,
    id: targetUid,
    userCode: ensuredCode,
    userCodeUpper: ensuredCode,
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
    ...(profile.role === UserRole.ADMIN
      ? { permissions: resolveEffectivePermissions(profile, ADMIN_EMAIL) }
      : {}),
    lastLoginAt: now,
    updatedAt: now,
  };

  const claims = buildCompactCustomClaims(enrichedProfile, ADMIN_EMAIL);
  await auth.setCustomUserClaims(targetUid, claims);
  const customToken = await auth.createCustomToken(targetUid, claims);

  await db.collection('users').doc(targetUid).set(enrichedProfile, { merge: true });
  await db.collection('user_directory').doc(normalized).set(enrichedProfile, { merge: true });

  await recordLoginHistory({
    uid: targetUid,
    email: normalized,
    role: enrichedProfile.role,
    departmentId: enrichedProfile.primaryDepartmentId,
    clientType: clientType || 'WEB',
    authMethod: 'EMAIL_OTP',
    success: true,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  if (enrichedProfile.role === UserRole.ADMIN) {
    await ensureOrganisationBootstrapped(normalized).catch(() => { });
  }

  return { customToken, userProfile: enrichedProfile };
}

export async function verifyAndSyncSessionRole(
  uid: string,
  email: string | undefined,
  requiredRole?: UserRole,
  clientType?: 'WEB' | 'MOBILE',
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<UserProfile> {
  if (!email) {
    throw new AppError('Signed-in account does not include a verified email address.', 403, 'FORBIDDEN');
  }

  const normalized = normalizeEmail(email);
  const profile = await findProvisionedUserByEmail(normalized);

  if (!profile) {
    await recordLoginHistory({
      uid,
      email: normalized,
      role: requiredRole || 'UNKNOWN',
      clientType: clientType || 'WEB',
      authMethod: 'SESSION_VERIFY',
      success: false,
      failureReason: 'USER_NOT_PROVISIONED',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError(
      `Your email (${normalized}) has not been added yet. Please ask LabSetu Admin (${ADMIN_EMAIL}) to create your account.`,
      403,
      'USER_NOT_PROVISIONED'
    );
  }

  if (!profile.isActive) {
    await recordLoginHistory({
      uid,
      email: normalized,
      role: profile.role,
      ...(profile.primaryDepartmentId ? { departmentId: profile.primaryDepartmentId } : {}),
      clientType: clientType || 'WEB',
      authMethod: 'SESSION_VERIFY',
      success: false,
      failureReason: 'ACCOUNT_SUSPENDED',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError(
      `Your account (${normalized}) is currently paused by LabSetu Admin.`,
      403,
      'ACCOUNT_SUSPENDED'
    );
  }

  assertPlatformAccessPolicy(profile.role, requiredRole, clientType);

  const resolvedLabId = await resolveLabIdForEmailIfMissing(profile.role, normalized, profile.labId);
  const resolvedPhleboId = await resolvePhleboIdForEmailIfMissing(
    profile.role,
    normalized,
    profile.phlebotomistId
  );

  const now = new Date().toISOString();
  const ensuredCode = await ensureUserCodeOnProfile({
    ...profile,
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
  });
  const syncedProfile: UserProfile = {
    ...profile,
    id: uid,
    userCode: ensuredCode,
    userCodeUpper: ensuredCode,
    ...(resolvedLabId ? { labId: resolvedLabId } : {}),
    ...(resolvedPhleboId ? { phlebotomistId: resolvedPhleboId } : {}),
    ...(profile.role === UserRole.ADMIN
      ? {
        isSuperAdmin: isEffectiveSuperAdmin(profile, ADMIN_EMAIL),
        permissions: resolveEffectivePermissions(profile, ADMIN_EMAIL),
      }
      : {}),
    lastLoginAt: now,
    updatedAt: now,
  };

  await auth.setCustomUserClaims(uid, buildCompactCustomClaims(syncedProfile, ADMIN_EMAIL));
  await db.collection('users').doc(uid).set(syncedProfile, { merge: true });
  await db.collection('user_directory').doc(normalized).set(syncedProfile, { merge: true });

  if (requiredRole && syncedProfile.role !== requiredRole) {
    await recordLoginHistory({
      uid,
      email: normalized,
      role: syncedProfile.role,
      departmentId: syncedProfile.primaryDepartmentId,
      clientType: clientType || 'WEB',
      authMethod: 'SESSION_VERIFY',
      success: false,
      failureReason: 'ROLE_MISMATCH',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw new AppError(
      `Access denied: Your account role is ${ROLE_LABELS[syncedProfile.role]}, which cannot open ${ROLE_LABELS[requiredRole]}.`,
      403,
      'ROLE_MISMATCH',
      { assignedRole: syncedProfile.role }
    );
  }

  await recordLoginHistory({
    uid,
    email: normalized,
    role: syncedProfile.role,
    departmentId: syncedProfile.primaryDepartmentId,
    clientType: clientType || 'WEB',
    authMethod: 'SESSION_VERIFY',
    success: true,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  if (syncedProfile.role === UserRole.ADMIN) {
    await ensureOrganisationBootstrapped(normalized).catch(() => { });
  }

  return syncedProfile;
}

export async function exchangeMobileGoogleSession(
  idToken: string,
  requiredRole: UserRole = UserRole.PHLEBOTOMIST,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<
  | { status: 'OK'; code: string; email: string }
  | {
    status: 'ERROR';
    errorCode: string;
    errorMessage: string;
    email?: string;
    assignedRole?: UserRole;
  }
> {
  const decoded = await auth.verifyIdToken(idToken);
  const email = decoded.email ? normalizeEmail(decoded.email) : '';
  if (!email) {
    return {
      status: 'ERROR',
      errorCode: 'EMAIL_REQUIRED',
      errorMessage: 'Your Google account did not share a verified email address.',
    };
  }

  try {
    const syncedProfile = await verifyAndSyncSessionRole(
      decoded.uid,
      email,
      requiredRole,
      'MOBILE',
      meta
    );

    const claims = buildCompactCustomClaims(syncedProfile, ADMIN_EMAIL);
    const customToken = await auth.createCustomToken(decoded.uid, claims);
    const code = crypto.randomBytes(24).toString('hex');

    await db
      .collection('mobile_auth_codes')
      .doc(code)
      .set({
        code,
        customToken,
        uid: decoded.uid,
        email: syncedProfile.email,
        role: syncedProfile.role,
        expiresAt: Date.now() + 3 * 60 * 1000,
        used: false,
        createdAt: new Date().toISOString(),
      });

    return {
      status: 'OK',
      code,
      email: syncedProfile.email,
    };
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const details = (err.details || {}) as { assignedRole?: UserRole };
      return {
        status: 'ERROR',
        errorCode: err.code,
        errorMessage: err.message,
        email,
        ...(details.assignedRole ? { assignedRole: details.assignedRole } : {}),
      };
    }
    throw err;
  }
}

export async function redeemMobileGoogleCode(
  code: string
): Promise<{ customToken: string }> {
  const cleanCode = String(code || '').trim();
  if (!cleanCode || cleanCode.length < 16) {
    throw new AppError('Invalid Google sign-in code. Please try again.', 400, 'INVALID_CODE');
  }

  const docRef = db.collection('mobile_auth_codes').doc(cleanCode);
  const customToken = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) {
      throw new AppError('Google sign-in session expired. Please try again.', 400, 'CODE_NOT_FOUND');
    }
    const data = snap.data() as {
      customToken?: string;
      expiresAt?: number;
      used?: boolean;
    };
    if (data.used) {
      throw new AppError('Google sign-in code already used. Please sign in again.', 400, 'CODE_USED');
    }
    if (!data.expiresAt || Date.now() > data.expiresAt || !data.customToken) {
      throw new AppError('Google sign-in session timed out. Please try again.', 400, 'CODE_EXPIRED');
    }
    tx.set(docRef, { used: true, redeemedAt: new Date().toISOString() }, { merge: true });
    return data.customToken;
  });

  return { customToken };
}

export async function syncFirebaseUserFromDirectory(
  emailId: string,
  afterData: Partial<UserProfile> | undefined
): Promise<void> {
  const normalized = normalizeEmail(afterData?.email || emailId);
  if (!normalized || !normalized.includes('@')) return;

  if (!afterData) {
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

  const compactClaims = buildCompactCustomClaims(
    { ...afterData, email: normalized } as Partial<UserProfile>,
    ADMIN_EMAIL
  );
  await auth.setCustomUserClaims(targetUid, compactClaims);

  const ensuredCode = afterData.userCode
    ? normalizeIdentifierCode(afterData.userCode)
    : await ensureUserCodeOnProfile({
      ...(afterData as UserProfile),
      email: normalized,
    });

  await db.collection('users').doc(targetUid).set(
    {
      ...afterData,
      id: targetUid,
      email: normalized,
      userCode: ensuredCode,
      userCodeUpper: ensuredCode,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}
