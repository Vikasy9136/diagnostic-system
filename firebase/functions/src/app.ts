import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {
  type CreateManagedUserPayload,
  CustodyEventType,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  OrderPriority,
  OrderStatus,
  StorageTemperature,
  type UserProfile,
  UserRole,
  isTemperatureCompliant,
  isValidSpecimenBarcode,
} from './types';
import {
  ADMIN_EMAIL,
  AppError,
  db,
  IS_PRODUCTION,
  PROJECT_ID,
  RAZORPAY_CONFIG,
  SMTP_CONFIG,
} from './firebaseAdmin';
import {
  createOrUpdateManagedUser,
  exchangeMobileGoogleSession,
  listProvisionedUsers,
  loginWithIdentifierAndPassword,
  provisionBranchCenterFacility,
  redeemMobileGoogleCode,
  requestEmailOtp,
  requestPasswordReset,
  resolveProvisionedUserByIdentifier,
  setManagedUserInitialPassword,
  updateManagedUserStatus,
  verifyAndSyncSessionRole,
  verifyEmailOtp,
} from './directory';
import {
  DEFAULT_STARTER_SERVICE_ZONES,
  evaluatePointServiceCoverage,
  maskEmailAddress,
} from './orgConstants';
import { type ServiceZoneRecord } from './modulesTypes';
import {
  getNotificationSettings,
  listNotifications,
  markNotificationRead,
  registerUserFcmToken,
  sendPlatformNotification,
  updateNotificationSettings,
} from './mailer';
import {
  createRazorpayOrder,
  createRazorpayPaymentLink,
  processVerifiedRazorpayWebhook,
  releaseSettlementPayout,
  syncPaymentLinkStatus,
  verifyRazorpayPayment,
} from './razorpay';
import {
  type AuthenticatedRequest,
  getRequestClientMeta,
  logAppError,
  optionalAuth,
  rateLimitByKey,
  requireAnyPermission,
  requireAuth,
  requirePermissions,
  requireRoles,
} from './rbac';
import { createOrgRouter } from './org';
import { createFinanceRouter } from './finance';
import { createOpsRouter } from './ops';
import { createMarketingRouter } from './marketing';
import { createTechRouter } from './tech';
import { createBrandingRouter } from './branding';
import {
  createLargeLabAndWalletCloudRouter,
  createPhleboPayoutsCloudRouter,
} from './bankPayouts';

const ALLOWED_WEB_ORIGINS = new Set([
  'https://labsetu-diagnostics.web.app',
  'https://labsetu-diagnostics.firebaseapp.com',
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Native mobile apps, curl, Razorpay webhooks
  if (ALLOWED_WEB_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function resolveClientPlatform(req: Request): 'WEB' | 'MOBILE' | undefined {
  const bodyType = req.body?.clientType;
  if (bodyType === 'WEB' || bodyType === 'MOBILE') return bodyType;
  const header = String(req.headers['x-client-platform'] || '').toUpperCase();
  if (header === 'WEB' || header === 'MOBILE') return header as 'WEB' | 'MOBILE';
  return undefined;
}

export function createCloudApiApp(): Application {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new AppError(`Origin ${origin} is not allowed by CORS policy.`, 403, 'CORS_BLOCKED'));
      },
      credentials: true,
    })
  );

  // Capture exact rawBody bytes for cryptographic Razorpay webhook signature verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as AuthenticatedRequest).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Normalize direct Cloud Function calls (/health, /create-order) as well as Hosting rewrites (/api/v1/*)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url === '/api/create-order' || req.url.startsWith('/api/create-order?')) {
      req.url = req.url.replace('/api/create-order', '/api/v1/payments/create-order');
    } else if (req.url === '/create-order' || req.url.startsWith('/create-order?')) {
      req.url = req.url.replace('/create-order', '/api/v1/payments/create-order');
    } else if (req.url === '/api/verify-payment' || req.url.startsWith('/api/verify-payment?')) {
      req.url = req.url.replace('/api/verify-payment', '/api/v1/payments/verify-payment');
    } else if (req.url === '/verify-payment' || req.url.startsWith('/verify-payment?')) {
      req.url = req.url.replace('/verify-payment', '/api/v1/payments/verify-payment');
    } else if (!req.url.startsWith('/api/v1')) {
      req.url = `/api/v1${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
    }
    next();
  });

  // HEALTH
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'HEALTHY',
        runtime: 'firebase-cloud-functions-gen2',
        region: 'us-central1',
        nodeVersion: process.version,
        firebaseProjectId: PROJECT_ID,
        firebaseConnected: true,
        adminEmail: ADMIN_EMAIL,
        smtpConfigured: Boolean(SMTP_CONFIG.pass),
        razorpayConfigured: Boolean(RAZORPAY_CONFIG.keyId && RAZORPAY_CONFIG.keySecret),
        razorpayWebhookConfigured: Boolean(RAZORPAY_CONFIG.webhookSecret),
      },
      message: 'LabSetu Cloud Backend is operational',
      timestamp: new Date().toISOString(),
    });
  });

  // AUTH
  app.post(
    '/api/v1/auth/login',
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
        return res.json({
          success: true,
          data: result,
          message: 'Signed in successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/auth/otp/send',
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
        return res.json({
          success: true,
          data: result,
          message: `6-digit OTP sent to ${result.maskedEmail}`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/auth/otp/verify',
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
        return res.json({
          success: true,
          data: result,
          message: 'OTP verified successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/auth/forgot-password',
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

        const result = await requestPasswordReset(
          loginInput,
          typeof origin === 'string' ? origin : headerOrigin,
          clientType,
          getRequestClientMeta(req)
        );
        return res.json({
          success: true,
          data: result,
          message: `Password reset link sent to ${result.maskedEmail}`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/auth/verify-session',
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
        return res.json({
          success: true,
          data: userProfile,
          message: 'Account verified successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    '/api/v1/auth/role-check',
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
        return res.json({
          success: true,
          data: {
            provisioned: Boolean(profile),
            role: profile ? profile.role : null,
            isActive: profile ? profile.isActive : false,
            maskedEmail: profile ? maskEmailAddress(profile.email) : null,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/auth/mobile-google-exchange',
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

  app.post(
    '/api/v1/auth/mobile-google-redeem',
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

  // ORGANISATION, FINANCE, OPERATIONS, MARKETING, TECH MODULE ROUTERS
  app.use('/api/v1/org', createOrgRouter());
  app.use('/api/v1/finance', createFinanceRouter());
  app.use('/api/v1/ops', createOpsRouter());
  app.use('/api/v1/marketing', createMarketingRouter());
  app.use('/api/v1/tech', createTechRouter());

  // USERS (Admin Only + RBAC permissions)
  app.get(
    '/api/v1/users',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requireAnyPermission('MANAGE_EMPLOYEES', 'VIEW_SUPER_ADMIN_DASHBOARD', 'MANAGE_LAB_PARTNERSHIPS'),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const users: UserProfile[] = await listProvisionedUsers();
        return res.json({
          success: true,
          data: users,
          message: 'Provisioned platform users retrieved successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/users',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requireAnyPermission('MANAGE_EMPLOYEES', 'MANAGE_LAB_PARTNERSHIPS', 'MANAGE_PHLEBO_NETWORK'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const payload = req.body as CreateManagedUserPayload;
        if (!payload?.email || !payload?.displayName || !payload?.role) {
          return next(
            new AppError('Missing required fields: email, displayName, and role', 400, 'BAD_REQUEST')
          );
        }
        // Only Super Admin or MANAGE_EMPLOYEES holder can provision ADMIN team roles
        if (
          payload.role === UserRole.ADMIN &&
          !req.user?.isSuperAdmin &&
          !req.user?.permissions.includes('MANAGE_EMPLOYEES')
        ) {
          return next(
            new AppError(
              'Permission MANAGE_EMPLOYEES or Super Admin is required to provision Admin team users.',
              403,
              'PERMISSION_DENIED'
            )
          );
        }
        const user = await createOrUpdateManagedUser(payload, {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.displayName,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          ...getRequestClientMeta(req),
        });
        return res.status(201).json({
          success: true,
          data: user,
          message: `User ${user.email} provisioned with role ${user.role}`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.patch(
    '/api/v1/users/:identifier',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requireAnyPermission('MANAGE_EMPLOYEES', 'MANAGE_LAB_PARTNERSHIPS', 'MANAGE_PHLEBO_NETWORK'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const updated = await updateManagedUserStatus(req.params.identifier, req.body || {}, {
          uid: req.user?.uid,
          email: req.user?.email,
          displayName: req.user?.displayName,
          role: req.user?.role,
          isSuperAdmin: req.user?.isSuperAdmin,
          ...getRequestClientMeta(req),
        });
        return res.json({
          success: true,
          data: updated,
          message: `Updated account access for ${updated.email}`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/users/:identifier/initial-password',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requireAnyPermission(
      'MANAGE_EMPLOYEES',
      'MANAGE_LAB_PARTNERSHIPS',
      'MANAGE_PHLEBO_NETWORK',
      'FULL_PLATFORM_CONTROL'
    ),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { password, mustChangePassword, sendNotificationEmail } = req.body || {};
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
            displayName: req.user?.displayName,
            role: req.user?.role,
            isSuperAdmin: req.user?.isSuperAdmin,
            ...getRequestClientMeta(req),
          }
        );
        return res.json({
          success: true,
          data: result.profile,
          message: `Initial sign-in password configured for ${result.profile.email}.`,
          timestamp: result.passwordUpdatedAt,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/labs/branches',
    requireAuth,
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
        const resolvedParentId = isMainHubHq ? String(req.user?.labId || '') : String(body.parentLabId || '');
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
            displayName: req.user?.displayName,
            role: req.user?.role,
            isSuperAdmin: req.user?.isSuperAdmin,
            ...getRequestClientMeta(req),
          }
        );

        return res.status(201).json({
          success: true,
          data: result,
          message: `Branch ${result.branchId} registered${
            result.profile ? ` with login ${result.profile.email}` : ''
          }.`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ORDERS (Tenant-isolated & Permission-scoped for Admin team)
  app.get(
    '/api/v1/orders',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const role = req.user?.role;
        const labId = req.user?.labId;
        const phleboId = req.user?.phlebotomistId;

        if (
          role === UserRole.ADMIN &&
          !req.user?.isSuperAdmin &&
          !req.user?.permissions.some((p) =>
            ['VIEW_OPERATIONS_DASHBOARD', 'MANAGE_BOOKINGS_DISPATCH', 'VIEW_FINANCE_DASHBOARD'].includes(p)
          )
        ) {
          return next(
            new AppError(
              'Your department role does not have permission to view diagnostic orders.',
              403,
              'PERMISSION_DENIED'
            )
          );
        }

        let ref: FirebaseFirestore.Query = db.collection('orders');
        if (role === UserRole.SMALL_LAB) {
          if (!labId) return res.json({ success: true, data: [], timestamp: new Date().toISOString() });
          ref = ref.where('smallLabId', '==', labId);
        } else if (role === UserRole.LARGE_LAB) {
          if (!labId) return res.json({ success: true, data: [], timestamp: new Date().toISOString() });
          ref = ref.where('targetLabId', '==', labId);
        }

        const snap = await ref.limit(200).get();
        const orderMap = new Map<string, Record<string, unknown>>();
        snap.docs.forEach((doc) => {
          orderMap.set(doc.id, {
            ...(doc.data() as Record<string, unknown>),
            id: doc.id,
          });
        });

        if (role === UserRole.LARGE_LAB && labId && !req.user?.parentLabId) {
          const parentSnap = await db
            .collection('orders')
            .where('targetParentLabId', '==', labId)
            .limit(200)
            .get();
          parentSnap.docs.forEach((doc) => {
            if (!orderMap.has(doc.id)) {
              orderMap.set(doc.id, {
                ...(doc.data() as Record<string, unknown>),
                id: doc.id,
              });
            }
          });
        }

        let orders: Array<Record<string, unknown>> = Array.from(orderMap.values());

        if (role === UserRole.PHLEBOTOMIST && phleboId) {
          orders = orders.filter(
            (o) =>
              o.phlebotomistId === phleboId ||
              (o.status === OrderStatus.READY_FOR_PICKUP && !o.phlebotomistId)
          );
        }

        orders.sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        );

        return res.json({
          success: true,
          data: orders,
          message: 'Live pickup orders retrieved successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/orders',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        if (
          req.user?.role === UserRole.ADMIN &&
          !req.user.isSuperAdmin &&
          !req.user.permissions.includes('MANAGE_BOOKINGS_DISPATCH')
        ) {
          return next(
            new AppError('Permission MANAGE_BOOKINGS_DISPATCH required.', 403, 'PERMISSION_DENIED')
          );
        }
        if (req.user?.role === UserRole.PHLEBOTOMIST) {
          return next(new AppError('Phlebotomists cannot create lab bookings.', 403, 'FORBIDDEN'));
        }

        const { smallLabName, targetLabName, patient, specimens, priority } = req.body || {};
        if (!smallLabName || !patient) {
          return next(new AppError('Missing required fields: smallLabName and patient', 400, 'BAD_REQUEST'));
        }

        const now = new Date().toISOString();
        const orderNumber =
          req.body.orderNumber || `BK-${Math.floor(100000 + Math.random() * 899999)}`;

        const enforcedSmallLabId =
          req.user?.role === UserRole.SMALL_LAB && req.user.labId
            ? req.user.labId
            : req.body.smallLabId || req.user?.labId || 'LAB-SM-UNASSIGNED';

        const pickupLoc = req.body.pickupLocation || {
          address: smallLabName,
          latitude: 19.1438,
          longitude: 72.9378,
        };
        const pickupPincode =
          String(
            req.body.pickupPincode ||
              pickupLoc.pincode ||
              (typeof pickupLoc.address === 'string'
                ? pickupLoc.address.match(/\b[1-9]\d{5}\b/)?.[0] || ''
                : '')
          ).trim() || undefined;

        const zoneSnap = await db.collection('service_zones').get();
        let zones: ServiceZoneRecord[] = zoneSnap.docs.map((d) => d.data() as ServiceZoneRecord);
        if (zones.length === 0) {
          zones = [...DEFAULT_STARTER_SERVICE_ZONES];
        }
        const coverage = evaluatePointServiceCoverage(
          zones,
          Number(pickupLoc.latitude),
          Number(pickupLoc.longitude),
          pickupPincode
        );
        if (!coverage.covered) {
          return next(
            new AppError(coverage.message, 400, 'OUTSIDE_SERVICE_ZONE', {
              nearestZone: coverage.nearestZone,
              distanceToNearestKm: coverage.distanceToNearestKm,
              activeZoneCount: coverage.activeZoneCount,
            })
          );
        }

        const newOrder = {
          id: orderNumber,
          orderNumber,
          smallLabId: enforcedSmallLabId,
          smallLabName,
          targetLabId: req.body.targetLabId || 'LAB-LG-UNASSIGNED',
          targetLabName: targetLabName || 'Partner Reference Lab',
          ...(req.body.targetParentLabId ? { targetParentLabId: req.body.targetParentLabId } : {}),
          ...(req.body.dropType ? { dropType: req.body.dropType } : {}),
          ...(req.body.phlebotomistId ? { phlebotomistId: req.body.phlebotomistId } : {}),
          ...(req.body.phlebotomistName ? { phlebotomistName: req.body.phlebotomistName } : {}),
          ...(coverage.matchedZone?.id ? { serviceZoneId: coverage.matchedZone.id } : {}),
          ...(coverage.matchedZone?.name ? { serviceZoneName: coverage.matchedZone.name } : {}),
          status: OrderStatus.READY_FOR_PICKUP,
          priority: priority || OrderPriority.ROUTINE,
          patient,
          specimens: Array.isArray(specimens) ? specimens : [],
          custodyHistory: [],
          pickupLocation: {
            ...pickupLoc,
            ...(pickupPincode ? { pincode: pickupPincode } : {}),
          },
          deliveryLocation: req.body.deliveryLocation || {
            address: targetLabName || 'Partner Reference Lab',
            latitude: 19.1726,
            longitude: 72.9565,
          },
          scheduledPickupAt: req.body.scheduledPickupAt || now,
          ...(typeof req.body.totalAmountInr === 'number'
            ? { totalAmountInr: req.body.totalAmountInr }
            : {}),
          ...(typeof req.body.courierFeeInr === 'number'
            ? { courierFeeInr: req.body.courierFeeInr }
            : {}),
          ...(typeof req.body.largeLabB2bAmountInr === 'number'
            ? { largeLabB2bAmountInr: req.body.largeLabB2bAmountInr }
            : {}),
          ...(typeof req.body.platformFeeInr === 'number'
            ? { platformFeeInr: req.body.platformFeeInr }
            : {}),
          ...(typeof req.body.phleboPayoutInr === 'number'
            ? { phleboPayoutInr: req.body.phleboPayoutInr }
            : {}),
          ...(typeof req.body.packageSavingsInr === 'number'
            ? { packageSavingsInr: req.body.packageSavingsInr }
            : {}),
          ...(Array.isArray(req.body.matchedPackageNames)
            ? { matchedPackageNames: req.body.matchedPackageNames }
            : {}),
          ...(typeof req.body.distanceKm === 'number' ? { distanceKm: req.body.distanceKm } : {}),
          ...(typeof req.body.broadcastRadiusKm === 'number'
            ? { broadcastRadiusKm: req.body.broadcastRadiusKm }
            : {}),
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('orders').doc(orderNumber).set(newOrder);

        await sendPlatformNotification({
          title: `New Booking ${orderNumber} from ${smallLabName}`,
          message: `Priority ${newOrder.priority} sample pickup requested to ${newOrder.targetLabName}.`,
          category: NotificationCategory.BOOKING_CREATED,
          priority:
            newOrder.priority === OrderPriority.STAT_CRITICAL
              ? NotificationPriority.CRITICAL
              : NotificationPriority.NORMAL,
          recipientEmail: ADMIN_EMAIL,
          recipientRole: UserRole.ADMIN,
          orderId: orderNumber,
          templateType:
            newOrder.priority === OrderPriority.STAT_CRITICAL
              ? 'EMERGENCY_ALERT'
              : 'OPERATIONAL_NOTIFICATION',
          metadata: {
            orderNumber,
            smallLabName: newOrder.smallLabName,
            targetLabName: newOrder.targetLabName,
          },
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH_FCM],
        });

        return res.status(201).json({
          success: true,
          data: newOrder,
          message: 'Booking created and admin notification dispatched',
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post('/api/v1/orders/validate-specimen', (req: Request, res: Response, next: NextFunction) => {
    const { barcode, temperatureCelsius, temperatureRequirement } = req.body || {};
    if (!barcode) {
      return next(new AppError('Missing required field: barcode', 400, 'BAD_REQUEST'));
    }

    const isBarcodeValid = isValidSpecimenBarcode(barcode);
    const isTempValid =
      typeof temperatureCelsius === 'number' && temperatureRequirement
        ? isTemperatureCompliant(temperatureCelsius, temperatureRequirement as StorageTemperature)
        : null;

    return res.json({
      success: true,
      data: {
        barcode,
        isBarcodeValid,
        isTemperatureCompliant: isTempValid,
      },
      message: isBarcodeValid ? 'Barcode format is valid' : 'Invalid barcode format',
      timestamp: new Date().toISOString(),
    });
  });

  app.patch(
    '/api/v1/orders/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const orderId = req.params.id;
        const updates = req.body || {};
        const now = new Date().toISOString();

        const snap = await db.collection('orders').doc(orderId).get();
        if (!snap.exists) {
          return next(new AppError(`Order not found: ${orderId}`, 404, 'NOT_FOUND'));
        }

        const existing = snap.data() as Record<string, unknown>;
        const role = req.user?.role;
        const userLabId = req.user?.labId;
        const userPhleboId = req.user?.phlebotomistId;

        if (role === UserRole.ADMIN) {
          if (!req.user?.isSuperAdmin && !req.user?.permissions.includes('MANAGE_BOOKINGS_DISPATCH')) {
            return next(new AppError('Permission MANAGE_BOOKINGS_DISPATCH required.', 403, 'PERMISSION_DENIED'));
          }
        } else if (role === UserRole.SMALL_LAB) {
          if (existing.smallLabId !== userLabId && existing.targetLabId !== userLabId) {
            return next(new AppError('Access denied for this booking.', 403, 'FORBIDDEN'));
          }
        } else if (role === UserRole.LARGE_LAB) {
          if (existing.targetLabId !== userLabId && existing.targetParentLabId !== userLabId) {
            return next(new AppError('Access denied for this booking.', 403, 'FORBIDDEN'));
          }
        } else if (role === UserRole.PHLEBOTOMIST) {
          const isOpenPoolAccept =
            existing.status === OrderStatus.READY_FOR_PICKUP && !existing.phlebotomistId;
          if (existing.phlebotomistId !== userPhleboId && !isOpenPoolAccept) {
            return next(new AppError('This order is assigned to another courier.', 403, 'FORBIDDEN'));
          }
        }

        const nextStatus = (updates.status as OrderStatus | undefined) || (existing.status as OrderStatus);
        const isTerminalOrDelivered =
          nextStatus === OrderStatus.DELIVERED_TO_LAB ||
          nextStatus === OrderStatus.REPORT_UPLOADED ||
          nextStatus === OrderStatus.COMPLETED;
        const existingCompletedAt =
          typeof existing.completedAt === 'string' && existing.completedAt
            ? existing.completedAt
            : undefined;
        const existingPayoutDueAt =
          typeof existing.payoutDueAt === 'string' && existing.payoutDueAt
            ? existing.payoutDueAt
            : undefined;
        const completedAtStamp = isTerminalOrDelivered ? existingCompletedAt || now : existingCompletedAt;
        const payoutDueAtStamp = isTerminalOrDelivered
          ? existingPayoutDueAt || new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : existingPayoutDueAt;

        const patchPayload = {
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.phlebotomistId !== undefined ? { phlebotomistId: updates.phlebotomistId } : {}),
          ...(updates.phlebotomistName !== undefined
            ? { phlebotomistName: updates.phlebotomistName }
            : {}),
          ...(updates.actualPickupAt ? { actualPickupAt: updates.actualPickupAt } : {}),
          ...(updates.actualDeliveredAt ? { actualDeliveredAt: updates.actualDeliveredAt } : {}),
          ...(updates.arrivalTemperatureCelsius !== undefined
            ? { arrivalTemperatureCelsius: updates.arrivalTemperatureCelsius }
            : {}),
          ...(updates.qualityStatus ? { qualityStatus: updates.qualityStatus } : {}),
          ...(updates.reportDocumentUrl ? { reportDocumentUrl: updates.reportDocumentUrl } : {}),
          ...(updates.reportId ? { reportId: updates.reportId } : {}),
          ...(updates.rejectionReason ? { rejectionReason: updates.rejectionReason } : {}),
          ...(updates.cancellationReason ? { cancellationReason: updates.cancellationReason } : {}),
          ...(updates.phleboLiveLocation ? { phleboLiveLocation: updates.phleboLiveLocation } : {}),
          ...(updates.sampleCollectionPhotoUrl
            ? { sampleCollectionPhotoUrl: updates.sampleCollectionPhotoUrl }
            : {}),
          ...(Array.isArray(updates.specimens) ? { specimens: updates.specimens } : {}),
          ...(isTerminalOrDelivered
            ? {
                completedAt: completedAtStamp,
                payoutDueAt: payoutDueAtStamp,
                payoutWindowMinutes: 30,
                instantPayoutEligible: true,
              }
            : {}),
          updatedAt: now,
        };

        await db.collection('orders').doc(orderId).set(patchPayload, { merge: true });

        if (isTerminalOrDelivered) {
          const instantPatch = {
            completedAt: completedAtStamp,
            payoutDueAt: payoutDueAtStamp,
            payoutWindowMinutes: 30,
            instantPayoutEligible: true,
            updatedAt: now,
          };
          const directStlId = `STL-${orderId.replace(/^BK-/, '')}`;
          const directStlSnap = await db.collection('settlements').doc(directStlId).get();
          if (directStlSnap.exists) {
            await directStlSnap.ref.set(instantPatch, { merge: true });
          }
          const linkedStls = await db.collection('settlements').where('orderId', '==', orderId).get();
          for (const stlDoc of linkedStls.docs) {
            if (stlDoc.id !== directStlId || !directStlSnap.exists) {
              await stlDoc.ref.set(instantPatch, { merge: true });
            }
          }
        }

        if (updates.custodyEventType && req.user) {
          await db.collection('custody_events').add({
            orderId,
            eventType: updates.custodyEventType as CustodyEventType,
            timestamp: now,
            operatorId: req.user.uid,
            operatorName: req.user.email || req.user.uid,
            operatorRole: req.user.role,
            ...(typeof updates.temperatureCelsius === 'number'
              ? { temperatureCelsius: updates.temperatureCelsius }
              : {}),
            ...(updates.custodyNotes ? { notes: updates.custodyNotes } : {}),
          });
        }

        return res.json({
          success: true,
          data: { id: snap.id, ...existing, ...patchPayload },
          message: `Order ${orderId} updated`,
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // NOTIFICATIONS
  app.get(
    '/api/v1/notifications',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limitParam = parseInt((req.query.limit as string) || '30', 10);
        const items = await listNotifications(Number.isNaN(limitParam) ? 30 : Math.min(limitParam, 100));
        return res.json({
          success: true,
          data: items,
          message: 'Notifications retrieved successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    '/api/v1/notifications/settings',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requireAnyPermission('MANAGE_SETTINGS', 'MANAGE_SYSTEM_SECURITY', 'VIEW_SUPER_ADMIN_DASHBOARD'),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const settings = await getNotificationSettings();
        return res.json({
          success: true,
          data: settings,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.put(
    '/api/v1/notifications/settings',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requirePermissions('MANAGE_SETTINGS'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const updated = await updateNotificationSettings(req.body || {});
        return res.json({
          success: true,
          data: updated,
          message: 'Notification settings updated successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/notifications/send',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          title,
          message,
          category,
          priority,
          recipientEmail,
          recipientUid,
          recipientRole,
          orderId,
          labId,
          channels,
          templateType,
          actionUrl,
          actionLabel,
          metadata,
        } = req.body || {};
        if (!title || !message) {
          return next(new AppError('Missing required fields: title and message', 400, 'BAD_REQUEST'));
        }
        const result = await sendPlatformNotification({
          title,
          message,
          category,
          priority,
          ...(recipientEmail ? { recipientEmail } : {}),
          ...(recipientUid ? { recipientUid } : {}),
          ...(recipientRole ? { recipientRole } : {}),
          ...(orderId ? { orderId } : {}),
          ...(labId ? { labId } : {}),
          channels,
          templateType,
          actionUrl,
          actionLabel,
          metadata,
        });
        return res.status(201).json({
          success: true,
          data: result,
          message: result.emailSent
            ? `Notification persisted and email delivered to ${result.recipientEmail}`
            : 'In-app & notification record saved',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/notifications/test-email',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requirePermissions('MANAGE_SETTINGS'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const targetEmail = (req.body?.recipientEmail as string) || ADMIN_EMAIL;
        const result = await sendPlatformNotification({
          title: 'LabSetu Live Alert & Email Check',
          message: `This test confirms that instant operational alerts, notifications, and email delivery to ${targetEmail} are working properly.`,
          category: NotificationCategory.SYSTEM_ALERT,
          priority: NotificationPriority.NORMAL,
          recipientEmail: targetEmail,
          recipientRole: UserRole.ADMIN,
          templateType: 'OPERATIONAL_NOTIFICATION',
          channels: [
            NotificationChannel.IN_APP,
            NotificationChannel.EMAIL,
            NotificationChannel.PUSH_FCM,
          ],
        });
        return res.status(201).json({
          success: true,
          data: result,
          message: result.emailSent
            ? `Test email delivered to ${targetEmail}`
            : `Notification saved; email delivery to ${targetEmail} queued.`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.patch(
    '/api/v1/notifications/:id/read',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await markNotificationRead(req.params.id);
        return res.json({
          success: true,
          data: { id: req.params.id, read: true },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/notifications/register-token',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { fcmToken } = req.body || {};
        if (!fcmToken) {
          return next(new AppError('Missing fcmToken', 400, 'BAD_REQUEST'));
        }
        await registerUserFcmToken(req.user?.uid || 'unknown', fcmToken);
        return res.json({
          success: true,
          data: { registered: true },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // PAYMENTS, SERVER-SIDE WEBHOOK & CONFIGURABLE PAYOUTS
  app.get('/api/v1/payments/config', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        razorpayConfigured: Boolean(RAZORPAY_CONFIG.keyId && RAZORPAY_CONFIG.keySecret),
        razorpayWebhookConfigured: Boolean(RAZORPAY_CONFIG.webhookSecret),
        razorpayXEnabled: Boolean(RAZORPAY_CONFIG.xAccountNumber),
        keyId: RAZORPAY_CONFIG.keyId || null,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Verified server-side Razorpay webhook (no Bearer JWT — verified via HMAC-SHA256 X-Razorpay-Signature)
  app.post(
    '/api/v1/payments/webhook',
    rateLimitByKey('razorpay_webhook', 120, 60 * 1000),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const rawBuf =
          req.rawBody ||
          (Buffer.isBuffer((req as unknown as { rawBody?: Buffer }).rawBody)
            ? (req as unknown as { rawBody: Buffer }).rawBody
            : Buffer.from(JSON.stringify(req.body || {}), 'utf8'));

        const result = await processVerifiedRazorpayWebhook({
          rawBody: rawBuf,
          signatureHeader: req.headers['x-razorpay-signature'] as string | undefined,
          eventIdHeader: req.headers['x-razorpay-event-id'] as string | undefined,
        });

        return res.status(200).json({
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/payments/create-order',
    rateLimitByKey('pay_create_order', 25, 60 * 1000),
    optionalAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { amount, amountInr, currency, receipt, bookingId, settlementId, invoiceId, notes } =
          req.body || {};

        if ((bookingId || settlementId || invoiceId) && !req.user) {
          return next(
            new AppError('Authentication required to pay for a booking or invoice.', 401, 'UNAUTHORIZED')
          );
        }

        const result = await createRazorpayOrder({
          amount,
          amountInr,
          currency,
          receipt,
          bookingId,
          settlementId,
          invoiceId,
          notes,
          requesterUid: req.user?.uid,
          requesterRole: req.user?.role,
          requesterLabId: req.user?.labId,
        });

        return res.status(200).json({
          success: true,
          order_id: result.order_id,
          amount: result.amount,
          currency: result.currency,
          receipt: result.receipt,
          key_id: result.key_id,
          data: result,
          message: 'Payment order initialized successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/payments/verify-payment',
    rateLimitByKey('pay_verify', 25, 60 * 1000),
    optionalAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          bookingId,
          settlementId,
          invoiceId,
          collectedByRole,
          paymentMethod,
        } = req.body || {};

        const result = await verifyRazorpayPayment({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          bookingId,
          settlementId,
          invoiceId,
          collectedByRole:
            collectedByRole ||
            (req.user?.role === UserRole.PHLEBOTOMIST
              ? 'PHLEBOTOMIST'
              : req.user?.role === UserRole.ADMIN
              ? 'ADMIN'
              : req.user?.role === UserRole.SMALL_LAB
              ? 'SMALL_LAB'
              : undefined),
          paymentMethod,
        });

        return res.status(200).json({
          success: true,
          verified: true,
          order_id: result.order_id,
          payment_id: result.payment_id,
          data: result,
          message: 'Payment signature verified successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/payments/create-payment-link',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const result = await createRazorpayPaymentLink({
          ...(req.body || {}),
          customerEmail: req.body?.customerEmail || req.user?.email,
        });
        return res.status(200).json({
          success: true,
          data: result,
          message: 'Hosted payment link created successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    '/api/v1/payments/payment-link/:id',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await syncPaymentLinkStatus(
          req.params.id,
          req.query.bookingId as string | undefined,
          req.query.settlementId as string | undefined
        );
        return res.status(200).json({
          success: true,
          data: result,
          message: result.paid ? 'Payment link settled and recorded' : 'Payment still awaiting completion',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    '/api/v1/payments/payout',
    requireAuth,
    requireRoles(UserRole.ADMIN),
    requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { settlementId, recipientType, mode, referenceId, notes, forceWithoutCollection } =
          req.body || {};

        if (!settlementId || !recipientType) {
          return next(
            new AppError('Missing required fields: settlementId and recipientType', 400, 'BAD_REQUEST')
          );
        }

        const result = await releaseSettlementPayout({
          settlementId,
          recipientType,
          mode,
          referenceId,
          notes,
          forceWithoutCollection: Boolean(forceWithoutCollection),
          adminEmail: req.user?.email || ADMIN_EMAIL,
        });

        return res.status(200).json({
          success: true,
          data: result,
          message: `Released ${result.payouts.length} payout(s) for settlement ${settlementId}`,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 404 Not Found Handler
  app.use('/api/v1/branding', createBrandingRouter());
  app.use('/api/v1/phlebo-payouts', createPhleboPayoutsCloudRouter());
  app.use('/api', createLargeLabAndWalletCloudRouter());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
  });

  // Error Handler (logs unexpected 500s cleanly & hides internal details in production)
  app.use((err: Error | AppError, req: Request, res: Response, _next: NextFunction) => {
    const isAppErr = err instanceof AppError;
    const statusCode = isAppErr ? err.statusCode : 500;
    const code = isAppErr ? err.code : 'INTERNAL_ERROR';

    if (statusCode >= 500) {
      void logAppError({
        service: 'CLOUD_FUNCTIONS',
        severity: 'ERROR',
        errorCode: code,
        message: err.message || 'Unhandled server error',
        endpointOrRoute: `${req.method} ${req.originalUrl}`,
      });
    }

    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message:
          statusCode >= 500 && IS_PRODUCTION && !isAppErr
            ? 'An internal server error occurred. Please try again shortly.'
            : err.message || 'Internal Server Error',
        details: isAppErr && (!IS_PRODUCTION || statusCode < 500) ? err.details : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
