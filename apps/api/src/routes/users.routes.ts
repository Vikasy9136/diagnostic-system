import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, CreateManagedUserPayload, ROLE_LABELS, UserProfile, UserRole } from '@diagnostic/shared';
import { requireAuth, requireRoles } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  createOrUpdateManagedUser,
  listProvisionedUsers,
  updateManagedUserStatus,
} from '../services/user-directory.service';

export const usersRouter = Router();

// Strictly Admin-only routes
usersRouter.use(requireAuth, requireRoles(UserRole.ADMIN));

/**
 * GET /api/v1/users
 * List all Admin-provisioned platform users & roles
 */
usersRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
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
});

/**
 * POST /api/v1/users
 * Admin creates or updates a user with explicit Role + optional Lab/Phlebo assignment
 */
usersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body as CreateManagedUserPayload;
    if (!payload?.email || !payload?.displayName || !payload?.role) {
      return next(
        new AppError('Please fill in the email, full name, and role.', 400, 'BAD_REQUEST')
      );
    }

    const user = await createOrUpdateManagedUser(payload);
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
});

/**
 * PATCH /api/v1/users/:identifier
 * Admin toggles account active status or reassigns role / lab
 */
usersRouter.patch('/:identifier', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await updateManagedUserStatus(req.params.identifier, req.body || {});
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
});

