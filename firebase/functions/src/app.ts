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
  type UserCustomClaims,
  type UserProfile,
  UserRole,
  isTemperatureCompliant,
  isValidSpecimenBarcode,
} from './types';
import { ADMIN_EMAIL, AppError, auth, db, PROJECT_ID, SMTP_CONFIG } from './firebaseAdmin';
import {
  createOrUpdateManagedUser,
  findProvisionedUserByEmail,
  listProvisionedUsers,
  requestEmailOtp,
  updateManagedUserStatus,
  verifyAndSyncSessionRole,
  verifyEmailOtp,
} from './directory';
import {
  getNotificationSettings,
  listNotifications,
  markNotificationRead,
  registerUserFcmToken,
  sendPlatformNotification,
  updateNotificationSettings,
} from './mailer';

interface AuthenticatedRequest extends Request {
  user?: UserCustomClaims & { uid: string; email?: string };
}

async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Missing Bearer token.', 401, 'UNAUTHORIZED'));
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await auth.verifyIdToken(idToken);
    const provisioned = decoded.email ? await findProvisionedUserByEmail(decoded.email) : null;

    if (provisioned && !provisioned.isActive) {
      return next(
        new AppError(
          `Account (${decoded.email}) is suspended by Platform Admin.`,
          403,
          'ACCOUNT_SUSPENDED'
        )
      );
    }

    const isRootAdmin = decoded.email?.toLowerCase() === ADMIN_EMAIL;
    const tokenRole =
      provisioned?.role ||
      (decoded.role as UserRole | undefined) ||
      (isRootAdmin ? UserRole.ADMIN : undefined);

    if (!tokenRole || !Object.values(UserRole).includes(tokenRole)) {
      return next(
        new AppError(
          `Account (${decoded.email || decoded.uid}) has not been provisioned by Platform Admin (${ADMIN_EMAIL}).`,
          403,
          'USER_NOT_PROVISIONED'
        )
      );
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: tokenRole,
      labId: (provisioned?.labId || decoded.labId) as string | undefined,
      phlebotomistId: (provisioned?.phlebotomistId || decoded.phlebotomistId) as string | undefined,
    };
    return next();
  } catch (err) {
    return next(
      new AppError('Invalid or expired Firebase authentication token.', 401, 'UNAUTHORIZED', err)
    );
  }
}

function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden. Requires [${allowedRoles.join(', ')}], got [${req.user.role}]`,
          403,
          'FORBIDDEN'
        )
      );
    }
    next();
  };
}

export function createCloudApiApp(): Application {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Normalize direct Cloud Function calls (/health) as well as Hosting rewrites (/api/v1/health)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.url.startsWith('/api/v1')) {
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
      },
      message: 'LabSetu Firebase Cloud Functions Backend is operational',
      timestamp: new Date().toISOString(),
    });
  });

  // AUTH
  app.post('/api/v1/auth/otp/send', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, portalRole } = req.body || {};
      if (!email || typeof email !== 'string') {
        return next(new AppError('Email address is required.', 400, 'BAD_REQUEST'));
      }
      const result = await requestEmailOtp(email, portalRole as UserRole | undefined);
      return res.json({
        success: true,
        data: result,
        message:
          result.deliveryMode === 'SMTP'
            ? `6-digit sign-in OTP sent via email to ${email.trim().toLowerCase()}`
            : `6-digit OTP generated for ${email.trim().toLowerCase()} (configure SMTP_PASS in Firebase Functions env for Gmail delivery)`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/v1/auth/otp/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, otp, portalRole } = req.body || {};
      if (!email || !otp) {
        return next(new AppError('Email and 6-digit OTP code are required.', 400, 'BAD_REQUEST'));
      }
      const result = await verifyEmailOtp(email, String(otp), portalRole as UserRole | undefined);
      return res.json({
        success: true,
        data: result,
        message: `OTP verified for role ${result.userProfile.role}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post(
    '/api/v1/auth/verify-session',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const uid = req.user?.uid || 'unknown';
        const email = req.user?.email || (req.body?.email as string | undefined);
        const requiredRole = req.body?.requiredRole as UserRole | undefined;
        const userProfile = await verifyAndSyncSessionRole(uid, email, requiredRole);
        return res.json({
          success: true,
          data: userProfile,
          message: 'Role verified successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get('/api/v1/auth/role-check', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = (req.query.email as string) || '';
      if (!email) {
        return next(new AppError('Missing query param: email', 400, 'BAD_REQUEST'));
      }
      const profile = await findProvisionedUserByEmail(email);
      return res.json({
        success: true,
        data: {
          provisioned: Boolean(profile),
          role: profile ? profile.role : null,
          isActive: profile ? profile.isActive : false,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  });

  // USERS (Admin Only)
  app.get(
    '/api/v1/users',
    requireAuth,
    requireRoles(UserRole.ADMIN),
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
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = req.body as CreateManagedUserPayload;
        if (!payload?.email || !payload?.displayName || !payload?.role) {
          return next(
            new AppError('Missing required fields: email, displayName, and role', 400, 'BAD_REQUEST')
          );
        }
        const user = await createOrUpdateManagedUser(payload);
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
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const updated = await updateManagedUserStatus(req.params.identifier, req.body || {});
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

  // ORDERS
  app.get(
    '/api/v1/orders',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const role = req.user?.role;
        const labId = req.user?.labId;
        const phleboId = req.user?.phlebotomistId;

        let ref: FirebaseFirestore.Query = db.collection('orders');
        if (role === UserRole.SMALL_LAB && labId) {
          ref = ref.where('smallLabId', '==', labId);
        } else if (role === UserRole.LARGE_LAB && labId) {
          ref = ref.where('targetLabId', '==', labId);
        }

        const snap = await ref.limit(200).get();
        let orders: Array<Record<string, unknown>> = snap.docs.map((doc) => ({
          ...(doc.data() as Record<string, unknown>),
          id: doc.id,
        }));

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
          message: 'Live Firestore pickup orders retrieved successfully',
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
        const { smallLabName, targetLabName, patient, specimens, priority } = req.body || {};
        if (!smallLabName || !patient) {
          return next(new AppError('Missing required fields: smallLabName and patient', 400, 'BAD_REQUEST'));
        }

        const now = new Date().toISOString();
        const orderNumber =
          req.body.orderNumber || `BK-${Math.floor(100000 + Math.random() * 899999)}`;

        const newOrder = {
          id: orderNumber,
          orderNumber,
          smallLabId: req.body.smallLabId || req.user?.labId || 'LAB-SM-UNASSIGNED',
          smallLabName,
          targetLabId: req.body.targetLabId || 'LAB-LG-UNASSIGNED',
          targetLabName: targetLabName || 'Partner Reference Lab',
          ...(req.body.phlebotomistId ? { phlebotomistId: req.body.phlebotomistId } : {}),
          ...(req.body.phlebotomistName ? { phlebotomistName: req.body.phlebotomistName } : {}),
          status: OrderStatus.READY_FOR_PICKUP,
          priority: priority || OrderPriority.ROUTINE,
          patient,
          specimens: Array.isArray(specimens) ? specimens : [],
          custodyHistory: [],
          pickupLocation: req.body.pickupLocation || {
            address: smallLabName,
            latitude: 19.1438,
            longitude: 72.9378,
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
          updatedAt: now,
        };

        await db.collection('orders').doc(orderId).set(patchPayload, { merge: true });

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
          data: { id: snap.id, ...snap.data(), ...patchPayload },
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
        } = req.body || {};
        if (!title || !message) {
          return next(new AppError('Missing required fields: title and message', 400, 'BAD_REQUEST'));
        }
        const result = await sendPlatformNotification({
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
        });
        return res.status(201).json({
          success: true,
          data: result,
          message: result.emailSent
            ? `Notification persisted and email delivered to ${result.recipientEmail}`
            : 'In-app & Firestore notification recorded',
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

  // 404 Not Found Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
  });

  // Error Handler
  app.use((err: Error | AppError, _req: Request, res: Response, _next: NextFunction) => {
    const isAppErr = err instanceof AppError;
    const statusCode = isAppErr ? err.statusCode : 500;
    const code = isAppErr ? err.code : 'INTERNAL_ERROR';

    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message: err.message || 'Internal Server Error',
        details: isAppErr ? err.details : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
