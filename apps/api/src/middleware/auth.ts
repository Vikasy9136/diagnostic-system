import { Request, Response, NextFunction } from 'express';
import { UserRole, UserCustomClaims } from '@diagnostic/shared';
import { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user?: UserCustomClaims & { uid: string };
}

/**
 * Authentication Middleware
 * Validates Firebase ID token or allows mock headers during local starter testing
 */
export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const mockRoleHeader = req.headers['x-mock-role'] as string;

  // Local development mock bypass if no live Firebase connection yet
  if (mockRoleHeader && Object.values(UserRole).includes(mockRoleHeader as UserRole)) {
    req.user = {
      uid: 'mock-user-123',
      role: mockRoleHeader as UserRole,
      labId: (req.headers['x-mock-lab-id'] as string) || 'LAB-001',
    };
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Missing Bearer token.', 401, 'UNAUTHORIZED'));
  }

  // Live Firebase Admin token verification will be attached here once real/emulator project is connected
  // For starter config:
  req.user = {
    uid: 'dev-user-001',
    role: UserRole.ADMIN,
  };
  next();
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

