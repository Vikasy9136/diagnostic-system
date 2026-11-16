import { Router, Response, NextFunction } from 'express';
import { UserRole } from '@diagnostic/shared';
import { requireAuth } from '../middleware/auth';
import { AuthenticatedRequest, getRequestClientMeta } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import { provisionBranchCenterFacility } from '../services/user-directory.service';

export const labsRouter = Router();

labsRouter.use(requireAuth);

labsRouter.post(
  '/branches',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const isAllowedAdmin =
        req.user?.role === UserRole.ADMIN &&
        (req.user.isSuperAdmin ||
          req.user.permissions.some((p) =>
            ['MANAGE_LAB_PARTNERSHIPS', 'MANAGE_ONBOARDING', 'FULL_PLATFORM_CONTROL'].includes(p)
          ));
      const isMainHubHq =
        req.user?.role === UserRole.LARGE_LAB &&
        Boolean(req.user.labId) &&
        !req.user.parentLabId;

      if (!isAllowedAdmin && !isMainHubHq) {
        return next(
          new AppError(
            'Only Large Reference Lab Main Hubs or authorised Admins may register Collection Center branches.',
            403,
            'PERMISSION_DENIED'
          )
        );
      }

      const body = req.body || {};
      const resolvedParentId = isMainHubHq
        ? String(req.user?.labId || '')
        : String(body.parentLabId || '');
      const meta = getRequestClientMeta(req);
      const result = await provisionBranchCenterFacility(
        {
          parentLabId: resolvedParentId,
          name: body.name,
          city: body.city,
          address: body.address,
          pincode: body.pincode,
          latitude: body.latitude,
          longitude: body.longitude,
          serviceRadiusKm: body.serviceRadiusKm,
          phone: body.phone,
          nablNumber: body.nablNumber,
          createSeparateLogin: body.createSeparateLogin,
          email: body.email,
          password: body.password,
          managerName: body.managerName,
        },
        {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.profile?.displayName || req.user?.email,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          ...meta,
        }
      );

      res.status(201).json({
        success: true,
        data: result,
        message: `Branch ${result.branchId} registered${
          result.profile ? ` with login ${result.profile.email}` : ''
        }.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

