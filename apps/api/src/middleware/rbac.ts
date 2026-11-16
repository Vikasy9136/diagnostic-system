import { Request, Response, NextFunction } from 'express';
import {
  type AppErrorLogRecord,
  type AuditLogRecord,
  type CoreDepartmentId,
  deepCleanFirestorePayload,
  type FounderRoleCode,
  type LoginHistoryRecord,
  type PermissionCode,
  type UserCustomClaims,
  type UserProfile,
  UserRole,
  hasAnyPermission as sharedHasAnyPermission,
  hasPermission as sharedHasPermission,
  isSuperAdminUser as sharedIsSuperAdminUser,
  resolveEffectivePermissions,
} from '@diagnostic/shared';
import { config } from '../config/env';
import { AppError } from './errorHandler';
import { initializeFirebase } from '../config/firebase';
import { DEV_DATA_STORE } from '../services/devStore';

export interface AuthenticatedRequest extends Request {
  rawBody?: Buffer;
  user?: UserCustomClaims & {
    uid: string;
    email?: string;
    displayName?: string;
    isSuperAdmin: boolean;
    permissions: PermissionCode[];
    founderRoles?: FounderRoleCode[];
    primaryDepartmentId?: CoreDepartmentId | string;
    departmentIds?: string[];
    designationId?: string;
    profile?: UserProfile;
  };
}

export function getRequestClientMeta(req: Request): { ipAddress?: string; userAgent?: string } {
  const fwd = req.headers['x-forwarded-for'];
  const ipAddress = Array.isArray(fwd)
    ? fwd[0]
    : typeof fwd === 'string'
    ? fwd.split(',')[0].trim()
    : req.ip;
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 220) : undefined;
  return { ipAddress, userAgent };
}

export async function recordAuditLog(entry: {
  actorUid?: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  actorDepartmentId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  departmentId?: string;
  severity?: 'INFO' | 'SENSITIVE' | 'CRITICAL';
  summary: string;
  details?: Record<string, string | number | boolean | null | undefined>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const { db, isMockMode } = initializeFirebase();
  const createdAt = new Date().toISOString();
  const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const doc: AuditLogRecord = {
    id,
    actorUid: entry.actorUid || 'system',
    actorEmail: (entry.actorEmail || config.admin.email).trim().toLowerCase(),
    actorName: entry.actorName || entry.actorEmail || 'Platform System',
    actorRole: entry.actorRole || 'SYSTEM',
    ...(entry.actorDepartmentId ? { actorDepartmentId: entry.actorDepartmentId } : {}),
    action: entry.action,
    resourceType: entry.resourceType,
    ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
    ...(entry.departmentId ? { departmentId: entry.departmentId } : {}),
    severity: entry.severity || 'INFO',
    summary: entry.summary,
    ...(entry.details ? { details: entry.details } : {}),
    ...(entry.ipAddress ? { ipAddress: entry.ipAddress } : {}),
    ...(entry.userAgent ? { userAgent: entry.userAgent } : {}),
    createdAt,
  };

  try {
    if (db && !isMockMode) {
      await db.collection('audit_logs').doc(id).set(deepCleanFirestorePayload(doc));
    }
    DEV_DATA_STORE.auditLogs.unshift(doc);
    if (DEV_DATA_STORE.auditLogs.length > 250) DEV_DATA_STORE.auditLogs.length = 250;
  } catch (err) {
    console.warn('Non-fatal audit log write failed:', err);
  }
}

export async function recordLoginHistory(
  entry: Omit<LoginHistoryRecord, 'id' | 'createdAt'>
): Promise<void> {
  const { db, isMockMode } = initializeFirebase();
  const createdAt = new Date().toISOString();
  const id = `LGN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const doc: LoginHistoryRecord = deepCleanFirestorePayload({ id, ...entry, createdAt });

  try {
    if (db && !isMockMode) {
      await db.collection('login_history').doc(id).set(deepCleanFirestorePayload(doc));
    }
    DEV_DATA_STORE.loginHistory.unshift(doc);
    if (DEV_DATA_STORE.loginHistory.length > 250) DEV_DATA_STORE.loginHistory.length = 250;
  } catch (err) {
    console.warn('Non-fatal login history write failed:', err);
  }
}

export async function logAppError(
  entry: Omit<AppErrorLogRecord, 'id' | 'resolved' | 'createdAt'>
): Promise<void> {
  const { db, isMockMode } = initializeFirebase();
  const createdAt = new Date().toISOString();
  const id = `ERR-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const doc: AppErrorLogRecord = deepCleanFirestorePayload({ id, ...entry, resolved: false, createdAt });

  try {
    if (db && !isMockMode) {
      await db.collection('app_error_logs').doc(id).set(deepCleanFirestorePayload(doc));
    }
    DEV_DATA_STORE.appErrorLogs.unshift(doc);
    if (DEV_DATA_STORE.appErrorLogs.length > 200) DEV_DATA_STORE.appErrorLogs.length = 200;
  } catch (err) {
    console.warn('Non-fatal error log capture failed:', err);
  }
}

export function buildAuthenticatedUserFromProfile(
  uid: string,
  profile: UserProfile | null | undefined,
  tokenClaims?: Record<string, unknown>,
  isRootFallbackEmail?: boolean
): NonNullable<AuthenticatedRequest['user']> | null {
  if (!profile && !tokenClaims && !isRootFallbackEmail) return null;

  const role =
    profile?.role ||
    (tokenClaims?.role as UserRole | undefined) ||
    (isRootFallbackEmail ? UserRole.ADMIN : undefined);

  if (!role || !Object.values(UserRole).includes(role)) {
    return null;
  }

  const isSuper = profile
    ? sharedIsSuperAdminUser(profile)
    : Boolean(isRootFallbackEmail || tokenClaims?.isSuperAdmin || tokenClaims?.adminSubRole === 'SUPER_ADMIN');

  const permissions = profile
    ? resolveEffectivePermissions(profile)
    : isSuper
    ? resolveEffectivePermissions({
        role: UserRole.ADMIN,
        isSuperAdmin: true,
        adminSubRole: 'SUPER_ADMIN',
      })
    : [];

  return {
    uid,
    email: profile?.email || (typeof tokenClaims?.email === 'string' ? tokenClaims.email : undefined),
    displayName:
      profile?.displayName ||
      (typeof tokenClaims?.name === 'string' ? tokenClaims.name : undefined) ||
      profile?.email,
    role,
    adminSubRole:
      profile?.adminSubRole ||
      (tokenClaims?.adminSubRole as UserCustomClaims['adminSubRole']) ||
      (isSuper ? 'SUPER_ADMIN' : undefined),
    isSuperAdmin: isSuper,
    permissions,
    founderRoles: profile?.founderRoles,
    primaryDepartmentId: profile?.primaryDepartmentId || (tokenClaims?.primaryDepartmentId as string | undefined),
    departmentIds: profile?.departmentIds,
    designationId: profile?.designationId || (tokenClaims?.designationId as string | undefined),
    labId: profile?.labId || (tokenClaims?.labId as string | undefined),
    parentLabId: profile?.parentLabId || (tokenClaims?.parentLabId as string | undefined),
    phlebotomistId: profile?.phlebotomistId || (tokenClaims?.phlebotomistId as string | undefined),
    profile: profile || undefined,
  };
}

export function requireSuperAdmin() {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== UserRole.ADMIN || !req.user.isSuperAdmin) {
      return next(
        new AppError(
          'Super Admin authority is required for this action.',
          403,
          'SUPER_ADMIN_REQUIRED'
        )
      );
    }
    return next();
  };
}

export function requirePermissions(...required: PermissionCode[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== UserRole.ADMIN) {
      return next(new AppError('Admin staff access required.', 403, 'FORBIDDEN'));
    }
    if (req.user.isSuperAdmin) {
      return next();
    }
    const ok = required.every((perm) =>
      sharedHasPermission(
        {
          role: req.user!.role,
          isSuperAdmin: req.user!.isSuperAdmin,
          adminSubRole: req.user!.adminSubRole,
          permissions: req.user!.permissions,
        },
        perm
      )
    );
    if (!ok) {
      return next(
        new AppError(
          `Missing required permission: ${required.join(', ')}.`,
          403,
          'PERMISSION_DENIED',
          { requiredPermissions: required }
        )
      );
    }
    return next();
  };
}

export function requireAnyPermission(...allowed: PermissionCode[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== UserRole.ADMIN) {
      return next(new AppError('Admin staff access required.', 403, 'FORBIDDEN'));
    }
    if (req.user.isSuperAdmin) {
      return next();
    }
    const ok = sharedHasAnyPermission(
      {
        role: req.user.role,
        isSuperAdmin: req.user.isSuperAdmin,
        adminSubRole: req.user.adminSubRole,
        permissions: req.user.permissions,
      },
      allowed
    );
    if (!ok) {
      return next(
        new AppError(
          'You do not have sufficient departmental permission for this operation.',
          403,
          'PERMISSION_DENIED',
          { allowedPermissions: allowed }
        )
      );
    }
    return next();
  };
}

const RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

export function rateLimitByKey(bucketName: string, maxRequests: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const meta = getRequestClientMeta(req);
    const rawId =
      typeof req.body?.identifier === 'string'
        ? req.body.identifier
        : typeof req.body?.email === 'string'
        ? req.body.email
        : typeof req.query?.identifier === 'string'
        ? req.query.identifier
        : typeof req.query?.email === 'string'
        ? req.query.email
        : '';
    const identifier = rawId.trim().toLowerCase() || meta.ipAddress || 'unknown';
    const key = `${bucketName}:${identifier}`;
    const now = Date.now();
    const existing = RATE_BUCKETS.get(key);

    if (!existing || now > existing.resetAt) {
      RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
      if (RATE_BUCKETS.size > 4000) {
        for (const [k, v] of RATE_BUCKETS.entries()) {
          if (v.resetAt < now) RATE_BUCKETS.delete(k);
        }
      }
      return next();
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      return next(
        new AppError(
          'Too many requests in a short window. Please wait a moment before trying again.',
          429,
          'RATE_LIMITED'
        )
      );
    }
    return next();
  };
}
