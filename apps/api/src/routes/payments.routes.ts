import { Router, Request, Response, NextFunction } from 'express';
import { UserRole } from '@diagnostic/shared';
import { config } from '../config/env';
import { AuthenticatedRequest, optionalAuth, requireAuth, requireRoles } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  checkPaymentLink,
  createOrder,
  createPaymentLink,
  releasePayout,
  verifyPayment,
} from '../services/razorpay.service';

export const paymentsRouter = Router();

paymentsRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      razorpayConfigured: Boolean(config.razorpay.keyId && config.razorpay.keySecret),
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
    const { amount, amountInr, currency, receipt, bookingId, settlementId, notes } =
      req.body || {};

    if ((bookingId || settlementId) && !req.user) {
      return next(
        new AppError('Authentication required to pay for a booking invoice.', 401, 'UNAUTHORIZED')
      );
    }

    const result = await createOrder({
      amount,
      amountInr,
      currency,
      receipt,
      bookingId,
      settlementId,
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
      collectedByRole,
      paymentMethod,
    } = req.body || {};

    const result = await verifyPayment({
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

      const result = await releasePayout({
        settlementId,
        recipientType,
        mode,
        referenceId,
        notes,
        forceWithoutCollection: Boolean(forceWithoutCollection),
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

