import {
  deepCleanFirestorePayload,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type PayoutEligibilityTrigger,
  type PayoutErrorCode,
  type PayoutErrorLogRecord,
  type PayoutLedgerRecord,
  type PayoutLifecycleStatus,
  type PayoutProviderArchitecture,
  UserRole,
} from '@diagnostic/shared';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { recordAuditLog } from '../middleware/rbac';
import { sendPlatformNotification } from './notification.service';
import { getDecryptedPayoutDestinationForEngine } from './phleboBank.service';

export function toPaise(inr: number): number {
  if (!Number.isFinite(inr)) return 0;
  return Math.round(inr * 100);
}

export function fromPaise(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

export function calculatePayoutPaiseBreakdown(input: {
  grossEarningInr: number;
  platformFeeInr?: number;
  taxInr?: number;
  refundInr?: number;
  adjustmentInr?: number;
}): {
  grossEarningPaise: number;
  platformFeePaise: number;
  taxPaise: number;
  refundPaise: number;
  adjustmentPaise: number;
  netPayablePaise: number;
} {
  const grossEarningPaise = Math.max(0, toPaise(input.grossEarningInr));
  const platformFeePaise = Math.max(0, toPaise(input.platformFeeInr || 0));
  const taxPaise = Math.max(0, toPaise(input.taxInr || 0));
  const refundPaise = Math.max(0, toPaise(input.refundInr || 0));
  const adjustmentPaise = toPaise(input.adjustmentInr || 0);
  const rawNet =
    grossEarningPaise - platformFeePaise - taxPaise - refundPaise + adjustmentPaise;
  const netPayablePaise = Math.max(0, rawNet);

  return {
    grossEarningPaise,
    platformFeePaise,
    taxPaise,
    refundPaise,
    adjustmentPaise,
    netPayablePaise,
  };
}

export interface EligibilityInput {
  paymentStatus?: string;
  paymentCaptured?: boolean;
  phleboId?: string;
  phleboActive?: boolean;
  phleboSuspended?: boolean;
  orderStatus?: string;
  handoverCompleted?: boolean;
  reportCompleted?: boolean;
  eligibilityTrigger?: PayoutEligibilityTrigger;
  hasActiveDispute?: boolean;
  payoutOnHold?: boolean;
  destinationMethod: 'BANK_ACCOUNT' | 'UPI' | 'NONE';
  destinationVerified: boolean;
  netPayablePaise: number;
  existingLedgerStatus?: PayoutLifecycleStatus;
}

export function evaluatePayoutEligibility(input: EligibilityInput): {
  eligible: boolean;
  status: PayoutLifecycleStatus;
  errorCode?: PayoutErrorCode;
  message?: string;
  recommendedAction?: string;
} {
  if (
    input.existingLedgerStatus &&
    ['PROCESSING', 'INITIATED', 'PROCESSED', 'SETTLED'].includes(input.existingLedgerStatus)
  ) {
    return {
      eligible: false,
      status: input.existingLedgerStatus,
      errorCode: 'DUPLICATE_PAYOUT_PREVENTED',
      message: `Payout already in ${input.existingLedgerStatus} state for this booking.`,
      recommendedAction: 'Monitor webhook or provider status instead of creating a duplicate payout.',
    };
  }

  if (input.payoutOnHold || input.hasActiveDispute) {
    return {
      eligible: false,
      status: 'ON_HOLD',
      errorCode: 'PAYOUT_ON_HOLD',
      message: input.hasActiveDispute
        ? 'Booking has an active dispute or fraud hold.'
        : 'Payout has been placed on hold by Finance/Admin.',
      recommendedAction: 'Resolve dispute or click Release Payout after verification.',
    };
  }

  if (input.paymentStatus !== 'PAID' || input.paymentCaptured === false) {
    return {
      eligible: false,
      status: 'NOT_ELIGIBLE',
      errorCode: 'PAYMENT_NOT_CAPTURED',
      message: 'Small Lab payment is not captured yet.',
      recommendedAction: 'Wait for Razorpay payment capture before releasing Phlebo payout.',
    };
  }

  if (!input.phleboId) {
    return {
      eligible: false,
      status: 'NOT_ELIGIBLE',
      errorCode: 'BOOKING_NOT_ELIGIBLE',
      message: 'No Phlebotomist assigned to this booking.',
      recommendedAction: 'Assign the Phlebotomist who completed the pickup.',
    };
  }

  if (input.phleboActive === false || input.phleboSuspended) {
    return {
      eligible: false,
      status: 'ON_HOLD',
      errorCode: 'BENEFICIARY_NOT_ACTIVE',
      message: 'Phlebotomist account is inactive or suspended.',
      recommendedAction: 'Reactivate Phlebotomist profile before releasing payout.',
    };
  }

  const trigger = input.eligibilityTrigger || 'AFTER_HANDOVER';
  const handoverDone =
    Boolean(input.handoverCompleted) ||
    ['DELIVERED_TO_LARGE_LAB', 'TESTING_IN_PROGRESS', 'COMPLETED'].includes(input.orderStatus || '');
  const reportDone = Boolean(input.reportCompleted) || input.orderStatus === 'COMPLETED';

  if (trigger === 'AFTER_HANDOVER' && !handoverDone) {
    return {
      eligible: false,
      status: 'NOT_ELIGIBLE',
      errorCode: 'BOOKING_NOT_ELIGIBLE',
      message: 'Sample handover to Receiving Lab is not completed yet.',
      recommendedAction: 'Payout becomes eligible automatically after Handover OTP completion.',
    };
  }
  if (trigger === 'AFTER_REPORT_COMPLETION' && !reportDone) {
    return {
      eligible: false,
      status: 'NOT_ELIGIBLE',
      errorCode: 'BOOKING_NOT_ELIGIBLE',
      message: 'Lab testing/report completion is required before payout release.',
      recommendedAction: 'Wait until the Reference Lab completes the report.',
    };
  }

  if (input.netPayablePaise <= 0) {
    return {
      eligible: false,
      status: 'NOT_ELIGIBLE',
      errorCode: 'BOOKING_NOT_ELIGIBLE',
      message: 'Net payable amount is ₹0.00 after deductions.',
      recommendedAction: 'Review fee deductions or adjustments.',
    };
  }

  if (input.destinationMethod === 'NONE') {
    return {
      eligible: false,
      status: 'PENDING',
      errorCode: 'BANK_DETAILS_NOT_ADDED',
      message: 'Phlebotomist has not added bank account or UPI details.',
      recommendedAction: 'Notify Phlebotomist to add Bank Account or UPI in Profile → Bank & Payment Details.',
    };
  }

  if (!input.destinationVerified) {
    return {
      eligible: false,
      status: 'PENDING',
      errorCode: 'BANK_DETAILS_NOT_VERIFIED',
      message: 'Phlebotomist bank/UPI details require verification before payout release.',
      recommendedAction: 'Verify Phlebotomist bank/UPI details in Admin Finance → Phlebo Payouts.',
    };
  }

  return {
    eligible: true,
    status: 'READY_FOR_PAYOUT',
  };
}

export interface ProviderExecutionAdapter {
  executeRazorpayRouteTransfer: (params: {
    sourcePaymentId: string;
    linkedAccountId: string;
    amountPaise: number;
    idempotencyKey: string;
    notes: Record<string, string>;
  }) => Promise<{ transferId: string; status: string; settlementStatus?: string }>;
  executeRazorpayXPayout: (params: {
    xAccountNumber: string;
    amountPaise: number;
    mode: 'IMPS' | 'NEFT' | 'UPI';
    recipientName: string;
    recipientEmail?: string;
    recipientPhone?: string;
    accountNumber?: string;
    ifsc?: string;
    upiId?: string;
    idempotencyKey: string;
    referenceId: string;
  }) => Promise<{ payoutId: string; status: string; utr?: string }>;
  fetchRazorpayXBalancePaise?: (xAccountNumber: string) => Promise<number | null>;
  fetchExistingTransferOrPayout?: (params: {
    providerTransferId?: string;
    providerPayoutId?: string;
  }) => Promise<{ status: string; utr?: string } | null>;
}

function getAuthHeader(): string {
  const { keyId, keySecret } = config.razorpay;
  if (!keyId || !keySecret) {
    throw new AppError('Razorpay API credentials are missing.', 401, 'RAZORPAY_AUTH_FAILED');
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export const defaultProviderAdapter: ProviderExecutionAdapter = {
  async executeRazorpayRouteTransfer(params) {
    const authHeader = getAuthHeader();
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(params.sourcePaymentId)}/transfers`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transfers: [
            {
              account: params.linkedAccountId,
              amount: params.amountPaise,
              currency: 'INR',
              notes: { ...params.notes, idempotencyKey: params.idempotencyKey },
              on_hold: false,
            },
          ],
        }),
      }
    );
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = (json.error || {}) as { code?: string; description?: string };
      const desc = errObj.description || 'Razorpay Route transfer failed.';
      if (res.status === 400 && desc.toLowerCase().includes('route')) {
        throw new AppError(desc, 400, 'RAZORPAY_ROUTE_NOT_ENABLED');
      }
      throw new AppError(desc, res.status, 'TRANSFER_REJECTED');
    }
    const items = (json.items as Array<Record<string, unknown>>) || [];
    const first = items[0] || json;
    return {
      transferId: String(first.id || ''),
      status: String(first.status || 'created'),
      settlementStatus: first.settlement_status ? String(first.settlement_status) : undefined,
    };
  },

  async fetchRazorpayXBalancePaise(xAccountNumber: string) {
    try {
      const authHeader = getAuthHeader();
      const res = await fetch(
        `https://api.razorpay.com/v1/balances?account_number=${encodeURIComponent(xAccountNumber)}`,
        { headers: { Authorization: authHeader } }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { items?: Array<{ balance?: number }> };
      const bal = json.items?.[0]?.balance;
      return typeof bal === 'number' ? bal : null;
    } catch {
      return null;
    }
  },

  async executeRazorpayXPayout(params) {
    const authHeader = getAuthHeader();
    const contactRes = await fetch('https://api.razorpay.com/v1/contacts', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.recipientName,
        email: params.recipientEmail || config.admin.email,
        contact: params.recipientPhone || '9999999999',
        type: 'vendor',
      }),
    });
    const contactJson = (await contactRes.json()) as Record<string, unknown>;
    if (!contactRes.ok) {
      const errObj = (contactJson.error || {}) as { description?: string };
      throw new AppError(errObj.description || 'RazorpayX contact creation failed.', contactRes.status, 'RAZORPAYX_NOT_ENABLED');
    }

    const fundBody =
      params.mode === 'UPI' && params.upiId
        ? { contact_id: contactJson.id, account_type: 'vpa', vpa: { address: params.upiId } }
        : {
            contact_id: contactJson.id,
            account_type: 'bank_account',
            bank_account: {
              name: params.recipientName,
              ifsc: params.ifsc,
              account_number: params.accountNumber,
            },
          };

    const fundRes = await fetch('https://api.razorpay.com/v1/fund_accounts', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(fundBody),
    });
    const fundJson = (await fundRes.json()) as Record<string, unknown>;
    if (!fundRes.ok) {
      const errObj = (fundJson.error || {}) as { description?: string };
      throw new AppError(errObj.description || 'Fund account creation failed.', fundRes.status, 'PAYOUT_FAILED');
    }

    const payoutRes = await fetch('https://api.razorpay.com/v1/payouts', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'X-Payout-Idempotency': params.idempotencyKey,
      },
      body: JSON.stringify({
        account_number: params.xAccountNumber,
        fund_account_id: fundJson.id,
        amount: params.amountPaise,
        currency: 'INR',
        mode: params.mode,
        purpose: 'payout',
        queue_if_low_balance: false,
        reference_id: params.referenceId,
      }),
    });
    const payoutJson = (await payoutRes.json()) as Record<string, unknown>;
    if (!payoutRes.ok) {
      const errObj = (payoutJson.error || {}) as { code?: string; description?: string };
      const desc = errObj.description || 'RazorpayX payout failed.';
      if (desc.toLowerCase().includes('balance')) {
        throw new AppError(desc, 400, 'INSUFFICIENT_BALANCE');
      }
      throw new AppError(desc, payoutRes.status, 'PAYOUT_FAILED');
    }

    return {
      payoutId: String(payoutJson.id || ''),
      status: String(payoutJson.status || 'processing'),
      utr: payoutJson.utr ? String(payoutJson.utr) : undefined,
    };
  },
};

const inMemoryLedgerStore = new Map<string, PayoutLedgerRecord>();
const inMemoryErrorStore = new Map<string, PayoutErrorLogRecord>();

export function getInMemoryPayoutStores() {
  return { inMemoryLedgerStore, inMemoryErrorStore };
}

async function persistErrorLog(entry: Omit<PayoutErrorLogRecord, 'id' | 'createdAt' | 'resolved'>) {
  const { db, isMockMode } = initializeFirebase();
  const now = new Date().toISOString();
  const id = `PERR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const doc: PayoutErrorLogRecord = {
    id,
    ...entry,
    resolved: false,
    createdAt: now,
  };
  if (db && !isMockMode) {
    await db.collection('payout_error_logs').doc(id).set(deepCleanFirestorePayload(doc));
  } else {
    inMemoryErrorStore.set(id, doc);
  }
  return doc;
}

export async function saveLedgerRecord(record: PayoutLedgerRecord) {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('payout_ledger').doc(record.id).set(deepCleanFirestorePayload(record), { merge: true });
  } else {
    inMemoryLedgerStore.set(record.id, record);
  }
}

export async function getLedgerRecord(ledgerId: string): Promise<PayoutLedgerRecord | null> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('payout_ledger').doc(ledgerId).get();
    return snap.exists ? (snap.data() as PayoutLedgerRecord) : null;
  }
  return inMemoryLedgerStore.get(ledgerId) || null;
}

export async function initiatePhleboPayout(params: {
  bookingId: string;
  orderNumber: string;
  settlementId: string;
  phleboId: string;
  phleboName: string;
  phleboEmail?: string;
  phleboPhone?: string;
  phleboActive?: boolean;
  phleboSuspended?: boolean;
  grossEarningInr: number;
  platformFeeInr?: number;
  taxInr?: number;
  refundInr?: number;
  adjustmentInr?: number;
  paymentStatus: string;
  paymentCaptured?: boolean;
  sourcePaymentId?: string;
  orderStatus: string;
  handoverCompleted?: boolean;
  reportCompleted?: boolean;
  eligibilityTrigger?: PayoutEligibilityTrigger;
  preferredProvider?: 'RAZORPAY_ROUTE' | 'RAZORPAYX';
  linkedAccountId?: string;
  linkedAccountStatus?: string;
  hasActiveDispute?: boolean;
  payoutOnHold?: boolean;
  actorEmail?: string;
  adapter?: ProviderExecutionAdapter;
}): Promise<PayoutLedgerRecord> {
  const ledgerId = `PLED-${params.bookingId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const idempotencyKey = `pout_${params.bookingId}_${params.phleboId}`.slice(0, 36);
  const now = new Date().toISOString();
  const adapter = params.adapter || defaultProviderAdapter;

  const existing = await getLedgerRecord(ledgerId);
  const breakdown = calculatePayoutPaiseBreakdown({
    grossEarningInr: params.grossEarningInr,
    platformFeeInr: params.platformFeeInr,
    taxInr: params.taxInr,
    refundInr: params.refundInr,
    adjustmentInr: params.adjustmentInr,
  });

  const dest = params.phleboId
    ? await getDecryptedPayoutDestinationForEngine(params.phleboId)
    : { method: 'NONE' as const, verified: false, maskedDestination: 'Not Assigned' };

  const elig = evaluatePayoutEligibility({
    paymentStatus: params.paymentStatus,
    paymentCaptured: params.paymentCaptured,
    phleboId: params.phleboId,
    phleboActive: params.phleboActive,
    phleboSuspended: params.phleboSuspended,
    orderStatus: params.orderStatus,
    handoverCompleted: params.handoverCompleted,
    reportCompleted: params.reportCompleted,
    eligibilityTrigger: params.eligibilityTrigger,
    hasActiveDispute: params.hasActiveDispute,
    payoutOnHold: params.payoutOnHold || existing?.status === 'ON_HOLD',
    destinationMethod: dest.method,
    destinationVerified: dest.verified,
    netPayablePaise: breakdown.netPayablePaise,
    existingLedgerStatus: existing?.status,
  });

  const providerArch: PayoutProviderArchitecture =
    params.preferredProvider === 'RAZORPAY_ROUTE'
      ? 'RAZORPAY_ROUTE'
      : config.razorpay.xAccountNumber
        ? 'RAZORPAYX'
        : params.preferredProvider === 'RAZORPAYX'
          ? 'RAZORPAYX'
          : 'NONE';

  const baseLedger: PayoutLedgerRecord = {
    id: ledgerId,
    bookingId: params.bookingId,
    orderNumber: params.orderNumber,
    settlementId: params.settlementId,
    phleboId: params.phleboId,
    phleboName: params.phleboName,
    ...breakdown,
    grossEarningInr: fromPaise(breakdown.grossEarningPaise),
    platformFeeInr: fromPaise(breakdown.platformFeePaise),
    netPayableInr: fromPaise(breakdown.netPayablePaise),
    currency: 'INR',
    payoutMethod: dest.method,
    maskedDestination: dest.maskedDestination,
    bankName: dest.bankName,
    ifsc: dest.ifsc,
    providerArchitecture: providerArch,
    sourcePaymentId: params.sourcePaymentId,
    idempotencyKey,
    status: elig.status,
    errorCode: elig.errorCode,
    errorMessage: elig.message,
    recommendedAction: elig.recommendedAction,
    retryEligible: Boolean(elig.errorCode && !['DUPLICATE_PAYOUT_PREVENTED', 'PAYOUT_ON_HOLD'].includes(elig.errorCode)),
    retryCount: existing?.retryCount || 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (!elig.eligible) {
    await saveLedgerRecord(baseLedger);
    if (elig.errorCode && elig.errorCode !== 'DUPLICATE_PAYOUT_PREVENTED') {
      await persistErrorLog({
        ledgerId,
        bookingId: params.bookingId,
        orderNumber: params.orderNumber,
        phleboId: params.phleboId,
        phleboName: params.phleboName,
        amountPaise: breakdown.netPayablePaise,
        amountInr: baseLedger.netPayableInr,
        errorCode: elig.errorCode,
        message: elig.message || 'Payout not eligible.',
        recommendedAction: elig.recommendedAction || 'Review payout eligibility.',
        retryEligible: baseLedger.retryEligible,
      });
    }
    return baseLedger;
  }

  // Execute real provider transfer/payout
  try {
    if (providerArch === 'RAZORPAY_ROUTE') {
      if (!params.linkedAccountId || params.linkedAccountStatus !== 'ACTIVATED') {
        throw new AppError(
          'Phlebo Razorpay Route Linked Account is not activated yet.',
          400,
          'LINKED_ACCOUNT_NOT_ACTIVATED'
        );
      }
      if (!params.sourcePaymentId) {
        throw new AppError(
          'Captured Razorpay Payment ID is required for Route transfer.',
          400,
          'PAYMENT_NOT_CAPTURED'
        );
      }
      const res = await adapter.executeRazorpayRouteTransfer({
        sourcePaymentId: params.sourcePaymentId,
        linkedAccountId: params.linkedAccountId,
        amountPaise: breakdown.netPayablePaise,
        idempotencyKey,
        notes: { bookingId: params.bookingId, phleboId: params.phleboId },
      });
      const updated: PayoutLedgerRecord = {
        ...baseLedger,
        payoutMethod: 'RAZORPAY_ROUTE',
        payoutMode: 'ROUTE_TRANSFER',
        providerTransferId: res.transferId,
        status: 'INITIATED',
        errorCode: undefined,
        errorMessage: undefined,
        recommendedAction: undefined,
        eligibleAt: now,
        initiatedAt: now,
        updatedAt: now,
      };
      await saveLedgerRecord(updated);
      return updated;
    }

    // RazorpayX Payouts
    const xAcc = config.razorpay.xAccountNumber;
    if (!xAcc) {
      throw new AppError(
        'RAZORPAYX_ACCOUNT_NUMBER is not configured in environment variables.',
        503,
        'RAZORPAYX_NOT_ENABLED'
      );
    }

    if (adapter.fetchRazorpayXBalancePaise) {
      const bal = await adapter.fetchRazorpayXBalancePaise(xAcc);
      if (typeof bal === 'number' && bal < breakdown.netPayablePaise) {
        throw new AppError(
          `Insufficient RazorpayX balance (available ₹${fromPaise(bal)}, required ₹${baseLedger.netPayableInr}).`,
          400,
          'INSUFFICIENT_BALANCE'
        );
      }
    }

    const mode: 'UPI' | 'IMPS' = dest.method === 'UPI' ? 'UPI' : 'IMPS';
    const xRes = await adapter.executeRazorpayXPayout({
      xAccountNumber: xAcc,
      amountPaise: breakdown.netPayablePaise,
      mode,
      recipientName: dest.accountHolderName || params.phleboName,
      recipientEmail: params.phleboEmail,
      recipientPhone: params.phleboPhone,
      accountNumber: dest.accountNumber,
      ifsc: dest.ifsc,
      upiId: dest.upiId,
      idempotencyKey,
      referenceId: params.orderNumber,
    });

    const updated: PayoutLedgerRecord = {
      ...baseLedger,
      payoutMode: mode,
      providerPayoutId: xRes.payoutId,
      utrNumber: xRes.utr,
      // Never mark SETTLED/PAID on mere API acceptance; wait for webhook!
      status: xRes.status === 'processed' ? 'PROCESSED' : 'INITIATED',
      errorCode: undefined,
      errorMessage: undefined,
      recommendedAction: undefined,
      eligibleAt: now,
      initiatedAt: now,
      updatedAt: now,
    };
    await saveLedgerRecord(updated);
    return updated;
  } catch (err) {
    const appErr = err as AppError & { code?: string; name?: string };
    const isTimeout = appErr?.name === 'AbortError' || String(appErr?.message || '').toLowerCase().includes('timeout');
    const code: PayoutErrorCode = isTimeout
      ? 'PROVIDER_TIMEOUT'
      : ((appErr?.code as PayoutErrorCode) || 'UNKNOWN_PROVIDER_ERROR');
    const failedLedger: PayoutLedgerRecord = {
      ...baseLedger,
      status: isTimeout ? 'NEEDS_REVIEW' : 'FAILED',
      errorCode: code,
      errorMessage: appErr?.message || 'Payout provider request failed.',
      recommendedAction:
        code === 'RAZORPAYX_NOT_ENABLED'
          ? 'Configure RAZORPAYX_ACCOUNT_NUMBER in backend .env or activate Razorpay Route.'
          : code === 'INSUFFICIENT_BALANCE'
            ? 'Add funds to RazorpayX virtual account and click Retry.'
            : isTimeout
              ? 'Check Razorpay dashboard before retrying to avoid duplicate transfer.'
              : 'Review error details and retry after fixing beneficiary/provider issue.',
      retryEligible: true,
      updatedAt: now,
    };
    await saveLedgerRecord(failedLedger);
    await persistErrorLog({
      ledgerId,
      bookingId: params.bookingId,
      orderNumber: params.orderNumber,
      phleboId: params.phleboId,
      phleboName: params.phleboName,
      amountPaise: breakdown.netPayablePaise,
      amountInr: failedLedger.netPayableInr,
      errorCode: code,
      message: failedLedger.errorMessage || 'Provider error',
      recommendedAction: failedLedger.recommendedAction || 'Review and retry.',
      retryEligible: true,
    });
    return failedLedger;
  }
}

export async function handleTransferOrPayoutWebhookEvent(params: {
  eventName: string;
  entityId: string;
  status?: string;
  utr?: string;
  failureReason?: string;
}): Promise<{ updatedLedgerId?: string; status?: PayoutLifecycleStatus }> {
  const { db, isMockMode } = initializeFirebase();
  let ledger: PayoutLedgerRecord | null = null;

  if (db && !isMockMode) {
    const q1 = await db.collection('payout_ledger').where('providerPayoutId', '==', params.entityId).limit(1).get();
    if (!q1.empty) {
      ledger = q1.docs[0].data() as PayoutLedgerRecord;
    } else {
      const q2 = await db.collection('payout_ledger').where('providerTransferId', '==', params.entityId).limit(1).get();
      if (!q2.empty) ledger = q2.docs[0].data() as PayoutLedgerRecord;
    }
  } else {
    ledger =
      Array.from(inMemoryLedgerStore.values()).find(
        (l) => l.providerPayoutId === params.entityId || l.providerTransferId === params.entityId
      ) || null;
  }

  if (!ledger) return {};

  const now = new Date().toISOString();
  let nextStatus: PayoutLifecycleStatus = ledger.status;
  let errorCode: PayoutErrorCode | undefined;
  let errorMessage: string | undefined;

  if (params.eventName === 'payout.processed' || params.eventName === 'transfer.processed') {
    nextStatus = 'PROCESSED';
  } else if (params.eventName === 'transfer.settled') {
    nextStatus = 'SETTLED';
  } else if (params.eventName === 'payout.failed' || params.eventName === 'transfer.failed') {
    nextStatus = 'FAILED';
    errorCode = params.eventName.startsWith('transfer') ? 'TRANSFER_REJECTED' : 'PAYOUT_FAILED';
    errorMessage = params.failureReason || 'Provider reported payout/transfer failure.';
  } else if (params.eventName === 'payout.reversed' || params.eventName === 'transfer.reversed') {
    nextStatus = 'REVERSED';
    errorCode = 'TRANSFER_REJECTED';
    errorMessage = params.failureReason || 'Bank/provider reversed the transfer.';
  } else if (params.eventName === 'payout.queued') {
    nextStatus = 'PROCESSING';
  }

  const updated: PayoutLedgerRecord = {
    ...ledger,
    status: nextStatus,
    ...(params.utr ? { utrNumber: params.utr } : {}),
    ...(errorCode ? { errorCode } : { errorCode: undefined }),
    ...(errorMessage ? { errorMessage } : { errorMessage: undefined }),
    ...(nextStatus === 'PROCESSED' ? { processedAt: now } : {}),
    ...(nextStatus === 'SETTLED' ? { settledAt: now } : {}),
    updatedAt: now,
  };
  await saveLedgerRecord(updated);

  if (db && !isMockMode && ledger.settlementId) {
    await db.collection('settlements').doc(ledger.settlementId).set(
      {
        phleboPayoutStatus:
          nextStatus === 'SETTLED' || nextStatus === 'PROCESSED'
            ? 'PAID'
            : nextStatus === 'FAILED' || nextStatus === 'REVERSED'
              ? 'FAILED'
              : 'PROCESSING',
        ...(params.utr ? { phleboPayoutRef: params.utr } : {}),
        updatedAt: now,
      },
      { merge: true }
    );
  }

  if (errorCode && errorMessage) {
    await persistErrorLog({
      ledgerId: ledger.id,
      bookingId: ledger.bookingId,
      orderNumber: ledger.orderNumber,
      phleboId: ledger.phleboId,
      phleboName: ledger.phleboName,
      amountPaise: ledger.netPayablePaise,
      amountInr: ledger.netPayableInr,
      errorCode,
      message: errorMessage,
      recommendedAction: 'Review bank/UPI status and retry safely.',
      providerReference: params.entityId,
      retryEligible: true,
    });
  }

  if (['PROCESSED', 'SETTLED', 'FAILED', 'REVERSED'].includes(nextStatus)) {
    await sendPlatformNotification({
      title:
        nextStatus === 'FAILED' || nextStatus === 'REVERSED'
          ? `Payout ${nextStatus}: ${ledger.orderNumber}`
          : `Payout ${nextStatus}: ₹${ledger.netPayableInr.toLocaleString('en-IN')}`,
      message:
        nextStatus === 'FAILED' || nextStatus === 'REVERSED'
          ? `Your payout for ${ledger.orderNumber} could not be completed (${errorMessage}). Please verify your bank/UPI details.`
          : `Your payout for ${ledger.orderNumber} is ${nextStatus}${params.utr ? ` (UTR: ${params.utr})` : ''}.`,
      category: NotificationCategory.PAYOUT_SETTLED,
      priority: nextStatus === 'FAILED' ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
      recipientRole: UserRole.PHLEBOTOMIST,
      orderId: ledger.bookingId,
      channels: [NotificationChannel.IN_APP],
    });
  }

  return { updatedLedgerId: ledger.id, status: nextStatus };
}

export async function holdPhleboPayout(ledgerId: string, reason: string, adminEmail: string) {
  const existing = await getLedgerRecord(ledgerId);
  if (!existing) throw new AppError('Payout ledger entry not found.', 404, 'NOT_FOUND');
  if (['PROCESSED', 'SETTLED'].includes(existing.status)) {
    throw new AppError('Cannot hold an already processed/settled payout.', 400, 'BAD_REQUEST');
  }
  const now = new Date().toISOString();
  const updated: PayoutLedgerRecord = {
    ...existing,
    status: 'ON_HOLD',
    holdReason: reason.trim() || 'Placed on hold by Admin',
    heldByEmail: adminEmail,
    errorCode: 'PAYOUT_ON_HOLD',
    updatedAt: now,
  };
  await saveLedgerRecord(updated);
  await recordAuditLog({
    actorEmail: adminEmail,
    action: 'PHLEBO_PAYOUT_PUT_ON_HOLD',
    resourceType: 'PAYOUT_LEDGER',
    resourceId: ledgerId,
    departmentId: 'FINANCE_BUSINESS',
    severity: 'SENSITIVE',
    summary: `Placed payout ${ledgerId} on hold: ${updated.holdReason}`,
  });
  return updated;
}

export async function manualReconcilePhleboPayout(params: {
  ledgerId: string;
  utrNumber: string;
  notes?: string;
  adminEmail: string;
}): Promise<PayoutLedgerRecord> {
  const utr = params.utrNumber.trim();
  if (utr.length < 6) {
    throw new AppError(
      'A verified external UTR / bank transaction reference (min 6 chars) is required for manual reconciliation.',
      400,
      'REFERENCE_REQUIRED'
    );
  }
  const existing = await getLedgerRecord(params.ledgerId);
  if (!existing) throw new AppError('Payout ledger entry not found.', 404, 'NOT_FOUND');

  const now = new Date().toISOString();
  const updated: PayoutLedgerRecord = {
    ...existing,
    payoutMethod: 'MANUAL',
    payoutMode: 'MANUAL',
    utrNumber: utr,
    manualReferenceId: utr,
    reconciledByEmail: params.adminEmail,
    status: 'SETTLED',
    errorCode: undefined,
    errorMessage: undefined,
    settledAt: now,
    updatedAt: now,
  };
  await saveLedgerRecord(updated);
  await recordAuditLog({
    actorEmail: params.adminEmail,
    action: 'PHLEBO_PAYOUT_MANUALLY_RECONCILED',
    resourceType: 'PAYOUT_LEDGER',
    resourceId: params.ledgerId,
    departmentId: 'FINANCE_BUSINESS',
    severity: 'SENSITIVE',
    summary: `Manually reconciled payout ${params.ledgerId} with UTR ${utr}. ${params.notes || ''}`.trim(),
  });
  return updated;
}

export async function listPhleboPayoutsForDashboard(phleboId?: string): Promise<{
  ledgers: PayoutLedgerRecord[];
  errors: PayoutErrorLogRecord[];
}> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const ledgersQuery = phleboId
      ? db.collection('payout_ledger').where('phleboId', '==', phleboId).limit(200)
      : db.collection('payout_ledger').limit(250);
    const [lSnap, eSnap] = await Promise.all([
      ledgersQuery.get(),
      phleboId
        ? db.collection('payout_error_logs').where('phleboId', '==', phleboId).limit(100).get()
        : db.collection('payout_error_logs').limit(200).get(),
    ]);
    return {
      ledgers: lSnap.docs.map((d) => d.data() as PayoutLedgerRecord),
      errors: eSnap.docs.map((d) => d.data() as PayoutErrorLogRecord),
    };
  }
  const ledgers = Array.from(inMemoryLedgerStore.values()).filter((l) => !phleboId || l.phleboId === phleboId);
  const errors = Array.from(inMemoryErrorStore.values()).filter((e) => !phleboId || e.phleboId === phleboId);
  return { ledgers, errors };
}
