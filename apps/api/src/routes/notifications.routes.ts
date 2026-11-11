import { Router, Request, Response, NextFunction } from 'express';
import {
  ApiResponse,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  PlatformNotification,
  EmailDeliverySettings,
  UserRole,
} from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest, requireAuth, requireRoles } from '../middleware/auth';
import {
  getNotificationSettings,
  listNotifications,
  markNotificationRead,
  registerUserFcmToken,
  sendPlatformNotification,
  updateNotificationSettings,
} from '../services/notification.service';
import { config } from '../config/env';

export const notificationsRouter = Router();

/**
 * GET /api/v1/notifications
 * List notifications (protected)
 */
notificationsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limitParam = parseInt((req.query.limit as string) || '30', 10);
    const items = await listNotifications(Number.isNaN(limitParam) ? 30 : Math.min(limitParam, 100));

    const response: ApiResponse<PlatformNotification[]> = {
      success: true,
      data: items,
      message: 'Notifications retrieved successfully',
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/notifications/settings
 * Retrieve email & notification delivery configuration
 */
notificationsRouter.get(
  '/settings',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getNotificationSettings();
      const response: ApiResponse<EmailDeliverySettings> = {
        success: true,
        data: settings,
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/v1/notifications/settings
 * Update email notification toggles
 */
notificationsRouter.put(
  '/settings',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await updateNotificationSettings(req.body || {});
      const response: ApiResponse<EmailDeliverySettings> = {
        success: true,
        data: updated,
        message: 'Notification settings updated successfully',
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/notifications/send
 * Send multi-channel notification (In-App + FCM + Email)
 */
notificationsRouter.post(
  '/send',
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

      const response: ApiResponse<PlatformNotification> = {
        success: true,
        data: result,
        message: 'Notification dispatched',
        timestamp: new Date().toISOString(),
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/notifications/test-email
 * Admin endpoint to verify Email Notification + Firestore + FCM pipeline
 */
notificationsRouter.post(
  '/test-email',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetEmail = (req.body?.recipientEmail as string) || config.admin.email;

      const result = await sendPlatformNotification({
        title: 'LabSetu Test Email & Notification Check',
        message: `This test confirms that instant alerts, notification history, and email delivery to ${targetEmail} are working properly.`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.NORMAL,
        recipientEmail: targetEmail,
        recipientRole: UserRole.ADMIN,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH_FCM],
      });

      const response: ApiResponse<PlatformNotification> = {
        success: true,
        data: result,
        message: result.emailSent
          ? `Test email sent to ${targetEmail}`
          : `Notification saved; email delivery to ${targetEmail} is pending configuration.`,
        timestamp: new Date().toISOString(),
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/notifications/:id/read
 */
notificationsRouter.patch(
  '/:id/read',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await markNotificationRead(req.params.id);
      const response: ApiResponse<{ id: string; read: boolean }> = {
        success: true,
        data: { id: req.params.id, read: true },
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/notifications/register-token
 * Register Web / Mobile FCM Push Token
 */
notificationsRouter.post(
  '/register-token',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { fcmToken } = req.body || {};
      if (!fcmToken) {
        return next(new AppError('Missing fcmToken', 400, 'BAD_REQUEST'));
      }

      const uid = req.user?.uid || 'admin-root';
      await registerUserFcmToken(uid, fcmToken);

      const response: ApiResponse<{ registered: boolean }> = {
        success: true,
        data: { registered: true },
        message: 'FCM push token registered successfully',
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

