import { Router, Request, Response, NextFunction } from 'express';
import { UserRole } from '@diagnostic/shared';
import { config } from '../config/env';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { AuthenticatedRequest, requirePermissions } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import {
  checkPaymentLink,
  createOrder,
  createPaymentLink,
  processVerifiedRazorpayWebhook,
  releasePayout,
  verifyPayment,
} from '../services/razorpay.service';

export const paymentsRouter = Router();

paymentsRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      razorpayConfigured: Boolean(config.razorpay.keyId && config.razorpay.keySecret),
      webhookConfigured: Boolean(config.razorpay.webhookSecret),
      razorpayXEnabled: Boolean(config.razorpay.xAccountNumber),
      keyId: config.razorpay.keyId || null,
    },
    timestamp: new Date().toISOString(),
  });
});

export async function handleCreateOrderRoute(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { amount, amountInr, currency, receipt, bookingId, settlementId, invoiceId, notes } =
      req.body || {};

    if ((bookingId || settlementId || invoiceId) && !req.user) {
      return next(
        new AppError('Authentication required to pay for a booking or subscription invoice.', 401, 'UNAUTHORIZED')
      );
    }

    const result = await createOrder({
      amount,
      amountInr,
      currency,
      receipt,
      bookingId,
      settlementId,
      invoiceId,
      notes,
      requesterRole: req.user?.role,
      requesterLabId: req.user?.labId,
    });

    res.status(200).json({
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
    next(err);
  }
}

export async function handleVerifyPaymentRoute(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const result = await verifyPayment({
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

    res.status(200).json({
      success: true,
      verified: true,
      order_id: result.order_id,
      payment_id: result.payment_id,
      data: result,
      message: 'Payment signature verified successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

paymentsRouter.post('/create-order', optionalAuth, handleCreateOrderRoute);
paymentsRouter.post('/verify-payment', optionalAuth, handleVerifyPaymentRoute);

paymentsRouter.post(
  '/webhook',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rawBody =
        req.rawBody && Buffer.isBuffer(req.rawBody)
          ? req.rawBody
          : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      const signatureHeader = req.headers['x-razorpay-signature'] as string | undefined;
      const eventIdHeader = req.headers['x-razorpay-event-id'] as string | undefined;

      const result = await processVerifiedRazorpayWebhook({
        rawBody,
        signatureHeader,
        eventIdHeader,
      });

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post(
  '/create-payment-link',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await createPaymentLink({
        ...(req.body || {}),
        customerEmail: req.body?.customerEmail || req.user?.email,
      });
      res.status(200).json({
        success: true,
        data: result,
        message: 'Hosted payment link created successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.get(
  '/payment-link/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await checkPaymentLink(
        req.params.id,
        req.query.bookingId as string | undefined,
        req.query.settlementId as string | undefined
      );
      res.status(200).json({
        success: true,
        data: result,
        message: result.paid ? 'Payment link settled and recorded' : 'Payment awaiting completion',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

paymentsRouter.post(
  '/payout',
  requireAuth,
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { settlementId, recipientType, mode, referenceId, notes, forceWithoutCollection, waiveCourierPayout } =
        req.body || {};

      if (!settlementId || !recipientType) {
        return next(
          new AppError('Missing required fields: settlementId and recipientType', 400, 'BAD_REQUEST')
        );
      }

      const result = await releasePayout({
        settlementId,
        recipientType,
        mode,
        referenceId,
        notes,
        forceWithoutCollection: Boolean(forceWithoutCollection),
        waiveCourierPayout: Boolean(waiveCourierPayout),
        adminEmail: req.user?.email || config.admin.email,
      });

      res.status(200).json({
        success: true,
        data: result,
        message: `Released ${result.payouts.length} payout(s) for settlement ${settlementId}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);
