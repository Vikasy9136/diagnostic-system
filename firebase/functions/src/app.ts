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
import { ADMIN_EMAIL, AppError, auth, db, PROJECT_ID, RAZORPAY_CONFIG, SMTP_CONFIG } from './firebaseAdmin';
import {
  createOrUpdateManagedUser,
  findProvisionedUserByEmail,
  listProvisionedUsers,
  requestEmailOtp,
  requestPasswordReset,
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
import {
  createRazorpayOrder,
  createRazorpayPaymentLink,
  releaseSettlementPayout,
  syncPaymentLinkStatus,
  verifyRazorpayPayment,
} from './razorpay';

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
      ...(provisioned?.adminSubRole || decoded.adminSubRole
        ? { adminSubRole: (provisioned?.adminSubRole || decoded.adminSubRole) as UserCustomClaims['adminSubRole'] }
        : {}),
      labId: (provisioned?.labId || decoded.labId) as string | undefined,
      ...(provisioned?.parentLabId || decoded.parentLabId
        ? { parentLabId: (provisioned?.parentLabId || decoded.parentLabId) as string }
        : {}),
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

function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> | void {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }
  return next();
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
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Normalize direct Cloud Function calls (/health, /create-order) as well as Hosting rewrites (/api/v1/*, /api/*)
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
      },
      message: 'LabSetu Firebase Cloud Functions Backend is operational',
      timestamp: new Date().toISOString(),
    });
  });

  // AUTH
  app.post('/api/v1/auth/otp/send', async (req: Request, res: Response, next: NextFunction) => {
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
      return res.json({
        success: true,
        data: result,
        message: `6-digit OTP sent to ${email.trim().toLowerCase()}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/v1/auth/otp/verify', async (req: Request, res: Response, next: NextFunction) => {
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
      return res.json({
        success: true,
        data: result,
        message: 'OTP verified successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/v1/auth/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, origin } = req.body || {};
      const clientType = resolveClientPlatform(req);
      if (!email || typeof email !== 'string' || !email.trim().includes('@')) {
        return next(new AppError('Please enter a valid registered email address.', 400, 'BAD_REQUEST'));
      }
      const headerOrigin =
        typeof req.headers['x-forwarded-origin'] === 'string'
          ? req.headers['x-forwarded-origin']
          : typeof req.headers.origin === 'string'
          ? req.headers.origin
          : undefined;

      const result = await requestPasswordReset(
        email,
        typeof origin === 'string' ? origin : headerOrigin,
        clientType
      );
      return res.json({
        success: true,
        data: result,
        message: `Password reset link sent to ${email.trim().toLowerCase()}`,
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
        const clientType = resolveClientPlatform(req);
        const userProfile = await verifyAndSyncSessionRole(
          uid,
          email,
          requiredRole,
          clientType
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
        const orderMap = new Map<string, Record<string, unknown>>();
        snap.docs.forEach((doc) => {
          orderMap.set(doc.id, {
            ...(doc.data() as Record<string, unknown>),
            id: doc.id,
          });
        });

        // Main HQ Large Lab also aggregates orders dispatched to its Collection Centers
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
          ...(req.body.targetParentLabId ? { targetParentLabId: req.body.targetParentLabId } : {}),
          ...(req.body.dropType ? { dropType: req.body.dropType } : {}),
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

  // PAYMENTS & PARTNER PAYOUTS (Razorpay Standard Checkout + Payment Links + Split Payouts)
  app.get('/api/v1/payments/config', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        razorpayConfigured: Boolean(RAZORPAY_CONFIG.keyId && RAZORPAY_CONFIG.keySecret),
        razorpayXEnabled: Boolean(RAZORPAY_CONFIG.xAccountNumber),
        keyId: RAZORPAY_CONFIG.keyId || null,
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.post(
    '/api/v1/payments/create-order',
    optionalAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { amount, amountInr, currency, receipt, bookingId, settlementId, notes } =
          req.body || {};

        if ((bookingId || settlementId) && !req.user) {
          return next(
            new AppError('Authentication required to pay for a booking invoice.', 401, 'UNAUTHORIZED')
          );
        }

        const result = await createRazorpayOrder({
          amount,
          amountInr,
          currency,
          receipt,
          bookingId,
          settlementId,
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
    optionalAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          bookingId,
          settlementId,
          collectedByRole,
          paymentMethod,
        } = req.body || {};

        const result = await verifyRazorpayPayment({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          bookingId,
          settlementId,
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
