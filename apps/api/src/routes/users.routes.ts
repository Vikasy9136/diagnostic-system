import { Router, Response, NextFunction } from 'express';
import {
  ApiResponse,
  CreateManagedUserPayload,
  ROLE_LABELS,
  UserProfile,
  UserRole,
} from '@diagnostic/shared';
import { requireAuth, requireRoles } from '../middleware/auth';
import {
  AuthenticatedRequest,
  getRequestClientMeta,
  requireAnyPermission,
} from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import {
  createOrUpdateManagedUser,
  listProvisionedUsers,
  setManagedUserInitialPassword,
  updateManagedUserStatus,
} from '../services/user-directory.service';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRoles(UserRole.ADMIN));

usersRouter.get(
  '/',
  requireAnyPermission(
    'MANAGE_EMPLOYEES',
    'VIEW_SUPER_ADMIN_DASHBOARD',
    'MANAGE_PHLEBO_NETWORK',
    'MANAGE_LAB_PARTNERSHIPS',
    'MANAGE_ONBOARDING'
  ),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const users = await listProvisionedUsers();
      const response: ApiResponse<UserProfile[]> = {
        success: true,
        data: users,
        message: 'Team and partner accounts loaded successfully',
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.post(
  '/',
  requireAnyPermission(
    'MANAGE_EMPLOYEES',
    'MANAGE_ONBOARDING',
    'MANAGE_PHLEBO_NETWORK',
    'MANAGE_LAB_PARTNERSHIPS'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const payload = req.body as CreateManagedUserPayload;
      if (!payload?.email || !payload?.displayName || !payload?.role) {
        return next(
          new AppError('Please fill in the email, full name, and role.', 400, 'BAD_REQUEST')
        );
      }

      if (payload.role === UserRole.ADMIN && !req.user?.isSuperAdmin) {
        if (!req.user?.permissions.includes('MANAGE_EMPLOYEES')) {
          return next(
            new AppError(
              'You do not have permission to create or alter staff admin accounts.',
              403,
              'PERMISSION_DENIED'
            )
          );
        }
      }

      const meta = getRequestClientMeta(req);
      const user = await createOrUpdateManagedUser(payload, {
        uid: req.user?.uid,
        email: req.user?.email,
        displayName: req.user?.profile?.displayName || req.user?.email,
        role: req.user?.role,
        isSuperAdmin: req.user?.isSuperAdmin,
        primaryDepartmentId: req.user?.primaryDepartmentId,
        ...meta,
      });
      const response: ApiResponse<UserProfile> = {
        success: true,
        data: user,
        message: `Account created for ${user.email} as ${ROLE_LABELS[user.role]}`,
        timestamp: new Date().toISOString(),
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.patch(
  '/:identifier',
  requireAnyPermission('MANAGE_EMPLOYEES', 'MANAGE_LAB_PARTNERSHIPS', 'MANAGE_PHLEBO_NETWORK'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const meta = getRequestClientMeta(req);
      const updated = await updateManagedUserStatus(req.params.identifier, req.body || {}, {
        uid: req.user?.uid,
        email: req.user?.email,
        displayName: req.user?.profile?.displayName || req.user?.email,
        role: req.user?.role,
        isSuperAdmin: req.user?.isSuperAdmin,
        primaryDepartmentId: req.user?.primaryDepartmentId,
        ...meta,
      });
      const response: ApiResponse<UserProfile> = {
        success: true,
        data: updated,
        message: `Updated account access for ${updated.email}`,
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.post(
  '/:identifier/initial-password',
  requireAnyPermission(
    'MANAGE_EMPLOYEES',
    'MANAGE_LAB_PARTNERSHIPS',
    'MANAGE_PHLEBO_NETWORK',
    'FULL_PLATFORM_CONTROL'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { password, mustChangePassword, sendNotificationEmail } = req.body || {};
      const meta = getRequestClientMeta(req);
      const result = await setManagedUserInitialPassword(
        req.params.identifier,
        String(password || ''),
        {
          mustChangePassword: mustChangePassword !== false,
          sendNotificationEmail: sendNotificationEmail !== false,
        },
        {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.profile?.displayName || req.user?.email,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          primaryDepartmentId: req.user?.primaryDepartmentId,
          ...meta,
        }
      );
      res.json({
        success: true,
        data: result.profile,
        message: `Initial sign-in password configured for ${result.profile.email}.`,
        timestamp: result.passwordUpdatedAt,
      });
    } catch (err) {
      next(err);
    }
  }
);
