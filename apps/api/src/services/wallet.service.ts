import crypto from 'node:crypto';
import {
  deepCleanFirestorePayload,
  type FinancialAuditLog,
  type ManualPaymentMethod,
  type ManualSettlementRecord,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type PhleboWallet,
  UserRole,
  type WalletReconciliationReport,
  type WalletTransaction,
  type WithdrawalConfig,
  type WithdrawalRequest,
  type WithdrawalStatus,
} from '@diagnostic/shared';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { sendPlatformNotification } from './notification.service';
import { getPhleboPaymentSummary } from './phleboBank.service';

const DEFAULT_WITHDRAWAL_CONFIG: WithdrawalConfig = {
  minWithdrawalPaise: 10000, // ₹100
  cycleDays: 7,
  platformFeePct: 0,
  rejectionPolicy: 'ALLOW_RETRY_IN_CYCLE',
  autoCreditOnHandover: true,
  updatedAt: new Date().toISOString(),
};

// In-memory stores for deterministic mock/test mode
const memWallets = new Map<string, PhleboWallet>();
const memTransactions = new Map<string, WalletTransaction>();
const memWithdrawals = new Map<string, WithdrawalRequest>();
const memSettlements = new Map<string, ManualSettlementRecord>();
const memAuditLogs = new Map<string, FinancialAuditLog>();
const memQrStore = new Map<string, { mimeType: string; base64: string; updatedAt: string }>();
let memConfig: WithdrawalConfig = { ...DEFAULT_WITHDRAWAL_CONFIG };
const memMutexes = new Set<string>();

export function resetInMemoryWalletStores() {
  memWallets.clear();
  memTransactions.clear();
  memWithdrawals.clear();
  memSettlements.clear();
  memAuditLogs.clear();
  memQrStore.clear();
  memConfig = { ...DEFAULT_WITHDRAWAL_CONFIG };
  memMutexes.clear();
}

export function toPaiseInt(inr: number): number {
  if (!Number.isFinite(inr)) return 0;
  return Math.round(inr * 100);
}

export function maskTrxRef(ref: string): string {
  const clean = ref.trim();
  if (clean.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
}

async function appendFinancialAudit(entry: Omit<FinancialAuditLog, 'id' | 'timestamp'>) {
  const now = new Date().toISOString();
  const id = `FAUD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const doc: FinancialAuditLog = { id, ...entry, timestamp: now };
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('financialAuditLogs').doc(id).set(deepCleanFirestorePayload(doc));
  } else {
    memAuditLogs.set(id, doc);
  }
  return doc;
}

export async function getWithdrawalConfig(): Promise<WithdrawalConfig> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('settings').doc('withdrawalConfig').get();
    if (snap.exists) {
      return { ...DEFAULT_WITHDRAWAL_CONFIG, ...(snap.data() as Partial<WithdrawalConfig>) };
    }
  }
  return { ...memConfig };
}

export async function updateWithdrawalConfig(
  patch: Partial<WithdrawalConfig>,
  adminEmail: string
): Promise<WithdrawalConfig> {
  const now = new Date().toISOString();
  const current = await getWithdrawalConfig();
  const next: WithdrawalConfig = {
    ...current,
    ...(typeof patch.minWithdrawalPaise === 'number' && patch.minWithdrawalPaise >= 100
      ? { minWithdrawalPaise: Math.round(patch.minWithdrawalPaise) }
      : {}),
    ...(typeof patch.cycleDays === 'number' && patch.cycleDays >= 1
      ? { cycleDays: Math.round(patch.cycleDays) }
      : {}),
    ...(typeof patch.platformFeePct === 'number' && patch.platformFeePct >= 0 && patch.platformFeePct <= 50
      ? { platformFeePct: patch.platformFeePct }
      : {}),
    ...(patch.rejectionPolicy ? { rejectionPolicy: patch.rejectionPolicy } : {}),
    ...(typeof patch.autoCreditOnHandover === 'boolean'
      ? { autoCreditOnHandover: patch.autoCreditOnHandover }
      : {}),
    updatedAt: now,
    updatedBy: adminEmail,
  };
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('settings').doc('withdrawalConfig').set(deepCleanFirestorePayload(next), { merge: true });
  } else {
    memConfig = next;
  }
  return next;
}

function emptyWallet(phleboId: string, phleboName?: string): PhleboWallet {
  const now = new Date().toISOString();
  return {
    phleboId,
    ...(phleboName ? { phleboName } : {}),
    availableBalancePaise: 0,
    withdrawalEligibleBalancePaise: 0,
    pendingWithdrawalPaise: 0,
    onHoldBalancePaise: 0,
    totalEarnedPaise: 0,
    totalSettledPaise: 0,
    thisWeekEarningsPaise: 0,
    thisMonthEarningsPaise: 0,
    updatedAt: now,
    createdAt: now,
  };
}

export async function getPhleboWallet(phleboId: string): Promise<PhleboWallet> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('wallets').doc(phleboId).get();
    if (snap.exists) return snap.data() as PhleboWallet;
    return emptyWallet(phleboId);
  }
  return memWallets.get(phleboId) || emptyWallet(phleboId);
}

export async function listWalletTransactions(phleboId: string): Promise<WalletTransaction[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db
      .collection('walletTransactions')
      .where('phleboId', '==', phleboId)
      .limit(200)
      .get();
    return snap.docs
      .map((d) => d.data() as WalletTransaction)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return Array.from(memTransactions.values())
    .filter((t) => t.phleboId === phleboId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * PHASE 3: Automatic Earning Credit on Booking Handover/Completion.
 * Strictly atomic and idempotent (one credit per bookingId + phleboId).
 */
export async function creditBookingEarningAtomically(params: {
  bookingId: string;
  orderNumber: string;
  phleboId: string;
  phleboName?: string;
  grossEarningInr: number;
  handoverConfirmed: boolean;
  otpOrLabConfirmed: boolean;
}): Promise<{ credited: boolean; duplicatePrevented: boolean; transaction: WalletTransaction; wallet: PhleboWallet }> {
  if (!params.phleboId) {
    throw new AppError('Assigned Phlebo ID is required to credit wallet.', 400, 'PHLEBO_REQUIRED');
  }
  if (!params.handoverConfirmed || !params.otpOrLabConfirmed) {
    throw new AppError(
      'Handover and OTP/Lab confirmation are required before crediting earning.',
      400,
      'HANDOVER_NOT_CONFIRMED'
    );
  }

  const cfg = await getWithdrawalConfig();
  const grossPaise = Math.max(0, toPaiseInt(params.grossEarningInr));
  const feePaise = Math.round((grossPaise * (cfg.platformFeePct || 0)) / 100);
  const netPaise = Math.max(0, grossPaise - feePaise);
  if (netPaise <= 0) {
    throw new AppError('Net earning must be greater than zero.', 400, 'INVALID_EARNING_AMOUNT');
  }

  const idempotencyKey = `earn_${params.bookingId}_${params.phleboId}`;
  const txId = `WTX-${crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16).toUpperCase()}`;
  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();

  let walletAfter: PhleboWallet;
  let txRecord: WalletTransaction;
  let duplicatePrevented = false;

  if (db && !isMockMode) {
    const walletRef = db.collection('wallets').doc(params.phleboId);
    const txRef = db.collection('walletTransactions').doc(txId);
    const result = await db.runTransaction(async (trx) => {
      const [wSnap, tSnap] = await Promise.all([trx.get(walletRef), trx.get(txRef)]);
      if (tSnap.exists) {
        return {
          duplicatePrevented: true,
          transaction: tSnap.data() as WalletTransaction,
          wallet: wSnap.exists ? (wSnap.data() as PhleboWallet) : emptyWallet(params.phleboId, params.phleboName),
        };
      }
      const prev = wSnap.exists
        ? (wSnap.data() as PhleboWallet)
        : emptyWallet(params.phleboId, params.phleboName);
      const nextWallet: PhleboWallet = {
        ...prev,
        ...(params.phleboName ? { phleboName: params.phleboName } : {}),
        availableBalancePaise: prev.availableBalancePaise + netPaise,
        withdrawalEligibleBalancePaise: prev.withdrawalEligibleBalancePaise + netPaise,
        totalEarnedPaise: prev.totalEarnedPaise + netPaise,
        thisWeekEarningsPaise: prev.thisWeekEarningsPaise + netPaise,
        thisMonthEarningsPaise: prev.thisMonthEarningsPaise + netPaise,
        updatedAt: now,
      };
      const newTx: WalletTransaction = {
        id: txId,
        phleboId: params.phleboId,
        bookingId: params.bookingId,
        orderNumber: params.orderNumber,
        type: 'BOOKING_EARNING',
        grossEarningPaise: grossPaise,
        platformFeePaise: feePaise,
        netEarningPaise: netPaise,
        amountPaise: netPaise,
        status: 'COMPLETED',
        description: `Sample pickup & handover completed (${params.orderNumber})`,
        idempotencyKey,
        auditMetadata: { grossPaise, feePaise, netPaise },
        createdAt: now,
      };
      trx.set(walletRef, deepCleanFirestorePayload(nextWallet), { merge: true });
      trx.set(txRef, deepCleanFirestorePayload(newTx));
      return { duplicatePrevented: false, transaction: newTx, wallet: nextWallet };
    });
    duplicatePrevented = result.duplicatePrevented;
    txRecord = result.transaction;
    walletAfter = result.wallet;
  } else {
    const existingTx = memTransactions.get(txId);
    if (existingTx) {
      duplicatePrevented = true;
      txRecord = existingTx;
      walletAfter = memWallets.get(params.phleboId) || emptyWallet(params.phleboId, params.phleboName);
    } else {
      const prev = memWallets.get(params.phleboId) || emptyWallet(params.phleboId, params.phleboName);
      walletAfter = {
        ...prev,
        ...(params.phleboName ? { phleboName: params.phleboName } : {}),
        availableBalancePaise: prev.availableBalancePaise + netPaise,
        withdrawalEligibleBalancePaise: prev.withdrawalEligibleBalancePaise + netPaise,
        totalEarnedPaise: prev.totalEarnedPaise + netPaise,
        thisWeekEarningsPaise: prev.thisWeekEarningsPaise + netPaise,
        thisMonthEarningsPaise: prev.thisMonthEarningsPaise + netPaise,
        updatedAt: now,
      };
      txRecord = {
        id: txId,
        phleboId: params.phleboId,
        bookingId: params.bookingId,
        orderNumber: params.orderNumber,
        type: 'BOOKING_EARNING',
        grossEarningPaise: grossPaise,
        platformFeePaise: feePaise,
        netEarningPaise: netPaise,
        amountPaise: netPaise,
        status: 'COMPLETED',
        description: `Sample pickup & handover completed (${params.orderNumber})`,
        idempotencyKey,
        auditMetadata: { grossPaise, feePaise, netPaise },
        createdAt: now,
      };
      memWallets.set(params.phleboId, walletAfter);
      memTransactions.set(txId, txRecord);
    }
  }

  if (!duplicatePrevented) {
    await appendFinancialAudit({
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      action: 'BOOKING_EARNING_CREDITED',
      entityType: 'WALLET_TRANSACTION',
      entityId: txId,
      newStatus: 'COMPLETED',
      reason: `Booking ${params.orderNumber} credited ₹${(netPaise / 100).toFixed(2)}`,
    });

    await sendPlatformNotification({
      title: `Wallet Credited: ₹${(netPaise / 100).toLocaleString('en-IN')} (${params.orderNumber})`,
      message: `Your earning of ₹${(netPaise / 100).toLocaleString('en-IN')} for ${params.orderNumber} has been credited to your LabSetu Wallet.`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: NotificationPriority.NORMAL,
      recipientRole: UserRole.PHLEBOTOMIST,
      orderId: params.bookingId,
      channels: [NotificationChannel.IN_APP],
    });
  }

  return { credited: !duplicatePrevented, duplicatePrevented, transaction: txRecord, wallet: walletAfter };
}

/**
 * PHASE 4 & 5: Strict 7-Day Weekly Withdrawal Request
 */
export async function requestPhleboWithdrawal(params: {
  phleboId: string;
  phleboName: string;
  phleboPhone?: string;
  kycVerified?: boolean;
  requestedAmountPaise: number;
  paymentMethod?: 'BANK_ACCOUNT' | 'UPI';
  nowMs?: number; // injectable clock for deterministic 7-day cycle testing
}): Promise<{ request: WithdrawalRequest; wallet: PhleboWallet; message: string }> {
  const lockKey = `wd_${params.phleboId}`;
  if (memMutexes.has(lockKey)) {
    throw new AppError('Another withdrawal request is currently being processed.', 409, 'CONCURRENT_WITHDRAWAL');
  }
  memMutexes.add(lockKey);

  try {
    const cfg = await getWithdrawalConfig();
    const nowDate = new Date(params.nowMs ?? Date.now());
    const nowIso = nowDate.toISOString();
    const amt = Math.round(params.requestedAmountPaise);

    if (!Number.isFinite(amt) || amt < cfg.minWithdrawalPaise) {
      throw new AppError(
        `Minimum withdrawal amount is ₹${(cfg.minWithdrawalPaise / 100).toFixed(0)}.`,
        400,
        'BELOW_MIN_WITHDRAWAL'
      );
    }

    const payoutSummary = await getPhleboPaymentSummary(params.phleboId);
    const chosenMethod =
      params.paymentMethod ||
      (payoutSummary.defaultMethod !== 'NONE' ? payoutSummary.defaultMethod : 'BANK_ACCOUNT');

    if (chosenMethod === 'BANK_ACCOUNT') {
      if (!payoutSummary.bankAccount) {
        throw new AppError('Add your bank account in Profile → Bank & Payment Details first.', 400, 'BANK_DETAILS_NOT_ADDED');
      }
      if (payoutSummary.bankAccount.verificationStatus !== 'VERIFIED') {
        throw new AppError('Your bank account must be verified before requesting a withdrawal.', 400, 'BANK_DETAILS_NOT_VERIFIED');
      }
    } else {
      if (!payoutSummary.upiAccount) {
        throw new AppError('Add your UPI ID in Profile → Bank & Payment Details first.', 400, 'BANK_DETAILS_NOT_ADDED');
      }
      if (payoutSummary.upiAccount.verificationStatus !== 'VERIFIED') {
        throw new AppError('Your UPI ID must be verified before requesting a withdrawal.', 400, 'BANK_DETAILS_NOT_VERIFIED');
      }
    }

    const maskedDest =
      chosenMethod === 'BANK_ACCOUNT'
        ? `${payoutSummary.bankAccount!.bankName} ${payoutSummary.bankAccount!.maskedAccountNumber} (${payoutSummary.bankAccount!.ifsc})`
        : payoutSummary.upiAccount!.maskedUpiId;

    const existingWithdrawals = await listWithdrawalsByPhlebo(params.phleboId);
    const activePending = existingWithdrawals.find((w) =>
      ['PENDING_ADMIN_SETTLEMENT', 'UNDER_REVIEW', 'ON_HOLD', 'PROCESSING_MANUALLY', 'NEEDS_REVIEW'].includes(w.status)
    );
    if (activePending) {
      throw new AppError(
        `You already have an active withdrawal request (${activePending.id} - ${activePending.status}). Wait until it is completed.`,
        400,
        'PENDING_WITHDRAWAL_EXISTS'
      );
    }

    const cycleMs = cfg.cycleDays * 24 * 60 * 60 * 1000;
    const recentCycleBlocking = existingWithdrawals.find((w) => {
      if (w.status === 'REJECTED' && cfg.rejectionPolicy === 'ALLOW_RETRY_IN_CYCLE') return false;
      if (w.status === 'CANCELLED') return false;
      const elapsed = nowDate.getTime() - new Date(w.requestedAt).getTime();
      return elapsed < cycleMs;
    });
    if (recentCycleBlocking) {
      const nextAt = new Date(new Date(recentCycleBlocking.requestedAt).getTime() + cycleMs).toISOString();
      throw new AppError(
        `Weekly withdrawal limit: Next withdrawal window opens on ${new Date(nextAt).toLocaleDateString('en-IN')}.`,
        400,
        'WEEKLY_CYCLE_ACTIVE'
      );
    }

    const nextEligibleAt = new Date(nowDate.getTime() + cycleMs).toISOString();
    const reqId = `WD-${nowDate.getTime()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const txId = `WTX-REQ-${reqId}`;
    const { db, isMockMode } = initializeFirebase();

    let createdReq: WithdrawalRequest;
    let updatedWallet: PhleboWallet;

    if (db && !isMockMode) {
      const walletRef = db.collection('wallets').doc(params.phleboId);
      const reqRef = db.collection('withdrawalRequests').doc(reqId);
      const txRef = db.collection('walletTransactions').doc(txId);

      const res = await db.runTransaction(async (trx) => {
        const wSnap = await trx.get(walletRef);
        const w = wSnap.exists ? (wSnap.data() as PhleboWallet) : emptyWallet(params.phleboId, params.phleboName);
        if (w.availableBalancePaise < amt) {
          throw new AppError(
            `Requested amount (₹${(amt / 100).toFixed(2)}) exceeds available balance (₹${(w.availableBalancePaise / 100).toFixed(2)}).`,
            400,
            'INSUFFICIENT_WALLET_BALANCE'
          );
        }
        const nextW: PhleboWallet = {
          ...w,
          availableBalancePaise: w.availableBalancePaise - amt,
          withdrawalEligibleBalancePaise: Math.max(0, w.availableBalancePaise - amt),
          pendingWithdrawalPaise: w.pendingWithdrawalPaise + amt,
          lastWithdrawalAt: nowIso,
          nextEligibleWithdrawalAt: nextEligibleAt,
          lastSettlementStatus: 'PENDING_ADMIN_SETTLEMENT',
          updatedAt: nowIso,
        };
        const newReq: WithdrawalRequest = {
          id: reqId,
          phleboId: params.phleboId,
          phleboName: params.phleboName,
          phleboPhone: params.phleboPhone,
          kycVerified: params.kycVerified,
          requestedAmountPaise: amt,
          availableBalanceBeforePaise: w.availableBalancePaise,
          paymentMethod: chosenMethod,
          maskedDestination: maskedDest,
          bankVerificationStatus: 'VERIFIED',
          payoutProfileVersion: 1,
          status: 'PENDING_ADMIN_SETTLEMENT',
          requestedAt: nowIso,
          weeklyCycleStart: nowIso,
          nextEligibleAt,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        const reserveTx: WalletTransaction = {
          id: txId,
          phleboId: params.phleboId,
          withdrawalRequestId: reqId,
          type: 'WITHDRAWAL_RESERVED',
          grossEarningPaise: 0,
          platformFeePaise: 0,
          netEarningPaise: 0,
          amountPaise: amt,
          status: 'RESERVED',
          description: `Withdrawal requested (${reqId}) — Pending Admin Settlement`,
          idempotencyKey: `reserve_${reqId}`,
          createdAt: nowIso,
        };
        trx.set(walletRef, deepCleanFirestorePayload(nextW), { merge: true });
        trx.set(reqRef, deepCleanFirestorePayload(newReq));
        trx.set(txRef, deepCleanFirestorePayload(reserveTx));
        return { request: newReq, wallet: nextW };
      });
      createdReq = res.request;
      updatedWallet = res.wallet;
    } else {
      const w = memWallets.get(params.phleboId) || emptyWallet(params.phleboId, params.phleboName);
      if (w.availableBalancePaise < amt) {
        throw new AppError(
          `Requested amount (₹${(amt / 100).toFixed(2)}) exceeds available balance (₹${(w.availableBalancePaise / 100).toFixed(2)}).`,
          400,
          'INSUFFICIENT_WALLET_BALANCE'
        );
      }
      updatedWallet = {
        ...w,
        availableBalancePaise: w.availableBalancePaise - amt,
        withdrawalEligibleBalancePaise: Math.max(0, w.availableBalancePaise - amt),
        pendingWithdrawalPaise: w.pendingWithdrawalPaise + amt,
        lastWithdrawalAt: nowIso,
        nextEligibleWithdrawalAt: nextEligibleAt,
        lastSettlementStatus: 'PENDING_ADMIN_SETTLEMENT',
        updatedAt: nowIso,
      };
      createdReq = {
        id: reqId,
        phleboId: params.phleboId,
        phleboName: params.phleboName,
        phleboPhone: params.phleboPhone,
        kycVerified: params.kycVerified,
        requestedAmountPaise: amt,
        availableBalanceBeforePaise: w.availableBalancePaise,
        paymentMethod: chosenMethod,
        maskedDestination: maskedDest,
        bankVerificationStatus: 'VERIFIED',
        payoutProfileVersion: 1,
        status: 'PENDING_ADMIN_SETTLEMENT',
        requestedAt: nowIso,
        weeklyCycleStart: nowIso,
        nextEligibleAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const reserveTx: WalletTransaction = {
        id: txId,
        phleboId: params.phleboId,
        withdrawalRequestId: reqId,
        type: 'WITHDRAWAL_RESERVED',
        grossEarningPaise: 0,
        platformFeePaise: 0,
        netEarningPaise: 0,
        amountPaise: amt,
        status: 'RESERVED',
        description: `Withdrawal requested (${reqId}) — Pending Admin Settlement`,
        idempotencyKey: `reserve_${reqId}`,
        createdAt: nowIso,
      };
      memWallets.set(params.phleboId, updatedWallet);
      memWithdrawals.set(reqId, createdReq);
      memTransactions.set(txId, reserveTx);
    }

    await appendFinancialAudit({
      actorId: params.phleboId,
      actorRole: 'PHLEBOTOMIST',
      action: 'WITHDRAWAL_REQUEST_CREATED',
      entityType: 'WITHDRAWAL_REQUEST',
      entityId: reqId,
      newStatus: 'PENDING_ADMIN_SETTLEMENT',
      reason: `Requested ₹${(amt / 100).toFixed(2)} via ${chosenMethod}`,
    });

    await sendPlatformNotification({
      title: `Withdrawal Request Submitted (${reqId})`,
      message: `Your withdrawal request of ₹${(amt / 100).toLocaleString('en-IN')} has been submitted successfully. Your payment is pending settlement from LabSetu.`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: NotificationPriority.NORMAL,
      recipientRole: UserRole.PHLEBOTOMIST,
      channels: [NotificationChannel.IN_APP],
    });

    await sendPlatformNotification({
      title: `New Phlebo Withdrawal Request: ₹${(amt / 100).toLocaleString('en-IN')}`,
      message: `${params.phleboName} (${params.phleboId}) requested ₹${(amt / 100).toLocaleString('en-IN')} (${reqId}).`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: NotificationPriority.HIGH,
      recipientEmail: config.admin.email,
      recipientRole: UserRole.ADMIN,
      channels: [NotificationChannel.IN_APP],
    });

    return {
      request: createdReq,
      wallet: updatedWallet,
      message: 'Your withdrawal request has been submitted successfully. Your payment is pending settlement from LabSetu.',
    };
  } finally {
    memMutexes.delete(lockKey);
  }
}

export async function listWithdrawalsByPhlebo(phleboId: string): Promise<WithdrawalRequest[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('withdrawalRequests').where('phleboId', '==', phleboId).limit(100).get();
    return snap.docs
      .map((d) => d.data() as WithdrawalRequest)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }
  return Array.from(memWithdrawals.values())
    .filter((w) => w.phleboId === phleboId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function listAllWithdrawalsForAdmin(): Promise<{
  requests: WithdrawalRequest[];
  settlements: ManualSettlementRecord[];
}> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const [wSnap, sSnap] = await Promise.all([
      db.collection('withdrawalRequests').limit(300).get(),
      db.collection('manualSettlements').limit(300).get(),
    ]);
    return {
      requests: wSnap.docs.map((d) => d.data() as WithdrawalRequest).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
      settlements: sSnap.docs.map((d) => d.data() as ManualSettlementRecord).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    };
  }
  return {
    requests: Array.from(memWithdrawals.values()).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    settlements: Array.from(memSettlements.values()).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
  };
}

export async function transitionWithdrawalStatusByAdmin(params: {
  requestId: string;
  targetStatus: 'UNDER_REVIEW' | 'ON_HOLD' | 'REJECTED' | 'PROCESSING_MANUALLY' | 'FAILED';
  reason?: string;
  adminUid: string;
  adminEmail: string;
}): Promise<WithdrawalRequest> {
  if (['ON_HOLD', 'REJECTED', 'FAILED'].includes(params.targetStatus) && (!params.reason || params.reason.trim().length < 5)) {
    throw new AppError('A mandatory reason (min 5 chars) is required.', 400, 'REASON_REQUIRED');
  }

  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();
  let updatedReq: WithdrawalRequest;
  let oldStatus = '';

  const shouldReleaseFunds = params.targetStatus === 'REJECTED' || params.targetStatus === 'FAILED';

  if (db && !isMockMode) {
    const reqRef = db.collection('withdrawalRequests').doc(params.requestId);
    updatedReq = await db.runTransaction(async (trx) => {
      const rSnap = await trx.get(reqRef);
      if (!rSnap.exists) throw new AppError('Withdrawal request not found.', 404, 'NOT_FOUND');
      const r = rSnap.data() as WithdrawalRequest;
      oldStatus = r.status;
      if (['MANUAL_PAID', 'REJECTED', 'CANCELLED'].includes(r.status)) {
        throw new AppError(`Cannot transition withdrawal from ${r.status}.`, 400, 'INVALID_STATUS_TRANSITION');
      }
      const next: WithdrawalRequest = {
        ...r,
        status: params.targetStatus,
        adminId: params.adminUid,
        adminEmail: params.adminEmail,
        ...(params.targetStatus === 'ON_HOLD' ? { holdReason: params.reason } : {}),
        ...(params.targetStatus === 'REJECTED' ? { rejectionReason: params.reason } : {}),
        ...(params.reason ? { reviewNotes: params.reason } : {}),
        updatedAt: now,
      };
      trx.set(reqRef, deepCleanFirestorePayload(next), { merge: true });

      if (shouldReleaseFunds) {
        const wRef = db.collection('wallets').doc(r.phleboId);
        const wSnap = await trx.get(wRef);
        const w = wSnap.exists ? (wSnap.data() as PhleboWallet) : emptyWallet(r.phleboId, r.phleboName);
        const relTxId = `WTX-REL-${r.id}`;
        const relTxSnap = await trx.get(db.collection('walletTransactions').doc(relTxId));
        if (!relTxSnap.exists) {
          const nextW: PhleboWallet = {
            ...w,
            availableBalancePaise: w.availableBalancePaise + r.requestedAmountPaise,
            withdrawalEligibleBalancePaise: w.availableBalancePaise + r.requestedAmountPaise,
            pendingWithdrawalPaise: Math.max(0, w.pendingWithdrawalPaise - r.requestedAmountPaise),
            lastSettlementStatus: params.targetStatus,
            updatedAt: now,
          };
          const relTx: WalletTransaction = {
            id: relTxId,
            phleboId: r.phleboId,
            withdrawalRequestId: r.id,
            type: params.targetStatus === 'REJECTED' ? 'WITHDRAWAL_REJECTED' : 'WITHDRAWAL_RELEASED',
            grossEarningPaise: 0,
            platformFeePaise: 0,
            netEarningPaise: 0,
            amountPaise: r.requestedAmountPaise,
            status: 'RELEASED',
            description: `Reserved funds released (${params.targetStatus}): ${params.reason}`,
            idempotencyKey: `release_${r.id}`,
            createdAt: now,
          };
          trx.set(wRef, deepCleanFirestorePayload(nextW), { merge: true });
          trx.set(db.collection('walletTransactions').doc(relTxId), deepCleanFirestorePayload(relTx));
        }
      }
      return next;
    });
  } else {
    const r = memWithdrawals.get(params.requestId);
    if (!r) throw new AppError('Withdrawal request not found.', 404, 'NOT_FOUND');
    oldStatus = r.status;
    if (['MANUAL_PAID', 'REJECTED', 'CANCELLED'].includes(r.status)) {
      throw new AppError(`Cannot transition withdrawal from ${r.status}.`, 400, 'INVALID_STATUS_TRANSITION');
    }
    updatedReq = {
      ...r,
      status: params.targetStatus,
      adminId: params.adminUid,
      adminEmail: params.adminEmail,
      ...(params.targetStatus === 'ON_HOLD' ? { holdReason: params.reason } : {}),
      ...(params.targetStatus === 'REJECTED' ? { rejectionReason: params.reason } : {}),
      ...(params.reason ? { reviewNotes: params.reason } : {}),
      updatedAt: now,
    };
    memWithdrawals.set(r.id, updatedReq);

    if (shouldReleaseFunds) {
      const relTxId = `WTX-REL-${r.id}`;
      if (!memTransactions.has(relTxId)) {
        const w = memWallets.get(r.phleboId) || emptyWallet(r.phleboId, r.phleboName);
        memWallets.set(r.phleboId, {
          ...w,
          availableBalancePaise: w.availableBalancePaise + r.requestedAmountPaise,
          withdrawalEligibleBalancePaise: w.availableBalancePaise + r.requestedAmountPaise,
          pendingWithdrawalPaise: Math.max(0, w.pendingWithdrawalPaise - r.requestedAmountPaise),
          lastSettlementStatus: params.targetStatus,
          updatedAt: now,
        });
        memTransactions.set(relTxId, {
          id: relTxId,
          phleboId: r.phleboId,
          withdrawalRequestId: r.id,
          type: params.targetStatus === 'REJECTED' ? 'WITHDRAWAL_REJECTED' : 'WITHDRAWAL_RELEASED',
          grossEarningPaise: 0,
          platformFeePaise: 0,
          netEarningPaise: 0,
          amountPaise: r.requestedAmountPaise,
          status: 'RELEASED',
          description: `Reserved funds released (${params.targetStatus}): ${params.reason}`,
          idempotencyKey: `release_${r.id}`,
          createdAt: now,
        });
      }
    }
  }

  await appendFinancialAudit({
    actorId: params.adminUid,
    actorRole: 'ADMIN',
    action: `WITHDRAWAL_${params.targetStatus}`,
    entityType: 'WITHDRAWAL_REQUEST',
    entityId: updatedReq.id,
    oldStatus,
    newStatus: params.targetStatus,
    reason: params.reason,
  });

  await sendPlatformNotification({
    title: `Withdrawal Update (${updatedReq.id}): ${params.targetStatus.replace(/_/g, ' ')}`,
    message: shouldReleaseFunds
      ? `Your withdrawal request ${updatedReq.id} was ${params.targetStatus.toLowerCase()}. ₹${(updatedReq.requestedAmountPaise / 100).toLocaleString('en-IN')} has been released back to your available wallet balance.`
      : `Your withdrawal request ${updatedReq.id} status is now ${params.targetStatus.replace(/_/g, ' ')}.`,
    category: NotificationCategory.PAYOUT_SETTLED,
    priority: NotificationPriority.NORMAL,
    recipientRole: UserRole.PHLEBOTOMIST,
    channels: [NotificationChannel.IN_APP],
  });

  return updatedReq;
}

/**
 * PHASE 7: Admin Manual Bank/UPI Settlement
 * Never fabricates UTR; requires valid external UTR/ref, exact amount match, duplicate UTR check.
 */
export async function settleWithdrawalManuallyByAdmin(params: {
  requestId: string;
  actualAmountPaise: number;
  paymentMethod: ManualPaymentMethod;
  transactionReference: string;
  paymentDate: string;
  paymentTime: string;
  receiptStoragePath?: string;
  remarks?: string;
  adminUid: string;
  adminEmail: string;
}): Promise<{ request: WithdrawalRequest; settlement: ManualSettlementRecord; wallet: PhleboWallet }> {
  const utr = params.transactionReference.trim();
  if (!/^[a-zA-Z0-9_-]{6,40}$/.test(utr)) {
    throw new AppError(
      'Valid external UTR / UPI Transaction ID / Bank Reference (6–40 alphanumeric chars) is mandatory.',
      400,
      'INVALID_TRANSACTION_REFERENCE'
    );
  }
  if (!params.paymentDate || !params.paymentTime) {
    throw new AppError('Actual payment date and payment time are required.', 400, 'PAYMENT_DATE_REQUIRED');
  }

  const now = new Date().toISOString();
  const settlementId = `MSTL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const setTxId = `WTX-SET-${params.requestId}`;
  const { db, isMockMode } = initializeFirebase();

  let settledReq: WithdrawalRequest;
  let settlementDoc: ManualSettlementRecord;
  let walletAfter: PhleboWallet;

  if (db && !isMockMode) {
    // Prevent duplicate UTR submissions across manualSettlements
    const dupSnap = await db
      .collection('manualSettlements')
      .where('transactionReference', '==', utr)
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      throw new AppError(
        `Duplicate transaction reference "${utr}" is already recorded on another settlement.`,
        409,
        'DUPLICATE_TRANSACTION_REFERENCE'
      );
    }

    const reqRef = db.collection('withdrawalRequests').doc(params.requestId);
    const stlRef = db.collection('manualSettlements').doc(settlementId);
    const txRef = db.collection('walletTransactions').doc(setTxId);

    const res = await db.runTransaction(async (trx) => {
      const rSnap = await trx.get(reqRef);
      if (!rSnap.exists) throw new AppError('Withdrawal request not found.', 404, 'NOT_FOUND');
      const r = rSnap.data() as WithdrawalRequest;
      if (r.status === 'MANUAL_PAID') {
        throw new AppError('Withdrawal request is already settled.', 400, 'ALREADY_SETTLED');
      }
      if (['REJECTED', 'CANCELLED'].includes(r.status)) {
        throw new AppError(`Cannot settle a ${r.status} withdrawal request.`, 400, 'INVALID_STATUS_TRANSITION');
      }
      if (Math.round(params.actualAmountPaise) !== r.requestedAmountPaise) {
        throw new AppError(
          `Actual transferred amount (₹${(params.actualAmountPaise / 100).toFixed(2)}) must match requested amount (₹${(r.requestedAmountPaise / 100).toFixed(2)}).`,
          400,
          'AMOUNT_MISMATCH'
        );
      }

      const wRef = db.collection('wallets').doc(r.phleboId);
      const wSnap = await trx.get(wRef);
      const w = wSnap.exists ? (wSnap.data() as PhleboWallet) : emptyWallet(r.phleboId, r.phleboName);

      const nextW: PhleboWallet = {
        ...w,
        pendingWithdrawalPaise: Math.max(0, w.pendingWithdrawalPaise - r.requestedAmountPaise),
        totalSettledPaise: w.totalSettledPaise + r.requestedAmountPaise,
        lastSettlementStatus: 'MANUAL_PAID',
        updatedAt: now,
      };
      const newStl: ManualSettlementRecord = {
        id: settlementId,
        withdrawalRequestId: r.id,
        phleboId: r.phleboId,
        phleboName: r.phleboName,
        amountPaise: r.requestedAmountPaise,
        paymentMethod: params.paymentMethod,
        transactionReference: utr,
        maskedTransactionReference: maskTrxRef(utr),
        referenceSource: 'ADMIN_RECORDED',
        paymentDate: params.paymentDate,
        paymentTime: params.paymentTime,
        receiptStoragePath: params.receiptStoragePath,
        remarks: params.remarks,
        recordedBy: params.adminEmail,
        recordedAt: now,
        status: 'MANUAL_PAID',
      };
      const nextReq: WithdrawalRequest = {
        ...r,
        status: 'MANUAL_PAID',
        adminId: params.adminUid,
        adminEmail: params.adminEmail,
        settledAt: now,
        internalSettlementId: settlementId,
        manualTransactionRef: utr,
        referenceSource: 'ADMIN_RECORDED',
        updatedAt: now,
      };
      const settleTx: WalletTransaction = {
        id: setTxId,
        phleboId: r.phleboId,
        withdrawalRequestId: r.id,
        type: 'WITHDRAWAL_SETTLED',
        grossEarningPaise: 0,
        platformFeePaise: 0,
        netEarningPaise: 0,
        amountPaise: r.requestedAmountPaise,
        status: 'COMPLETED',
        description: `Settled manually via ${params.paymentMethod} (Ref: ${maskTrxRef(utr)})`,
        idempotencyKey: `settle_${r.id}`,
        auditMetadata: { settlementId, referenceSource: 'ADMIN_RECORDED' },
        createdAt: now,
      };

      trx.set(stlRef, deepCleanFirestorePayload(newStl));
      trx.set(reqRef, deepCleanFirestorePayload(nextReq), { merge: true });
      trx.set(wRef, deepCleanFirestorePayload(nextW), { merge: true });
      trx.set(txRef, deepCleanFirestorePayload(settleTx));
      return { request: nextReq, settlement: newStl, wallet: nextW };
    });

    settledReq = res.request;
    settlementDoc = res.settlement;
    walletAfter = res.wallet;
  } else {
    const dup = Array.from(memSettlements.values()).find((s) => s.transactionReference === utr);
    if (dup) {
      throw new AppError(
        `Duplicate transaction reference "${utr}" is already recorded on another settlement.`,
        409,
        'DUPLICATE_TRANSACTION_REFERENCE'
      );
    }
    const r = memWithdrawals.get(params.requestId);
    if (!r) throw new AppError('Withdrawal request not found.', 404, 'NOT_FOUND');
    if (r.status === 'MANUAL_PAID') {
      throw new AppError('Withdrawal request is already settled.', 400, 'ALREADY_SETTLED');
    }
    if (['REJECTED', 'CANCELLED'].includes(r.status)) {
      throw new AppError(`Cannot settle a ${r.status} withdrawal request.`, 400, 'INVALID_STATUS_TRANSITION');
    }
    if (Math.round(params.actualAmountPaise) !== r.requestedAmountPaise) {
      throw new AppError('Actual transferred amount must match requested amount.', 400, 'AMOUNT_MISMATCH');
    }

    const w = memWallets.get(r.phleboId) || emptyWallet(r.phleboId, r.phleboName);
    walletAfter = {
      ...w,
      pendingWithdrawalPaise: Math.max(0, w.pendingWithdrawalPaise - r.requestedAmountPaise),
      totalSettledPaise: w.totalSettledPaise + r.requestedAmountPaise,
      lastSettlementStatus: 'MANUAL_PAID',
      updatedAt: now,
    };
    settlementDoc = {
      id: settlementId,
      withdrawalRequestId: r.id,
      phleboId: r.phleboId,
      phleboName: r.phleboName,
      amountPaise: r.requestedAmountPaise,
      paymentMethod: params.paymentMethod,
      transactionReference: utr,
      maskedTransactionReference: maskTrxRef(utr),
      referenceSource: 'ADMIN_RECORDED',
      paymentDate: params.paymentDate,
      paymentTime: params.paymentTime,
      receiptStoragePath: params.receiptStoragePath,
      remarks: params.remarks,
      recordedBy: params.adminEmail,
      recordedAt: now,
      status: 'MANUAL_PAID',
    };
    settledReq = {
      ...r,
      status: 'MANUAL_PAID',
      adminId: params.adminUid,
      adminEmail: params.adminEmail,
      settledAt: now,
      internalSettlementId: settlementId,
      manualTransactionRef: utr,
      referenceSource: 'ADMIN_RECORDED',
      updatedAt: now,
    };
    memWallets.set(r.phleboId, walletAfter);
    memSettlements.set(settlementId, settlementDoc);
    memWithdrawals.set(r.id, settledReq);
    memTransactions.set(setTxId, {
      id: setTxId,
      phleboId: r.phleboId,
      withdrawalRequestId: r.id,
      type: 'WITHDRAWAL_SETTLED',
      grossEarningPaise: 0,
      platformFeePaise: 0,
      netEarningPaise: 0,
      amountPaise: r.requestedAmountPaise,
      status: 'COMPLETED',
      description: `Settled manually via ${params.paymentMethod} (Ref: ${maskTrxRef(utr)})`,
      idempotencyKey: `settle_${r.id}`,
      auditMetadata: { settlementId, referenceSource: 'ADMIN_RECORDED' },
      createdAt: now,
    });
  }

  await appendFinancialAudit({
    actorId: params.adminUid,
    actorRole: 'ADMIN',
    action: 'WITHDRAWAL_MANUALLY_SETTLED',
    entityType: 'MANUAL_SETTLEMENT',
    entityId: settlementId,
    oldStatus: 'PENDING_ADMIN_SETTLEMENT',
    newStatus: 'MANUAL_PAID',
    reason: `Settled ₹${(settledReq.requestedAmountPaise / 100).toFixed(2)} via ${params.paymentMethod} (masked ref ${maskTrxRef(utr)})`,
  });

  // Never include complete bank/UPI details in push notifications!
  await sendPlatformNotification({
    title: `Withdrawal Settled: ₹${(settledReq.requestedAmountPaise / 100).toLocaleString('en-IN')}`,
    message: `Your LabSetu withdrawal of ₹${(settledReq.requestedAmountPaise / 100).toLocaleString('en-IN')} has been marked as settled by LabSetu. Date: ${params.paymentDate} • Method: ${params.paymentMethod} • Ref: ${maskTrxRef(utr)} • Request: ${settledReq.id}.`,
    category: NotificationCategory.PAYOUT_SETTLED,
    priority: NotificationPriority.HIGH,
    recipientRole: UserRole.PHLEBOTOMIST,
    channels: [NotificationChannel.IN_APP],
  });

  return { request: settledReq, settlement: settlementDoc, wallet: walletAfter };
}

export async function savePhleboQrImage(params: {
  phleboId: string;
  mimeType: string;
  base64Data: string;
}): Promise<{ stored: boolean; storagePath: string; updatedAt: string }> {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(params.mimeType.toLowerCase())) {
    throw new AppError('Only PNG, JPEG, or WEBP QR images are allowed.', 400, 'INVALID_QR_FORMAT');
  }
  const buf = Buffer.from(params.base64Data, 'base64');
  if (buf.length < 100 || buf.length > 2 * 1024 * 1024) {
    throw new AppError('QR image size must be between 100 bytes and 2 MB.', 400, 'INVALID_QR_SIZE');
  }

  const now = new Date().toISOString();
  const storagePath = `private-phlebo-qr/${params.phleboId}/upi-qr.png`;
  const { db, storage, isMockMode } = initializeFirebase();

  if (db && storage && !isMockMode) {
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    await file.save(buf, { contentType: params.mimeType, resumable: false, public: false });
    await db.collection('phlebo_payment_methods').doc(params.phleboId).set(
      { qrStoragePath: storagePath, qrUpdatedAt: now, updatedAt: now },
      { merge: true }
    );
  } else {
    memQrStore.set(params.phleboId, { mimeType: params.mimeType, base64: params.base64Data, updatedAt: now });
  }

  await appendFinancialAudit({
    actorId: params.phleboId,
    actorRole: 'PHLEBOTOMIST',
    action: 'PHLEBO_QR_UPLOADED',
    entityType: 'PAYOUT_PROFILE',
    entityId: params.phleboId,
    reason: 'Private UPI QR image uploaded',
  });

  return { stored: true, storagePath, updatedAt: now };
}

export async function getPrivatePhleboQrForAdmin(phleboId: string): Promise<{
  available: boolean;
  signedUrl?: string;
  dataUrl?: string;
}> {
  const { db, storage, isMockMode } = initializeFirebase();
  if (db && storage && !isMockMode) {
    const path = `private-phlebo-qr/${phleboId}/upi-qr.png`;
    const file = storage.bucket().file(path);
    const [exists] = await file.exists();
    if (!exists) return { available: false };
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 1000, // 2-minute short-lived authenticated access
    });
    return { available: true, signedUrl };
  }
  const mem = memQrStore.get(phleboId);
  if (!mem) return { available: false };
  return { available: true, dataUrl: `data:${mem.mimeType};base64,${mem.base64}` };
}

export async function reconcileWalletsAndWithdrawals(): Promise<WalletReconciliationReport> {
  const { db, isMockMode } = initializeFirebase();
  let wallets: PhleboWallet[] = [];
  let txs: WalletTransaction[] = [];
  let withdrawals: WithdrawalRequest[] = [];
  let settlements: ManualSettlementRecord[] = [];

  if (db && !isMockMode) {
    const [wSnap, tSnap, rSnap, sSnap] = await Promise.all([
      db.collection('wallets').limit(500).get(),
      db.collection('walletTransactions').limit(1000).get(),
      db.collection('withdrawalRequests').limit(500).get(),
      db.collection('manualSettlements').limit(500).get(),
    ]);
    wallets = wSnap.docs.map((d) => d.data() as PhleboWallet);
    txs = tSnap.docs.map((d) => d.data() as WalletTransaction);
    withdrawals = rSnap.docs.map((d) => d.data() as WithdrawalRequest);
    settlements = sSnap.docs.map((d) => d.data() as ManualSettlementRecord);
  } else {
    wallets = Array.from(memWallets.values());
    txs = Array.from(memTransactions.values());
    withdrawals = Array.from(memWithdrawals.values());
    settlements = Array.from(memSettlements.values());
  }

  const mismatchedWallets: WalletReconciliationReport['mismatchedWallets'] = [];
  for (const w of wallets) {
    const phTxs = txs.filter((t) => t.phleboId === w.phleboId);
    const earned = phTxs
      .filter((t) => t.type === 'BOOKING_EARNING' || t.type === 'ADMIN_CREDIT')
      .reduce((s, t) => s + t.amountPaise, 0);
    const settled = settlements
      .filter((s) => s.phleboId === w.phleboId && s.status === 'MANUAL_PAID')
      .reduce((sum, s) => sum + s.amountPaise, 0);
    if (w.totalEarnedPaise !== earned || w.totalSettledPaise !== settled) {
      mismatchedWallets.push({
        phleboId: w.phleboId,
        walletTotalEarnedPaise: w.totalEarnedPaise,
        ledgerNetCreditedPaise: earned,
        walletSettledPaise: w.totalSettledPaise,
        settlementTotalPaise: settled,
        reason: 'Wallet totals differ from immutable ledger or manual settlements.',
      });
    }
  }

  const utrMap = new Map<string, string[]>();
  for (const s of settlements) {
    const arr = utrMap.get(s.transactionReference) || [];
    arr.push(s.id);
    utrMap.set(s.transactionReference, arr);
  }
  const duplicateUtrs = Array.from(utrMap.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([transactionReference, settlementIds]) => ({ transactionReference, settlementIds }));

  const orphanedWithdrawals = withdrawals
    .filter((w) => w.status === 'MANUAL_PAID' && !settlements.some((s) => s.withdrawalRequestId === w.id))
    .map((w) => ({
      withdrawalRequestId: w.id,
      status: w.status,
      reason: 'Withdrawal marked MANUAL_PAID without matching ManualSettlementRecord.',
    }));

  return {
    generatedAt: new Date().toISOString(),
    totalWalletsChecked: wallets.length,
    mismatchedWallets,
    duplicateUtrs,
    orphanedWithdrawals,
  };
}
