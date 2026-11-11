import { Request, Response, NextFunction } from 'express';
import { UserRole, UserCustomClaims } from '@diagnostic/shared';
import { AppError } from './errorHandler';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';
import {
  findProvisionedUserByEmail,
  resolveDevSessionToken,
} from '../services/user-directory.service';

export interface AuthenticatedRequest extends Request {
  user?: UserCustomClaims & { uid: string; email?: string };
}

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
 * Verifies real Firebase ID tokens when Admin SDK is configured;
 * in non-production mock mode (before serviceAccountKey.json), resolves the token's email
 * against the Admin-provisioned directory without skipping role validation.
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
        const decoded = await auth.verifyIdToken(idToken);
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
        const tokenRole =
          provisioned?.role ||
          (decoded.role as UserRole | undefined) ||
          (isRootAdmin ? UserRole.ADMIN : undefined);

        if (!tokenRole || !Object.values(UserRole).includes(tokenRole)) {
          return next(
            new AppError(
              `Your account (${decoded.email || decoded.uid}) has not been added yet. Please ask LabSetu Admin (${config.admin.email}) to set up your access.`,
              403,
              'USER_NOT_PROVISIONED'
            )
          );
        }

        req.user = {
          uid: decoded.uid,
          email: decoded.email,
          role: tokenRole,
          ...(provisioned?.adminSubRole || decoded.adminSubRole
            ? { adminSubRole: (provisioned?.adminSubRole || decoded.adminSubRole) as UserCustomClaims['adminSubRole'] }
            : {}),
          labId: (provisioned?.labId || decoded.labId) as string | undefined,
          ...(provisioned?.parentLabId || decoded.parentLabId
            ? { parentLabId: (provisioned?.parentLabId || decoded.parentLabId) as string }
            : {}),
          phlebotomistId: (provisioned?.phlebotomistId || decoded.phlebotomistId) as
            | string
            | undefined,
        };
        return next();
      } catch (err) {
        return next(
          new AppError('Your sign-in session has expired. Please sign in again.', 401, 'UNAUTHORIZED', err)
        );
      }
    }

    // Local development fallback when Admin SDK serviceAccountKey.json is not yet attached
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

        req.user = {
          uid: currentProfile.id || devOtpSession.uid,
          email: currentProfile.email,
          role: currentProfile.role,
          ...(currentProfile.adminSubRole ? { adminSubRole: currentProfile.adminSubRole } : {}),
          labId: currentProfile.labId,
          ...(currentProfile.parentLabId ? { parentLabId: currentProfile.parentLabId } : {}),
          phlebotomistId: currentProfile.phlebotomistId,
        };
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

        req.user = {
          uid,
          email: provisioned.email,
          role: provisioned.role,
          ...(provisioned.adminSubRole ? { adminSubRole: provisioned.adminSubRole } : {}),
          labId: provisioned.labId,
          ...(provisioned.parentLabId ? { parentLabId: provisioned.parentLabId } : {}),
          phlebotomistId: provisioned.phlebotomistId,
        };
        return next();
      }

      return next(
        new AppError('Your sign-in session is invalid. Please sign in again.', 401, 'UNAUTHORIZED')
      );
    }
  }

  // Mock header strictly limited to explicit API CLI tests in non-production mock mode
  if (
    isMockMode &&
    config.env !== 'production' &&
    mockRoleHeader &&
    Object.values(UserRole).includes(mockRoleHeader as UserRole)
  ) {
    req.user = {
      uid: 'mock-user-123',
      email: (req.headers['x-mock-email'] as string) || config.admin.email,
      role: mockRoleHeader as UserRole,
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
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }
  return next();
}

/**
 * Role-Based Access Control Middleware
 */
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
