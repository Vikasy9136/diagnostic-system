import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, UserProfile, UserRole } from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  findProvisionedUserByEmail,
  requestEmailOtp,
  verifyAndSyncSessionRole,
  verifyEmailOtp,
} from '../services/user-directory.service';

export const authRouter = Router();

function resolveClientPlatform(req: Request): 'WEB' | 'MOBILE' | undefined {
  const bodyType = req.body?.clientType;
  if (bodyType === 'WEB' || bodyType === 'MOBILE') return bodyType;
  const header = String(req.headers['x-client-platform'] || '').toUpperCase();
  if (header === 'WEB' || header === 'MOBILE') return header as 'WEB' | 'MOBILE';
  return undefined;
}

/**
 * POST /api/v1/auth/otp/send
 * Issues a 6-digit Email OTP exclusively for Admin-provisioned accounts
 */
authRouter.post('/otp/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, portalRole } = req.body || {};
    const clientType = resolveClientPlatform(req);
    if (!email || typeof email !== 'string') {
      return next(new AppError('Please enter your email address.', 400, 'BAD_REQUEST'));
    }

    const result = await requestEmailOtp(
      email,
      portalRole as UserRole | undefined,
      clientType
    );
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      message: `6-digit OTP sent to ${email.trim().toLowerCase()}`,
      timestamp: new Date().toISOString(),
    };
    return res.json(response);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/auth/otp/verify
 * Verifies 6-digit Email OTP and returns a signed login token
 */
authRouter.post('/otp/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp, portalRole } = req.body || {};
    const clientType = resolveClientPlatform(req);
    if (!email || !otp) {
      return next(new AppError('Email and 6-digit OTP code are required.', 400, 'BAD_REQUEST'));
    }

    const result = await verifyEmailOtp(
      email,
      String(otp),
      portalRole as UserRole | undefined,
      clientType
    );
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      message: 'OTP verified successfully',
      timestamp: new Date().toISOString(),
    };
    return res.json(response);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/auth/verify-session
 * Verifies signed-in session token against Admin-managed roles
 */
authRouter.post(
  '/verify-session',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid || 'unknown';
      const email = req.user?.email || (req.body?.email as string | undefined);
      const requiredRole = req.body?.requiredRole as UserRole | undefined;
      const clientType = resolveClientPlatform(req);

      const userProfile = await verifyAndSyncSessionRole(
        uid,
        email,
        requiredRole,
        clientType
      );
      const response: ApiResponse<UserProfile> = {
        success: true,
        data: userProfile,
        message: 'Account verified successfully',
        timestamp: new Date().toISOString(),
      };
      return res.json(response);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/v1/auth/role-check?email=...
 * Public pre-check telling client if email is provisioned (returns only boolean + role label, never secrets)
 */
authRouter.get('/role-check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = (req.query.email as string) || '';
    if (!email) {
      return next(new AppError('Missing query param: email', 400, 'BAD_REQUEST'));
    }

    const profile = await findProvisionedUserByEmail(email);
    const response: ApiResponse<{
      provisioned: boolean;
      role: UserRole | null;
      isActive: boolean;
    }> = {
      success: true,
      data: {
        provisioned: Boolean(profile),
        role: profile ? profile.role : null,
        isActive: profile ? profile.isActive : false,
      },
      timestamp: new Date().toISOString(),
    };
    return res.json(response);
  } catch (err) {
    return next(err);
  }
});

