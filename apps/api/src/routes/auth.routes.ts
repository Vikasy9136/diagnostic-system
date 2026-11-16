import { Router, Request, Response, NextFunction } from 'express';
import {
  ApiResponse,
  UserProfile,
  UserRole,
  maskEmailAddress,
} from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { getRequestClientMeta, rateLimitByKey } from '../middleware/rbac';
import {
  exchangeMobileGoogleSession,
  loginWithIdentifierAndPassword,
  redeemMobileGoogleCode,
  requestEmailOtp,
  requestPasswordReset,
  resolveProvisionedUserByIdentifier,
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

authRouter.post(
  '/login',
  rateLimitByKey('pwd_login', 12, 5 * 60 * 1000),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier, email, password, portalRole } = req.body || {};
      const loginInput = typeof identifier === 'string' && identifier.trim() ? identifier : email;
      const clientType = resolveClientPlatform(req);
      if (!loginInput || typeof loginInput !== 'string' || !password || typeof password !== 'string') {
        return next(new AppError('Login ID / email and password are required.', 400, 'BAD_REQUEST'));
      }
      const result = await loginWithIdentifierAndPassword(
        loginInput,
        password,
        portalRole as UserRole | undefined,
        clientType,
        getRequestClientMeta(req)
      );
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Signed in successfully',
        timestamp: new Date().toISOString(),
      };
      return res.json(response);
    } catch (err) {
      return next(err);
    }
  }
);

authRouter.post(
  '/otp/send',
  rateLimitByKey('otp_send', 8, 5 * 60 * 1000),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier, email, portalRole } = req.body || {};
      const loginInput = typeof identifier === 'string' && identifier.trim() ? identifier : email;
      const clientType = resolveClientPlatform(req);
      if (!loginInput || typeof loginInput !== 'string' || !loginInput.trim()) {
        return next(
          new AppError('Please enter your registered email address or Login ID.', 400, 'BAD_REQUEST')
        );
      }
      const result = await requestEmailOtp(
        loginInput,
        portalRole as UserRole | undefined,
        clientType
      );
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `6-digit OTP sent to ${result.maskedEmail}`,
        timestamp: new Date().toISOString(),
      };
      return res.json(response);
    } catch (err) {
      return next(err);
    }
  }
);

authRouter.post(
  '/otp/verify',
  rateLimitByKey('otp_verify', 12, 5 * 60 * 1000),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier, email, otp, portalRole } = req.body || {};
      const loginInput = typeof identifier === 'string' && identifier.trim() ? identifier : email;
      const clientType = resolveClientPlatform(req);
      if (!loginInput || !otp) {
        return next(
          new AppError('Login ID or email and 6-digit OTP code are required.', 400, 'BAD_REQUEST')
        );
      }
      const result = await verifyEmailOtp(
        loginInput,
        String(otp),
        portalRole as UserRole | undefined,
        clientType,
        getRequestClientMeta(req)
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
  }
);

authRouter.post(
  '/forgot-password',
  rateLimitByKey('pwd_reset', 5, 10 * 60 * 1000),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier, email, origin } = req.body || {};
      const loginInput = typeof identifier === 'string' && identifier.trim() ? identifier : email;
      const clientType = resolveClientPlatform(req);
      if (!loginInput || typeof loginInput !== 'string' || !loginInput.trim()) {
        return next(
          new AppError('Please enter your registered email address or Login ID.', 400, 'BAD_REQUEST')
        );
      }
      const headerOrigin =
        typeof req.headers['x-forwarded-origin'] === 'string'
          ? req.headers['x-forwarded-origin']
          : typeof req.headers.origin === 'string'
            ? req.headers.origin
            : undefined;
      const meta = getRequestClientMeta(req);
      const result = await requestPasswordReset(
        loginInput,
        typeof origin === 'string' ? origin : headerOrigin,
        clientType,
        {
          email: loginInput.trim().toLowerCase(),
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }
      );
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: `Password reset link sent to ${result.maskedEmail}`,
        timestamp: new Date().toISOString(),
      };
      return res.json(response);
    } catch (err) {
      return next(err);
    }
  }
);

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
        clientType,
        getRequestClientMeta(req)
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

authRouter.get(
  '/role-check',
  rateLimitByKey('role_check', 30, 5 * 60 * 1000),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loginInput =
        (typeof req.query.identifier === 'string' && req.query.identifier.trim()) ||
        (typeof req.query.email === 'string' && req.query.email.trim()) ||
        '';
      if (!loginInput) {
        return next(new AppError('Missing query param: identifier or email', 400, 'BAD_REQUEST'));
      }
      const profile = await resolveProvisionedUserByIdentifier(loginInput);
      const response = {
        success: true,
        data: {
          provisioned: Boolean(profile),
          role: profile ? profile.role : null,
          isActive: profile ? profile.isActive : false,
          maskedEmail: profile ? maskEmailAddress(profile.email) : null,
        },
        timestamp: new Date().toISOString(),
      };
      return res.json(response);
    } catch (err) {
      return next(err);
    }
  }
);

authRouter.post(
  '/mobile-google-exchange',
  rateLimitByKey('mobile_google_ex', 25, 5 * 60 * 1000),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(
          new AppError('Google ID token missing in Authorization header.', 401, 'UNAUTHORIZED')
        );
      }
      const idToken = authHeader.slice('Bearer '.length).trim();
      const requiredRole =
        (req.body?.requiredRole as UserRole | undefined) || UserRole.PHLEBOTOMIST;
      const result = await exchangeMobileGoogleSession(
        idToken,
        requiredRole,
        getRequestClientMeta(req)
      );
      return res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

authRouter.post(
  '/mobile-google-redeem',
  rateLimitByKey('mobile_google_red', 25, 5 * 60 * 1000),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      const result = await redeemMobileGoogleCode(code);
      return res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);
