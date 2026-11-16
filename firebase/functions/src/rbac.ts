import { NextFunction, Request, Response } from 'express';
import {
  type AuditLogRecord,
  type LoginHistoryRecord,
  type PermissionCode,
  type UserCustomClaims,
  type UserProfile,
  UserRole,
} from './types';
import { ADMIN_EMAIL, AppError, auth, db } from './firebaseAdmin';
import {
  hasAnyPermission,
  hasPermission,
  isEffectiveSuperAdmin,
  resolveEffectivePermissions,
} from './orgConstants';

export interface AuthenticatedRequest extends Request {
  user?: UserCustomClaims & {
    uid: string;
    email?: string;
    displayName?: string;
    isSuperAdmin: boolean;
    permissions: PermissionCode[];
    profile?: UserProfile;
  };
  rawBody?: Buffer;
}

const RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

export function rateLimitByKey(bucketPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip =
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.ip ||
      'unknown';
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
    const emailPart = rawId.trim().toLowerCase();
    const key = `${bucketPrefix}:${ip}:${emailPart}`;
    const now = Date.now();
    const existing = RATE_BUCKETS.get(key);

    if (!existing || now > existing.resetAt) {
      RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
      if (RATE_BUCKETS.size > 4000) {
        for (const [k, v] of RATE_BUCKETS.entries()) {
          if (now > v.resetAt) RATE_BUCKETS.delete(k);
        }
      }
      return next();
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      return next(
        new AppError(
          'Too many requests in a short window. Please wait a minute before trying again.',
          429,
          'RATE_LIMITED'
        )
      );
    }
    return next();
  };
}

export function getRequestClientMeta(req: Request): { ipAddress?: string; userAgent?: string } {
  const ipAddress =
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || undefined;
  const userAgent =
    typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent'].slice(0, 200)
      : undefined;
  return { ipAddress, userAgent };
}

export async function recordAuditLog(params: {
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
  try {
    const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const record: AuditLogRecord = {
      id,
      actorUid: params.actorUid || 'system',
      actorEmail: (params.actorEmail || ADMIN_EMAIL).trim().toLowerCase(),
      actorName: params.actorName || params.actorEmail || 'Platform System',
      actorRole: params.actorRole || 'SYSTEM',
      ...(params.actorDepartmentId ? { actorDepartmentId: params.actorDepartmentId } : {}),
      action: params.action,
      resourceType: params.resourceType,
      ...(params.resourceId ? { resourceId: params.resourceId } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      severity: params.severity || 'INFO',
      summary: params.summary,
      ...(params.details ? { details: params.details } : {}),
      ...(params.ipAddress ? { ipAddress: params.ipAddress } : {}),
      ...(params.userAgent ? { userAgent: params.userAgent } : {}),
      createdAt: new Date().toISOString(),
    };
    await db.collection('audit_logs').doc(id).set(record);
  } catch (err) {
    console.warn('Non-fatal audit log write warning:', err);
  }
}

export async function recordLoginHistory(params: {
  uid: string;
  email: string;
  role: string;
  departmentId?: string;
  clientType?: 'WEB' | 'MOBILE';
  authMethod: string;
  success: boolean;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const id = `LGN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const record: LoginHistoryRecord = {
      id,
      uid: params.uid,
      email: params.email.trim().toLowerCase(),
      role: params.role,
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      clientType: params.clientType || 'WEB',
      authMethod: params.authMethod,
      success: params.success,
      ...(params.failureReason ? { failureReason: params.failureReason } : {}),
      ...(params.ipAddress ? { ipAddress: params.ipAddress } : {}),
      ...(params.userAgent ? { userAgent: params.userAgent } : {}),
      createdAt: new Date().toISOString(),
    };
    await db.collection('login_history').doc(id).set(record);
  } catch (err) {
    console.warn('Non-fatal login history write warning:', err);
  }
}

export async function logAppError(params: {
  service: 'PORTAL_WEB' | 'PHLEBO_APP' | 'CLOUD_FUNCTIONS' | 'EXPRESS_API' | 'WEBHOOK_SYNC';
  severity: 'WARN' | 'ERROR' | 'CRITICAL';
  errorCode: string;
  message: string;
  endpointOrRoute?: string;
}): Promise<void> {
  try {
    const id = `ERR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await db.collection('app_error_logs').doc(id).set({
      id,
      service: params.service,
      severity: params.severity,
      errorCode: params.errorCode,
      message: params.message.slice(0, 500),
      ...(params.endpointOrRoute ? { endpointOrRoute: params.endpointOrRoute } : {}),
      resolved: false,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Non-fatal
  }
}

async function resolveProfileForAuth(email: string): Promise<UserProfile | null> {
  const normalized = email.trim().toLowerCase();
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
    return {
      id: 'usr-admin-root',
      email: normalized,
      displayName: 'Vikas (Super Admin)',
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
      isActive: true,
      createdByAdmin: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Missing Bearer token.', 401, 'UNAUTHORIZED'));
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await auth.verifyIdToken(idToken);
    const provisioned = decoded.email ? await resolveProfileForAuth(decoded.email) : null;

    if (provisioned && !provisioned.isActive) {
      return next(
        new AppError(
          `Account (${decoded.email}) is suspended by Platform Admin.`,
          403,
          'ACCOUNT_SUSPENDED'
        )
      );
    }

    const isRootAdmin = decoded.email?.toLowerCase() === ADMIN_EMAIL;
    const tokenRole =
      provisioned?.role ||
      (decoded.role as UserRole | undefined) ||
      (isRootAdmin ? UserRole.ADMIN : undefined);

    if (!tokenRole || !Object.values(UserRole).includes(tokenRole)) {
      return next(
        new AppError(
          `Account (${decoded.email || decoded.uid}) has not been provisioned by Platform Admin (${ADMIN_EMAIL}).`,
          403,
          'USER_NOT_PROVISIONED'
        )
      );
    }

    const effectiveProfile: UserProfile = provisioned || {
      id: decoded.uid,
      email: (decoded.email || '').toLowerCase(),
      displayName: (decoded.name as string | undefined) || decoded.email || decoded.uid,
      role: tokenRole,
      adminSubRole: decoded.adminSubRole as UserCustomClaims['adminSubRole'],
      isSuperAdmin: Boolean(decoded.isSuperAdmin) || isRootAdmin,
      founderRoles: Array.isArray(decoded.founderRoles) ? decoded.founderRoles : undefined,
      primaryDepartmentId: decoded.primaryDepartmentId as string | undefined,
      departmentIds: Array.isArray(decoded.departmentIds) ? decoded.departmentIds : undefined,
      designationId: decoded.designationId as string | undefined,
      labId: decoded.labId as string | undefined,
      parentLabId: decoded.parentLabId as string | undefined,
      phlebotomistId: decoded.phlebotomistId as string | undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const superAdmin = isEffectiveSuperAdmin(effectiveProfile, ADMIN_EMAIL);
    const permissions = resolveEffectivePermissions(effectiveProfile, ADMIN_EMAIL);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || effectiveProfile.email,
      displayName: effectiveProfile.displayName,
      role: tokenRole,
      isSuperAdmin: superAdmin,
      permissions,
      ...(effectiveProfile.adminSubRole ? { adminSubRole: effectiveProfile.adminSubRole } : {}),
      ...(effectiveProfile.founderRoles ? { founderRoles: effectiveProfile.founderRoles } : {}),
      ...(effectiveProfile.primaryDepartmentId
        ? { primaryDepartmentId: effectiveProfile.primaryDepartmentId }
        : {}),
      ...(effectiveProfile.departmentIds ? { departmentIds: effectiveProfile.departmentIds } : {}),
      ...(effectiveProfile.designationId ? { designationId: effectiveProfile.designationId } : {}),
      labId: effectiveProfile.labId,
      ...(effectiveProfile.parentLabId ? { parentLabId: effectiveProfile.parentLabId } : {}),
      phlebotomistId: effectiveProfile.phlebotomistId,
      profile: effectiveProfile,
    };

    return next();
  } catch (err) {
    return next(
      new AppError('Invalid or expired authentication token.', 401, 'UNAUTHORIZED', err)
    );
  }
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> | void {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }
  return next();
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden. Requires [${allowedRoles.join(', ')}], got [${req.user.role}]`,
          403,
          'FORBIDDEN'
        )
      );
    }
    next();
  };
}

export function requireSuperAdmin() {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== UserRole.ADMIN || !req.user.isSuperAdmin) {
      return next(
        new AppError(
          'Restricted: Super Admin authority is required for this action.',
          403,
          'SUPER_ADMIN_REQUIRED'
        )
      );
    }
    next();
  };
}

export function requirePermissions(...required: PermissionCode[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== UserRole.ADMIN) {
      return next(
        new AppError('Administrative team access is required.', 403, 'FORBIDDEN')
      );
    }
    if (req.user.isSuperAdmin) {
      return next();
    }
    const missing = required.filter(
      (p) => !hasPermission(req.user?.profile, p, ADMIN_EMAIL)
    );
    if (missing.length > 0) {
      return next(
        new AppError(
          `Access denied. Missing required permission(s): ${missing.join(', ')}`,
          403,
          'PERMISSION_DENIED'
        )
      );
    }
    next();
  };
}

export function requireAnyPermission(...candidates: PermissionCode[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }
    if (req.user.role !== UserRole.ADMIN) {
      return next(
        new AppError('Administrative team access is required.', 403, 'FORBIDDEN')
      );
    }
    if (req.user.isSuperAdmin || hasAnyPermission(req.user.profile, candidates, ADMIN_EMAIL)) {
      return next();
    }
    return next(
      new AppError(
        `Access denied. Requires one of: ${candidates.join(', ')}`,
        403,
        'PERMISSION_DENIED'
      )
    );
  };
}

