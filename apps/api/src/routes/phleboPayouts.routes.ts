import { Router, type NextFunction, type Response } from 'express';
import { UserRole } from '@diagnostic/shared';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';
import { requireAuth, requireRoles } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  type AuthenticatedRequest,
  requireAnyPermission,
  requirePermissions,
} from '../middleware/rbac';
import { listSupportedBanks, lookupIfscDetails } from '../services/bankDirectory.service';
import {
  getPhleboPaymentSummary,
  revealPhleboSensitiveDetailsForAdmin,
  savePhleboBankAccount,
  savePhleboUpiAccount,
  setPhleboDefaultMethod,
  verifyPhleboPaymentMethodByAdmin,
} from '../services/phleboBank.service';
import {
  getLedgerRecord,
  holdPhleboPayout,
  initiatePhleboPayout,
  listPhleboPayoutsForDashboard,
  manualReconcilePhleboPayout,
  saveLedgerRecord,
} from '../services/payoutEngine.service';

export const phleboPayoutsRouter = Router();

function resolvePhleboIdentity(req: AuthenticatedRequest): string {
  const id = req.user?.phlebotomistId || req.user?.uid;
  if (!id) throw new AppError('Phlebotomist identity not found.', 401, 'UNAUTHORIZED');
  return id;
}

// Public/Auth Bank Directory & IFSC Lookup (no secrets exposed to mobile app)
phleboPayoutsRouter.get('/banks', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const data = listSupportedBanks(q);
  res.json({ success: true, data, timestamp: new Date().toISOString() });
});

phleboPayoutsRouter.get('/ifsc/:code', requireAuth, async (req, res, next) => {
  try {
    const data = await lookupIfscDetails(req.params.code);
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// Phlebo Self-Service Bank & UPI Endpoints
phleboPayoutsRouter.get(
  '/my-payment-methods',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetId =
        req.user?.role === UserRole.ADMIN && typeof req.query.phleboId === 'string'
          ? req.query.phleboId
          : resolvePhleboIdentity(req);
      const data = await getPhleboPaymentSummary(targetId);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.put(
  '/my-bank-account',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = resolvePhleboIdentity(req);
      const { accountHolderName, accountNumber, confirmAccountNumber, ifscCode, selectedBankCode, makeDefault } =
        req.body || {};
      const data = await savePhleboBankAccount({
        phleboId,
        accountHolderName: String(accountHolderName || ''),
        accountNumber: String(accountNumber || ''),
        confirmAccountNumber: String(confirmAccountNumber || ''),
        ifscCode: String(ifscCode || ''),
        selectedBankCode: selectedBankCode ? String(selectedBankCode) : undefined,
        makeDefault: makeDefault !== false,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({
        success: true,
        data,
        message: 'Bank account encrypted and saved. Verification required before payouts.',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.put(
  '/my-upi-account',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = resolvePhleboIdentity(req);
      const { upiId, confirmUpiId, makeDefault } = req.body || {};
      const data = await savePhleboUpiAccount({
        phleboId,
        upiId: String(upiId || ''),
        confirmUpiId: String(confirmUpiId || ''),
        makeDefault: Boolean(makeDefault),
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({
        success: true,
        data,
        message: 'UPI ID encrypted and saved. Verification required before payouts.',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.patch(
  '/my-default-method',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = resolvePhleboIdentity(req);
      const method = req.body?.method;
      if (method !== 'BANK_ACCOUNT' && method !== 'UPI') {
        throw new AppError('Invalid payout method. Must be BANK_ACCOUNT or UPI.', 400, 'BAD_REQUEST');
      }
      const data = await setPhleboDefaultMethod(phleboId, method, req.user?.uid, req.user?.email);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.get(
  '/my-payouts',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = resolvePhleboIdentity(req);
      const { ledgers } = await listPhleboPayoutsForDashboard(phleboId);
      const sorted = [...ledgers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const sumPaise = (statuses: string[]) =>
        sorted
          .filter((l) => statuses.includes(l.status))
          .reduce((acc, l) => acc + l.netPayablePaise, 0) / 100;

      res.json({
        success: true,
        data: {
          summary: {
            availableInr: sumPaise(['READY_FOR_PAYOUT']),
            pendingInr: sumPaise(['NOT_ELIGIBLE', 'PENDING', 'ON_HOLD']),
            processingInr: sumPaise(['PROCESSING', 'INITIATED']),
            paidInr: sumPaise(['PROCESSED', 'SETTLED']),
            failedInr: sumPaise(['FAILED', 'REVERSED', 'NEEDS_REVIEW']),
            lastPayout: sorted.find((l) => ['PROCESSED', 'SETTLED'].includes(l.status)) || null,
          },
          payouts: sorted,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// Admin Finance -> Phlebo Payouts Dashboard & Controls
phleboPayoutsRouter.get(
  '/admin/overview',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'CONFIGURE_COMMISSIONS_PAYOUTS', 'MANAGE_RECONCILIATION'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { ledgers, errors } = await listPhleboPayoutsForDashboard();
      const { db, isMockMode } = initializeFirebase();
      let missingBankCount = 0;
      let unverifiedBankCount = 0;

      if (db && !isMockMode) {
        const [phSnap, mSnap] = await Promise.all([
          db.collection('phlebotomists').limit(300).get(),
          db.collection('phlebo_payment_methods').limit(300).get(),
        ]);
        const methodMap = new Map<string, Record<string, unknown>>();
        mSnap.docs.forEach((d) => methodMap.set(d.id, d.data() as Record<string, unknown>));
        phSnap.docs.forEach((d) => {
          const m = methodMap.get(d.id);
          if (!m || (!m.bankLast4 && !m.maskedUpiId)) {
            missingBankCount += 1;
          } else if (m.bankVerificationStatus !== 'VERIFIED' && m.upiVerificationStatus !== 'VERIFIED') {
            unverifiedBankCount += 1;
          }
        });
      }

      const sumInr = (statuses: string[]) =>
        ledgers.filter((l) => statuses.includes(l.status)).reduce((s, l) => s + l.netPayablePaise, 0) / 100;

      res.json({
        success: true,
        data: {
          kpis: {
            totalEarningsInr: ledgers.reduce((s, l) => s + l.grossEarningPaise, 0) / 100,
            totalPendingInr: sumInr(['NOT_ELIGIBLE', 'PENDING', 'READY_FOR_PAYOUT']),
            totalProcessingInr: sumInr(['PROCESSING', 'INITIATED']),
            totalPaidInr: sumInr(['PROCESSED', 'SETTLED']),
            totalFailedInr: sumInr(['FAILED', 'NEEDS_REVIEW']),
            totalOnHoldInr: sumInr(['ON_HOLD']),
            totalReversedInr: sumInr(['REVERSED']),
            missingBankCount,
            unverifiedBankCount,
          },
          ledgers: [...ledgers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          errors: [...errors].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          providerConfig: {
            razorpayXEnabled: Boolean(config.razorpay.xAccountNumber),
            webhookSecretConfigured: Boolean(config.razorpay.webhookSecret),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.post(
  '/admin/verify-method',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { phleboId, target, status, notes } = req.body || {};
      if (!phleboId || (target !== 'BANK_ACCOUNT' && target !== 'UPI') || (status !== 'VERIFIED' && status !== 'FAILED')) {
        throw new AppError('Invalid verification payload.', 400, 'BAD_REQUEST');
      }
      const data = await verifyPhleboPaymentMethodByAdmin({
        phleboId,
        target,
        status,
        notes,
        adminUid: req.user?.uid,
        adminEmail: req.user?.email || config.admin.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.post(
  '/admin/reveal-bank',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { phleboId, reason } = req.body || {};
      if (!phleboId || !reason) {
        throw new AppError('phleboId and audit reason are required.', 400, 'AUDIT_REASON_REQUIRED');
      }
      const data = await revealPhleboSensitiveDetailsForAdmin({
        phleboId: String(phleboId),
        reason: String(reason),
        adminUid: req.user?.uid || 'admin',
        adminEmail: req.user?.email || config.admin.email,
        adminRole: req.user?.role,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.post(
  '/admin/:ledgerId/retry',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await getLedgerRecord(req.params.ledgerId);
      if (!existing) throw new AppError('Payout ledger entry not found.', 404, 'NOT_FOUND');
      const { db, isMockMode } = initializeFirebase();
      let ordData: Record<string, unknown> = {};
      if (db && !isMockMode) {
        const ordSnap = await db.collection('orders').doc(existing.bookingId).get();
        if (ordSnap.exists) ordData = ordSnap.data() as Record<string, unknown>;
      }
      const updated = await initiatePhleboPayout({
        bookingId: existing.bookingId,
        orderNumber: existing.orderNumber,
        settlementId: existing.settlementId,
        phleboId: existing.phleboId,
        phleboName: existing.phleboName,
        grossEarningInr: existing.grossEarningInr,
        platformFeeInr: existing.platformFeeInr,
        paymentStatus: String(ordData.paymentStatus || 'PAID'),
        paymentCaptured: true,
        sourcePaymentId: existing.sourcePaymentId || (ordData.razorpayPaymentId ? String(ordData.razorpayPaymentId) : undefined),
        orderStatus: String(ordData.status || 'DELIVERED_TO_LARGE_LAB'),
        handoverCompleted: true,
        actorEmail: req.user?.email,
      });
      await saveLedgerRecord({ ...updated, retryCount: (existing.retryCount || 0) + 1 });
      res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.post(
  '/admin/:ledgerId/hold',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await holdPhleboPayout(
        req.params.ledgerId,
        String(req.body?.reason || 'Placed on hold by Admin'),
        req.user?.email || config.admin.email
      );
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

phleboPayoutsRouter.post(
  '/admin/:ledgerId/manual-reconcile',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await manualReconcilePhleboPayout({
        ledgerId: req.params.ledgerId,
        utrNumber: String(req.body?.utrNumber || ''),
        notes: req.body?.notes ? String(req.body.notes) : undefined,
        adminEmail: req.user?.email || config.admin.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);
