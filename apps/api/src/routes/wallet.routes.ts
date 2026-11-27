import { Router, type NextFunction, type Response } from 'express';
import { UserRole } from '@diagnostic/shared';
import { config } from '../config/env';
import { requireAuth, requireRoles } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  type AuthenticatedRequest,
  requireAnyPermission,
  requirePermissions,
} from '../middleware/rbac';
import {
  getPhleboPaymentSummary,
  savePhleboBankAccount,
  savePhleboUpiAccount,
} from '../services/phleboBank.service';
import {
  deleteBeneficiaryQr,
  getBeneficiaryPayoutSummary,
  getBeneficiaryQrPreview,
  revealSensitiveBeneficiaryBankForAdmin,
  saveBeneficiaryBankAccount,
  saveBeneficiaryQr,
  saveBeneficiaryUpiAccount,
  setBeneficiaryDefaultMethod,
} from '../services/beneficiaryPayout.service';
import {
  getPhleboWallet,
  getPrivatePhleboQrForAdmin,
  getWithdrawalConfig,
  listAllWithdrawalsForAdmin,
  listWalletTransactions,
  listWithdrawalsByPhlebo,
  reconcileWalletsAndWithdrawals,
  requestPhleboWithdrawal,
  savePhleboQrImage,
  settleWithdrawalManuallyByAdmin,
  transitionWithdrawalStatusByAdmin,
  updateWithdrawalConfig,
} from '../services/wallet.service';

export const walletRouter = Router();

// Simple per-user rate limiter for sensitive withdrawal & bank endpoints
const rateBucket = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxRequests = 20, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateBucket.get(key);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= maxRequests) {
    throw new AppError('Too many requests. Please wait a minute before retrying.', 429, 'RATE_LIMITED');
  }
  entry.count += 1;
}

function getPhleboId(req: AuthenticatedRequest): string {
  const id = req.user?.phlebotomistId || req.user?.uid;
  if (!id) throw new AppError('Phlebotomist identity missing.', 401, 'UNAUTHORIZED');
  return id;
}

function getLargeLabId(req: AuthenticatedRequest): string {
  const id = req.user?.labId || req.user?.uid;
  if (!id) throw new AppError('Large Lab identity missing.', 401, 'UNAUTHORIZED');
  return id;
}

// ===========================================================================
// PHLEBO WALLET, WITHDRAWALS & PAYOUT PROFILE
// ===========================================================================
walletRouter.get(
  '/phlebo/wallet',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      const [wallet, cfg] = await Promise.all([getPhleboWallet(phleboId), getWithdrawalConfig()]);
      res.json({ success: true, data: { wallet, config: cfg }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/phlebo/wallet/transactions',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      const data = await listWalletTransactions(phleboId);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/phlebo/wallet/withdrawals',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      const data = await listWithdrawalsByPhlebo(phleboId);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/phlebo/wallet/withdrawals',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      checkRateLimit(`wd:${phleboId}`, 6, 60_000);
      const requestedAmountPaise = Number(req.body?.requestedAmountPaise);
      const paymentMethod = req.body?.paymentMethod as 'BANK_ACCOUNT' | 'UPI' | undefined;

      const result = await requestPhleboWithdrawal({
        phleboId,
        phleboName: req.user?.displayName || req.user?.email || phleboId,
        requestedAmountPaise,
        paymentMethod,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/phlebo/payout-profile',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getPhleboId(req);
      let data = await getBeneficiaryPayoutSummary('PHLEBOTOMIST', id);
      if (!data.bankAccount && !data.upiAccount) {
        data = await getPhleboPaymentSummary(id);
      }
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/phlebo/payout-profile',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      checkRateLimit(`pp:${phleboId}`, 10, 60_000);
      const { type } = req.body || {};
      if (type === 'SET_DEFAULT') {
        const data = await setBeneficiaryDefaultMethod({
          beneficiaryType: 'PHLEBOTOMIST',
          beneficiaryId: phleboId,
          defaultMethod: req.body?.defaultMethod === 'UPI' ? 'UPI' : 'BANK_ACCOUNT',
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
        });
        res.json({ success: true, data, timestamp: new Date().toISOString() });
        return;
      }
      if (type === 'UPI') {
        const data = await saveBeneficiaryUpiAccount({
          beneficiaryType: 'PHLEBOTOMIST',
          beneficiaryId: phleboId,
          upiId: String(req.body?.upiId || ''),
          confirmUpiId: String(req.body?.confirmUpiId || ''),
          makeDefault: Boolean(req.body?.makeDefault),
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
        });
        res.json({ success: true, data, timestamp: new Date().toISOString() });
        return;
      }
      const data = await saveBeneficiaryBankAccount({
        beneficiaryType: 'PHLEBOTOMIST',
        beneficiaryId: phleboId,
        accountHolderName: String(req.body?.accountHolderName || ''),
        accountNumber: String(req.body?.accountNumber || ''),
        confirmAccountNumber: String(req.body?.confirmAccountNumber || ''),
        ifscCode: String(req.body?.ifscCode || ''),
        selectedBankCode: req.body?.selectedBankCode ? String(req.body.selectedBankCode) : undefined,
        makeDefault: req.body?.makeDefault !== false,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/phlebo/payout-profile/qr',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      const data = await getBeneficiaryQrPreview({
        beneficiaryType: 'PHLEBOTOMIST',
        beneficiaryId: phleboId,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/phlebo/payout-profile/qr',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      checkRateLimit(`qr:${phleboId}`, 8, 60_000);
      const data = await saveBeneficiaryQr({
        beneficiaryType: 'PHLEBOTOMIST',
        beneficiaryId: phleboId,
        mimeType: String(req.body?.mimeType || 'image/png'),
        base64Data: String(req.body?.base64Data || ''),
        source: req.body?.source === 'GENERATED_FROM_UPI' ? 'GENERATED_FROM_UPI' : 'UPLOADED',
        decodedUpiUri: req.body?.decodedUpiUri ? String(req.body.decodedUpiUri) : undefined,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.delete(
  '/phlebo/payout-profile/qr',
  requireAuth,
  requireRoles(UserRole.PHLEBOTOMIST),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const phleboId = getPhleboId(req);
      const data = await deleteBeneficiaryQr({
        beneficiaryType: 'PHLEBOTOMIST',
        beneficiaryId: phleboId,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

// ===========================================================================
// LARGE LAB WALLET, WITHDRAWALS & UNIFIED PAYOUT PROFILE
// ===========================================================================
walletRouter.get(
  '/large-lab/payout-profile',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await getBeneficiaryPayoutSummary('LARGE_LAB', getLargeLabId(req));
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/large-lab/payout-profile',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = getLargeLabId(req);
      checkRateLimit(`llpp:${labId}`, 10, 60_000);
      const { type } = req.body || {};
      if (type === 'SET_DEFAULT') {
        const data = await setBeneficiaryDefaultMethod({
          beneficiaryType: 'LARGE_LAB',
          beneficiaryId: labId,
          defaultMethod: req.body?.defaultMethod === 'UPI' ? 'UPI' : 'BANK_ACCOUNT',
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
        });
        res.json({ success: true, data, timestamp: new Date().toISOString() });
        return;
      }
      if (type === 'UPI') {
        const data = await saveBeneficiaryUpiAccount({
          beneficiaryType: 'LARGE_LAB',
          beneficiaryId: labId,
          upiId: String(req.body?.upiId || ''),
          confirmUpiId: req.body?.confirmUpiId !== undefined ? String(req.body.confirmUpiId) : undefined,
          makeDefault: Boolean(req.body?.makeDefault),
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
        });
        res.json({ success: true, data, timestamp: new Date().toISOString() });
        return;
      }
      const data = await saveBeneficiaryBankAccount({
        beneficiaryType: 'LARGE_LAB',
        beneficiaryId: labId,
        accountHolderName: String(req.body?.accountHolderName || ''),
        accountNumber: String(req.body?.accountNumber || ''),
        confirmAccountNumber: String(req.body?.confirmAccountNumber || ''),
        ifscCode: String(req.body?.ifscCode || ''),
        selectedBankCode: req.body?.selectedBankCode ? String(req.body.selectedBankCode) : undefined,
        makeDefault: req.body?.makeDefault !== false,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/large-lab/payout-profile/qr',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await getBeneficiaryQrPreview({
        beneficiaryType: 'LARGE_LAB',
        beneficiaryId: getLargeLabId(req),
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/large-lab/payout-profile/qr',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = getLargeLabId(req);
      checkRateLimit(`llqr:${labId}`, 8, 60_000);
      const data = await saveBeneficiaryQr({
        beneficiaryType: 'LARGE_LAB',
        beneficiaryId: labId,
        mimeType: String(req.body?.mimeType || 'image/png'),
        base64Data: String(req.body?.base64Data || ''),
        source: req.body?.source === 'GENERATED_FROM_UPI' ? 'GENERATED_FROM_UPI' : 'UPLOADED',
        decodedUpiUri: req.body?.decodedUpiUri ? String(req.body.decodedUpiUri) : undefined,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.delete(
  '/large-lab/payout-profile/qr',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await deleteBeneficiaryQr({
        beneficiaryType: 'LARGE_LAB',
        beneficiaryId: getLargeLabId(req),
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/large-lab/wallet',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = getLargeLabId(req);
      const [wallet, cfg] = await Promise.all([getPhleboWallet(labId), getWithdrawalConfig()]);
      res.json({ success: true, data: { wallet, config: cfg }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/large-lab/wallet/withdrawals',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await listWithdrawalsByPhlebo(getLargeLabId(req));
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/large-lab/wallet/withdrawals',
  requireAuth,
  requireRoles(UserRole.LARGE_LAB),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = getLargeLabId(req);
      checkRateLimit(`llwd:${labId}`, 6, 60_000);
      const requestedAmountPaise = Number(req.body?.requestedAmountPaise);
      const paymentMethod = req.body?.paymentMethod as 'BANK_ACCOUNT' | 'UPI' | undefined;
      const result = await requestPhleboWithdrawal({
        beneficiaryType: 'LARGE_LAB',
        phleboId: labId,
        phleboName: req.user?.displayName || req.user?.email || labId,
        requestedAmountPaise,
        paymentMethod,
      });
      res.status(201).json({
        success: true,
        data: result,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ===========================================================================
// ADMIN WITHDRAWALS & MANUAL SETTLEMENT WORKFLOW
// ===========================================================================
walletRouter.get(
  '/admin/withdrawals',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'CONFIGURE_COMMISSIONS_PAYOUTS', 'MANAGE_RECONCILIATION'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [all, cfg] = await Promise.all([listAllWithdrawalsForAdmin(), getWithdrawalConfig()]);
      res.json({ success: true, data: { ...all, config: cfg }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/admin/withdrawals/:id',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'CONFIGURE_COMMISSIONS_PAYOUTS', 'MANAGE_RECONCILIATION'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { requests, settlements } = await listAllWithdrawalsForAdmin();
      const request = requests.find((r) => r.id === req.params.id);
      if (!request) throw new AppError('Withdrawal request not found.', 404, 'NOT_FOUND');
      const beneficiaryType = request.beneficiaryType || 'PHLEBOTOMIST';
      let payoutProfile = await getBeneficiaryPayoutSummary(beneficiaryType, request.phleboId);
      if (beneficiaryType === 'PHLEBOTOMIST' && !payoutProfile.bankAccount && !payoutProfile.upiAccount) {
        payoutProfile = await getPhleboPaymentSummary(request.phleboId);
      }
      let qrAccess = await getBeneficiaryQrPreview({
        beneficiaryType,
        beneficiaryId: request.phleboId,
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        isAdminAccess: true,
      });
      if (!qrAccess.available && beneficiaryType === 'PHLEBOTOMIST') {
        qrAccess = await getPrivatePhleboQrForAdmin(request.phleboId);
      }
      const wallet = await getPhleboWallet(request.phleboId);
      let sensitiveDetails: { accountNumber?: string; upiId?: string } | undefined;
      if (req.query.reveal === '1') {
        sensitiveDetails = await revealSensitiveBeneficiaryBankForAdmin({
          beneficiaryType,
          beneficiaryId: request.phleboId,
          adminUid: req.user?.uid,
          adminEmail: req.user?.email,
        });
      }
      const settlement = settlements.find((s) => s.withdrawalRequestId === request.id) || null;
      res.json({
        success: true,
        data: { request, payoutProfile, qrAccess, wallet, settlement, sensitiveDetails },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/admin/withdrawals/:id/review',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await transitionWithdrawalStatusByAdmin({
        requestId: req.params.id,
        targetStatus: 'UNDER_REVIEW',
        reason: req.body?.reason,
        adminUid: req.user?.uid || 'admin',
        adminEmail: req.user?.email || config.admin.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/admin/withdrawals/:id/hold',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await transitionWithdrawalStatusByAdmin({
        requestId: req.params.id,
        targetStatus: 'ON_HOLD',
        reason: req.body?.reason,
        adminUid: req.user?.uid || 'admin',
        adminEmail: req.user?.email || config.admin.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/admin/withdrawals/:id/reject',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await transitionWithdrawalStatusByAdmin({
        requestId: req.params.id,
        targetStatus: 'REJECTED',
        reason: req.body?.reason,
        adminUid: req.user?.uid || 'admin',
        adminEmail: req.user?.email || config.admin.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/admin/withdrawals/:id/process',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await transitionWithdrawalStatusByAdmin({
        requestId: req.params.id,
        targetStatus: 'PROCESSING_MANUALLY',
        reason: req.body?.reason,
        adminUid: req.user?.uid || 'admin',
        adminEmail: req.user?.email || config.admin.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.post(
  '/admin/withdrawals/:id/settle',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await settleWithdrawalManuallyByAdmin({
        requestId: req.params.id,
        actualAmountPaise: Number(req.body?.actualAmountPaise),
        paymentMethod: req.body?.paymentMethod || 'UPI',
        transactionReference: String(req.body?.transactionReference || ''),
        paymentDate: String(req.body?.paymentDate || ''),
        paymentTime: String(req.body?.paymentTime || ''),
        receiptStoragePath: req.body?.receiptStoragePath ? String(req.body.receiptStoragePath) : undefined,
        remarks: req.body?.remarks ? String(req.body.remarks) : undefined,
        adminUid: req.user?.uid || 'admin',
        adminEmail: req.user?.email || config.admin.email,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/admin/finance/settlements',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'CONFIGURE_COMMISSIONS_PAYOUTS', 'MANAGE_RECONCILIATION'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { settlements } = await listAllWithdrawalsForAdmin();
      res.json({ success: true, data: settlements, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.get(
  '/admin/finance/reconciliation',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'MANAGE_RECONCILIATION'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await reconcileWalletsAndWithdrawals();
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);

walletRouter.patch(
  '/admin/finance/withdrawal-config',
  requireAuth,
  requireRoles(UserRole.ADMIN),
  requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await updateWithdrawalConfig(req.body || {}, req.user?.email || config.admin.email);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }
);
