import { Request, Response, NextFunction } from 'express';
import {
  PermissionCode,
  UserRole,
  resolveEffectivePermissions,
} from '@diagnostic/shared';
import { AppError } from './errorHandler';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';
import {
  findProvisionedUserByEmail,
  resolveDevSessionToken,
} from '../services/user-directory.service';
import {
  AuthenticatedRequest,
  buildAuthenticatedUserFromProfile,
} from './rbac';

export type { AuthenticatedRequest };

function decodeUnverifiedJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Authentication Middleware
 * Verifies Firebase ID tokens in production & connected environments.
 * Enforces directory `isActive` check immediately even before JWT expires.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const mockRoleHeader = req.headers['x-mock-role'] as string;
  const { auth, isMockMode } = initializeFirebase();

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.slice('Bearer '.length).trim();

    if (auth && !isMockMode) {
      try {
        const decoded = await auth.verifyIdToken(idToken, true);
        const provisioned = decoded.email
          ? await findProvisionedUserByEmail(decoded.email)
          : null;

        if (provisioned && !provisioned.isActive) {
          return next(
            new AppError(
              `Your account (${decoded.email}) is currently paused. Please contact LabSetu Admin.`,
              403,
              'ACCOUNT_SUSPENDED'
            )
          );
        }

        const isRootAdmin =
          decoded.email?.toLowerCase() === config.admin.email.toLowerCase();
        const built = buildAuthenticatedUserFromProfile(
          decoded.uid,
          provisioned,
          decoded as unknown as Record<string, unknown>,
          isRootAdmin
        );

        if (!built) {
          return next(
            new AppError(
              `Your account (${decoded.email || decoded.uid}) has not been added yet. Please ask LabSetu Admin (${config.admin.email}) to set up your access.`,
              403,
              'USER_NOT_PROVISIONED'
            )
          );
        }

        req.user = built;
        return next();
      } catch (err) {
        return next(
          new AppError(
            'Your sign-in session has expired or been revoked. Please sign in again.',
            401,
            'UNAUTHORIZED',
            err
          )
        );
      }
    }

    // Local development fallback when Admin SDK serviceAccountKey.json is not attached
    if (isMockMode && config.env !== 'production') {
      const devOtpSession = resolveDevSessionToken(idToken);
      if (devOtpSession) {
        const currentProfile = await findProvisionedUserByEmail(devOtpSession.email);
        if (!currentProfile) {
          return next(
            new AppError(
              `Your account (${devOtpSession.email}) is not currently active in LabSetu.`,
              403,
              'USER_NOT_PROVISIONED'
            )
          );
        }
        if (!currentProfile.isActive) {
          return next(
            new AppError(
              `Your account (${devOtpSession.email}) is currently paused by LabSetu Admin.`,
              403,
              'ACCOUNT_SUSPENDED'
            )
          );
        }

        const built = buildAuthenticatedUserFromProfile(
          currentProfile.id || devOtpSession.uid,
          currentProfile
        );
        if (!built) {
          return next(new AppError('Invalid account configuration.', 403, 'USER_NOT_PROVISIONED'));
        }
        req.user = built;
        return next();
      }

      const payload = decodeUnverifiedJwtPayload(idToken);
      if (payload) {
        const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
        const uid =
          (typeof payload.user_id === 'string' && payload.user_id) ||
          (typeof payload.sub === 'string' && payload.sub) ||
          'dev-firebase-user';
        const provisioned = email ? await findProvisionedUserByEmail(email) : null;

        if (!provisioned) {
          return next(
            new AppError(
              `Your account (${email || uid}) has not been added yet. Please ask LabSetu Admin (${config.admin.email}) to set up your access.`,
              403,
              'USER_NOT_PROVISIONED'
            )
          );
        }

        if (!provisioned.isActive) {
          return next(
            new AppError(
              `Your account (${email}) is currently paused by LabSetu Admin.`,
              403,
              'ACCOUNT_SUSPENDED'
            )
          );
        }

        const built = buildAuthenticatedUserFromProfile(uid, provisioned, payload);
        if (!built) {
          return next(new AppError('Invalid account configuration.', 403, 'USER_NOT_PROVISIONED'));
        }
        req.user = built;
        return next();
      }

      return next(
        new AppError('Your sign-in session is invalid. Please sign in again.', 401, 'UNAUTHORIZED')
      );
    }
  }

  // Mock header strictly limited to non-production for local dev/test harnesses
  if (
    config.env !== 'production' &&
    mockRoleHeader &&
    Object.values(UserRole).includes(mockRoleHeader as UserRole)
  ) {
    const mockEmail =
      (typeof req.headers['x-mock-email'] === 'string' && req.headers['x-mock-email'].trim().toLowerCase()) ||
      config.admin.email.toLowerCase();
    const provisioned = await findProvisionedUserByEmail(mockEmail);

    if (provisioned && provisioned.role === (mockRoleHeader as UserRole)) {
      if (!provisioned.isActive) {
        return next(new AppError('Account is currently paused.', 403, 'ACCOUNT_SUSPENDED'));
      }
      const built = buildAuthenticatedUserFromProfile(provisioned.id || 'mock-user-123', provisioned);
      if (built) {
        req.user = built;
        return next();
      }
    }

    const role = mockRoleHeader as UserRole;
    const isRootEmail = mockEmail === config.admin.email.toLowerCase();
    const isSuper = role === UserRole.ADMIN && isRootEmail;
    const headerPerms = typeof req.headers['x-mock-permissions'] === 'string'
      ? (req.headers['x-mock-permissions'].split(',').map((s) => s.trim()).filter(Boolean) as PermissionCode[])
      : [];
    const effectivePerms = isSuper
      ? resolveEffectivePermissions({ role: UserRole.ADMIN, isSuperAdmin: true, adminSubRole: 'SUPER_ADMIN' })
      : headerPerms;

    req.user = {
      uid: 'mock-user-123',
      email: mockEmail,
      role,
      isSuperAdmin: isSuper,
      permissions: effectivePerms,
      labId: (req.headers['x-mock-lab-id'] as string) || 'LAB-001',
    };
    return next();
  }

  return next(new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED'));
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> | void {
  if (req.headers.authorization?.startsWith('Bearer ') || req.headers['x-mock-role']) {
    return requireAuth(req, res, next);
  }
  return next();
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have permission to access this action.',
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}
