import { Request, Response, NextFunction } from 'express';
import { UserRole, UserCustomClaims } from '@diagnostic/shared';
import { AppError } from './errorHandler';
import { initializeFirebase } from '../config/firebase';
import { config } from '../config/env';

export interface AuthenticatedRequest extends Request {
  user?: UserCustomClaims & { uid: string; email?: string };
}

/**
 * Authentication Middleware
 * Verifies real Firebase ID tokens when Admin SDK is configured;
 * falls back to explicit local dev mock mode only when Admin SDK is not initialized.
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
        const tokenRole = (decoded.role as UserRole | undefined) ||
          (decoded.email === config.admin.email ? UserRole.ADMIN : undefined);

        if (!tokenRole || !Object.values(UserRole).includes(tokenRole)) {
          return next(
            new AppError(
              'User lacks an assigned platform role claim. Run admin setup or contact administrator.',
              403,
              'FORBIDDEN'
            )
          );
        }

        req.user = {
          uid: decoded.uid,
          email: decoded.email,
          role: tokenRole,
          labId: decoded.labId as string | undefined,
          phlebotomistId: decoded.phlebotomistId as string | undefined,
        };
        return next();
      } catch (err) {
        return next(
          new AppError('Invalid or expired Firebase authentication token.', 401, 'UNAUTHORIZED', err)
        );
      }
    }

    // Local development fallback when Admin SDK service account is not yet attached
    if (config.env !== 'production') {
      req.user = {
        uid: 'dev-admin-001',
        email: config.admin.email,
        role: UserRole.ADMIN,
      };
      return next();
    }
  }

  // Mock header bypass strictly limited to non-production mock mode
  if (
    isMockMode &&
    config.env !== 'production' &&
    mockRoleHeader &&
    Object.values(UserRole).includes(mockRoleHeader as UserRole)
  ) {
    req.user = {
      uid: 'mock-user-123',
      email: config.admin.email,
      role: mockRoleHeader as UserRole,
      labId: (req.headers['x-mock-lab-id'] as string) || 'LAB-001',
    };
    return next();
  }

  return next(new AppError('Authentication required. Missing Bearer token.', 401, 'UNAUTHORIZED'));
}

/**
 * Role-Based Access Control Middleware
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden. Requires one of [${allowedRoles.join(', ')}], got [${req.user.role}]`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}
