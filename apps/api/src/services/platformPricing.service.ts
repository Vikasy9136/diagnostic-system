import {
  type BookingPricingSnapshot,
  calculateCentralizedBookingFinancialsPaise,
  DEFAULT_PLATFORM_PRICING_CONFIG,
  deepCleanFirestorePayload,
  type FinancialLedgerCategory,
  type FinancialLedgerRecord,
  type PlatformPricingChangeHistoryEntry,
  type PlatformPricingConfig,
  UserRole,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { recordAuditLog } from '../middleware/rbac';
import { updateWithdrawalConfig } from './wallet.service';

let memPricingConfig: PlatformPricingConfig = { ...DEFAULT_PLATFORM_PRICING_CONFIG };
const memPricingHistory: PlatformPricingChangeHistoryEntry[] = [];
const memLedger = new Map<string, FinancialLedgerRecord>();

export function resetPlatformPricingTestStores() {
  memPricingConfig = { ...DEFAULT_PLATFORM_PRICING_CONFIG };
  memPricingHistory.length = 0;
  memLedger.clear();
}

function bumpSemverPatch(version: string): string {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((version || '').trim());
  if (!m) return 'v1.0.1';
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export async function getPlatformPricingConfig(): Promise<PlatformPricingConfig> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('settings').doc('platformPricingConfig').get();
    if (snap.exists) {
      return {
        ...DEFAULT_PLATFORM_PRICING_CONFIG,
        ...(snap.data() as Partial<PlatformPricingConfig>),
      };
    }
  }
  return { ...memPricingConfig };
}

export async function getPlatformPricingHistory(): Promise<PlatformPricingChangeHistoryEntry[]> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db
      .collection('pricing_config_history')
      .orderBy('changedAt', 'desc')
      .limit(50)
      .get();
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<PlatformPricingChangeHistoryEntry, 'id'>),
    }));
  }
  return [...memPricingHistory].sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}

function validatePct(val: unknown, label: string, max = 100) {
  if (val === undefined) return;
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > max) {
    throw new AppError(`${label} must be between 0% and ${max}%.`, 400, 'INVALID_PERCENTAGE');
  }
}

export async function updatePlatformPricingConfig(params: {
  patch: Partial<PlatformPricingConfig>;
  actorUid: string;
  actorEmail: string;
  summary?: string;
}): Promise<PlatformPricingConfig> {
  const { patch } = params;
  validatePct(patch.defaultLargeLabMarginPct, 'Default Large Lab margin');
  validatePct(patch.largeLabSideFeePct, 'Large Lab side fee');
  validatePct(patch.smallLabDefaultFeePct, 'Small Lab default platform fee');
  validatePct(patch.phleboPlatformFeePct, 'Phlebo platform fee', 50);
  validatePct(patch.taxPct, 'Tax percentage', 50);
  validatePct(patch.gatewayChargePct, 'Gateway charge percentage', 20);

  const current = await getPlatformPricingConfig();
  const now = new Date().toISOString();
  const nextVersion = bumpSemverPatch(current.pricingVersion);

  const next: PlatformPricingConfig = {
    ...current,
    ...patch,
    id: 'platformPricingConfig',
    pricingVersion: nextVersion,
    effectiveDate: patch.effectiveDate || now,
    updatedByUid: params.actorUid,
    updatedByEmail: params.actorEmail,
    updatedAt: now,
  };

  const histId = `PRC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const historyEntry: PlatformPricingChangeHistoryEntry = {
    id: histId,
    pricingVersion: nextVersion,
    changedAt: now,
    changedByUid: params.actorUid,
    changedByEmail: params.actorEmail,
    summary:
      params.summary?.trim() ||
      `Updated pricing config to ${nextVersion} (SmallLab ${next.smallLabDefaultFeePct}%, Phlebo ${next.phleboPlatformFeePct}%)`,
    configSnapshot: next,
  };

  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db
      .collection('settings')
      .doc('platformPricingConfig')
      .set(deepCleanFirestorePayload(next), { merge: true });
    await db
      .collection('pricing_config_history')
      .doc(histId)
      .set(deepCleanFirestorePayload(historyEntry));
  } else {
    memPricingConfig = next;
    memPricingHistory.unshift(historyEntry);
  }

  // Keep WithdrawalConfig.platformFeePct synchronized with Phlebo platform fee %
  await updateWithdrawalConfig({ platformFeePct: next.phleboPlatformFeePct }, params.actorEmail);

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: UserRole.ADMIN,
    action: 'PLATFORM_PRICING_UPDATED',
    resourceType: 'settings',
    resourceId: 'platformPricingConfig',
    summary: historyEntry.summary,
  });

  return next;
}

export async function calculateAuthoritativeBookingSnapshot(params: {
  smallLabB2bPricePaise: number;
  largeLabNegotiatedPricePaise?: number;
  phleboGrossPayoutOverridePaise?: number;
  testCode?: string;
  packageCode?: string;
  smallLabId?: string;
  discountPaise?: number;
}): Promise<BookingPricingSnapshot> {
  const cfg = await getPlatformPricingConfig();
  return calculateCentralizedBookingFinancialsPaise({
    config: cfg,
    ...params,
  });
}

async function saveLedgerRecordIdempotent(rec: FinancialLedgerRecord): Promise<FinancialLedgerRecord> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const ref = db.collection('financial_ledger').doc(rec.id);
    const snap = await ref.get();
    if (snap.exists) return snap.data() as FinancialLedgerRecord;
    await ref.set(deepCleanFirestorePayload(rec));
    return rec;
  }
  const existing = memLedger.get(rec.id);
  if (existing) return existing;
  memLedger.set(rec.id, rec);
  return rec;
}

export async function recordBookingFinancialLedger(params: {
  orderId: string;
  orderNumber: string;
  smallLabId: string;
  largeLabId: string;
  phleboId?: string;
  testCode?: string;
  packageCode?: string;
  snapshot: BookingPricingSnapshot;
}): Promise<FinancialLedgerRecord[]> {
  const s = params.snapshot;
  const ts = new Date().toISOString();

  const build = (
    category: FinancialLedgerCategory,
    opts: {
      beneficiaryId?: string;
      beneficiaryRole: FinancialLedgerRecord['beneficiaryRole'];
      calculationBasePaise: number;
      percentageApplied: number;
      grossAmountPaise: number;
      feeAmountPaise: number;
      netAmountPaise: number;
      notes?: string;
    }
  ): FinancialLedgerRecord => {
    const id = `LDG-${params.orderId}-${category}`;
    return {
      id,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      category,
      beneficiaryId: opts.beneficiaryId,
      beneficiaryRole: opts.beneficiaryRole,
      smallLabId: params.smallLabId,
      largeLabId: params.largeLabId,
      phleboId: params.phleboId,
      testCode: params.testCode,
      packageCode: params.packageCode,
      pricingVersion: s.pricingVersion,
      calculationBasePaise: opts.calculationBasePaise,
      percentageApplied: opts.percentageApplied,
      grossAmountPaise: opts.grossAmountPaise,
      feeAmountPaise: opts.feeAmountPaise,
      netAmountPaise: opts.netAmountPaise,
      status: 'RECORDED',
      transactionRef: `TXN-${params.orderNumber}-${category}`,
      idempotencyKey: `ledger_${params.orderId}_${category}`,
      timestamp: ts,
      notes: opts.notes,
    };
  };

  const records: FinancialLedgerRecord[] = [
    build('LARGE_LAB_PROCESSING_COST', {
      beneficiaryId: params.largeLabId,
      beneficiaryRole: 'LARGE_LAB',
      calculationBasePaise: s.largeLabNegotiatedPricePaise,
      percentageApplied: s.largeLabSideFeePct,
      grossAmountPaise: s.largeLabNegotiatedPricePaise,
      feeAmountPaise: s.largeLabSideFeePaise,
      netAmountPaise: s.largeLabNetPayablePaise,
      notes: 'Agreed Large Lab processing payable',
    }),
    build('LARGE_LAB_PRICE_DIFFERENCE_MARGIN', {
      beneficiaryId: 'PLATFORM',
      beneficiaryRole: 'PLATFORM',
      calculationBasePaise: s.smallLabB2bPricePaise,
      percentageApplied:
        s.smallLabB2bPricePaise > 0
          ? Math.round((s.largeLabPriceDifferenceMarginPaise * 10000) / s.smallLabB2bPricePaise) / 100
          : 0,
      grossAmountPaise: s.largeLabPriceDifferenceMarginPaise,
      feeAmountPaise: 0,
      netAmountPaise: s.largeLabPriceDifferenceMarginPaise,
      notes: 'Gross commercial price difference (Small Lab B2B - Large Lab Negotiated)',
    }),
    build('SMALL_LAB_INCLUDED_PLATFORM_FEE', {
      beneficiaryId: 'PLATFORM',
      beneficiaryRole: 'PLATFORM',
      calculationBasePaise: s.smallLabB2bPricePaise,
      percentageApplied: s.smallLabIncludedFeePct,
      grossAmountPaise: s.smallLabIncludedFeePaise,
      feeAmountPaise: 0,
      netAmountPaise: s.smallLabIncludedFeePaise,
      notes: 'Included in Small Lab B2B selling price (sub-component of commercial spread, not added on top)',
    }),
    build('PHLEBO_GROSS_EARNING', {
      beneficiaryId: params.phleboId,
      beneficiaryRole: 'PHLEBOTOMIST',
      calculationBasePaise: s.phleboGrossPayoutPaise,
      percentageApplied: 100,
      grossAmountPaise: s.phleboGrossPayoutPaise,
      feeAmountPaise: 0,
      netAmountPaise: s.phleboGrossPayoutPaise,
      notes: 'Phlebo gross payout before platform fee deduction',
    }),
    build('PHLEBO_PLATFORM_FEE', {
      beneficiaryId: 'PLATFORM',
      beneficiaryRole: 'PLATFORM',
      calculationBasePaise: s.phleboGrossPayoutPaise,
      percentageApplied: s.phleboPlatformFeePct,
      grossAmountPaise: s.phleboPlatformFeePaise,
      feeAmountPaise: 0,
      netAmountPaise: s.phleboPlatformFeePaise,
      notes: 'Platform fee deducted from Phlebo gross payout',
    }),
    build('PHLEBO_NET_EARNING', {
      beneficiaryId: params.phleboId,
      beneficiaryRole: 'PHLEBOTOMIST',
      calculationBasePaise: s.phleboGrossPayoutPaise,
      percentageApplied: 100 - s.phleboPlatformFeePct,
      grossAmountPaise: s.phleboGrossPayoutPaise,
      feeAmountPaise: s.phleboPlatformFeePaise,
      netAmountPaise: s.phleboNetEarningPaise,
      notes: 'Net Phlebo wallet credit amount',
    }),
  ];

  if (s.taxPaise > 0) {
    records.push(
      build('APPLICABLE_TAX', {
        beneficiaryId: 'TAX_AUTHORITY',
        beneficiaryRole: 'TAX_AUTHORITY',
        calculationBasePaise: s.finalSmallLabPayablePaise - s.taxPaise,
        percentageApplied: s.taxPct,
        grossAmountPaise: s.taxPaise,
        feeAmountPaise: 0,
        netAmountPaise: s.taxPaise,
        notes: 'Government tax collected (excluded from platform revenue)',
      })
    );
  }

  if (s.gatewayChargePaise > 0) {
    records.push(
      build('PAYMENT_GATEWAY_CHARGE', {
        beneficiaryId: 'GATEWAY',
        beneficiaryRole: 'GATEWAY',
        calculationBasePaise: s.finalSmallLabPayablePaise,
        percentageApplied: s.gatewayChargePct,
        grossAmountPaise: s.gatewayChargePaise,
        feeAmountPaise: 0,
        netAmountPaise: s.gatewayChargePaise,
        notes: 'Payment gateway processing expense',
      })
    );
  }

  const saved: FinancialLedgerRecord[] = [];
  for (const r of records) {
    saved.push(await saveLedgerRecordIdempotent(r));
  }
  return saved;
}

export async function recordBookingRefundOrCancellationLedger(params: {
  orderId: string;
  orderNumber: string;
  smallLabId: string;
  largeLabId: string;
  refundAmountPaise: number;
  pricingVersion: string;
  reason: string;
}): Promise<FinancialLedgerRecord> {
  const ts = new Date().toISOString();
  const amt = Math.max(0, Math.round(params.refundAmountPaise));
  return saveLedgerRecordIdempotent({
    id: `LDG-${params.orderId}-REFUND`,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    category: 'REFUND',
    beneficiaryId: params.smallLabId,
    beneficiaryRole: 'SMALL_LAB',
    smallLabId: params.smallLabId,
    largeLabId: params.largeLabId,
    pricingVersion: params.pricingVersion,
    calculationBasePaise: amt,
    percentageApplied: 100,
    grossAmountPaise: amt,
    feeAmountPaise: 0,
    netAmountPaise: amt,
    status: 'RECORDED',
    transactionRef: `TXN-${params.orderNumber}-REFUND`,
    idempotencyKey: `ledger_${params.orderId}_REFUND`,
    timestamp: ts,
    notes: params.reason,
  });
}

export async function getAdminFinancialLedgerSummary(filters?: {
  date?: string;
  testCode?: string;
  packageCode?: string;
  largeLabId?: string;
  smallLabId?: string;
  phleboId?: string;
  orderId?: string;
  pricingVersion?: string;
}) {
  const { db, isMockMode } = initializeFirebase();
  let all: FinancialLedgerRecord[] = [];
  if (db && !isMockMode) {
    const snap = await db.collection('financial_ledger').get();
    all = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FinancialLedgerRecord, 'id'>),
    }));
  } else {
    all = Array.from(memLedger.values());
  }

  const filtered = all.filter((r) => {
    if (filters?.date && !r.timestamp.startsWith(filters.date)) return false;
    if (filters?.testCode && r.testCode !== filters.testCode) return false;
    if (filters?.packageCode && r.packageCode !== filters.packageCode) return false;
    if (filters?.largeLabId && r.largeLabId !== filters.largeLabId) return false;
    if (filters?.smallLabId && r.smallLabId !== filters.smallLabId) return false;
    if (filters?.phleboId && r.phleboId !== filters.phleboId) return false;
    if (filters?.orderId && r.orderId !== filters.orderId) return false;
    if (filters?.pricingVersion && r.pricingVersion !== filters.pricingVersion) return false;
    return true;
  });

  const sumNet = (cat: FinancialLedgerCategory) =>
    filtered.filter((r) => r.category === cat).reduce((acc, r) => acc + r.netAmountPaise, 0);

  const largeLabPriceDifferenceMarginPaise = sumNet('LARGE_LAB_PRICE_DIFFERENCE_MARGIN');
  const smallLabIncludedPlatformFeePaise = sumNet('SMALL_LAB_INCLUDED_PLATFORM_FEE');
  const phleboPlatformFeePaise = sumNet('PHLEBO_PLATFORM_FEE');
  const largeLabProcessingCostPaise = sumNet('LARGE_LAB_PROCESSING_COST');
  const phleboNetEarningPaise = sumNet('PHLEBO_NET_EARNING');
  const refundsAndAdjustmentsPaise = sumNet('REFUND') + sumNet('ADJUSTMENT');
  const taxesPaise = sumNet('APPLICABLE_TAX');
  const gatewayExpensesPaise = sumNet('PAYMENT_GATEWAY_CHARGE');

  // IMPORTANT: Do NOT double count smallLabIncludedPlatformFeePaise on top of largeLabPriceDifferenceMarginPaise
  const totalGrossPlatformRevenuePaise =
    largeLabPriceDifferenceMarginPaise + phleboPlatformFeePaise;
  const netPlatformRevenuePaise = Math.max(
    0,
    totalGrossPlatformRevenuePaise - refundsAndAdjustmentsPaise - gatewayExpensesPaise
  );

  return {
    records: filtered,
    totals: {
      largeLabPriceDifferenceMarginPaise,
      smallLabIncludedPlatformFeePaise,
      phleboPlatformFeePaise,
      largeLabProcessingCostPaise,
      phleboNetEarningPaise,
      totalGrossPlatformRevenuePaise,
      refundsAndAdjustmentsPaise,
      taxesPaise,
      gatewayExpensesPaise,
      netPlatformRevenuePaise,
    },
  };
}
