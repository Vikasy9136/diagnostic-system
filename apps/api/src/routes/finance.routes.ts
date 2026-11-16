import { NextFunction, Response, Router } from 'express';
import {
  type AutomationRunRecord,
  type BillingModelConfig,
  type CoreDepartmentId,
  DEFAULT_COMMISSION_CONFIG,
  type ExpenseRecord,
  type FinancialBudgetRecord,
  type LabSubscriptionRecord,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  type PaymentTransactionRecord,
  type PlatformInvoiceRecord,
  type ReconciliationAlertRecord,
  type RefundRequestRecord,
  type SubscriptionPlanRecord,
  UserRole,
} from '@diagnostic/shared';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, requireRoles } from '../middleware/auth';
import {
  AuthenticatedRequest,
  getRequestClientMeta,
  recordAuditLog,
  requireAnyPermission,
  requirePermissions,
} from '../middleware/rbac';
import { sendPlatformNotification } from '../services/notification.service';
import { issueGatewayRefund, releasePayout } from '../services/razorpay.service';
import { ensureOrganisationBootstrapped } from '../services/user-directory.service';
import { DEV_DATA_STORE } from '../services/devStore';
import { dualGet, dualList, dualSet, recordDualAutomationRun } from '../services/dualCollection';
import { runCashPlatformFeeAudit } from '../services/cash-settlement-monitor.service';

export const financeRouter = Router();

financeRouter.use(requireAuth, requireRoles(UserRole.ADMIN));

function currentBillingPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function addDaysIso(isoOrDate: Date | string, days: number): string {
  const dt = typeof isoOrDate === 'string' ? new Date(isoOrDate) : new Date(isoOrDate.getTime());
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

async function resolveFinanceHeadEmail(): Promise<string> {
  const dept = await dualGet<{ headEmail?: string }>('departments', 'FINANCE_BUSINESS');
  return (dept?.headEmail || config.admin.email).trim().toLowerCase();
}

async function getBillingConfigDoc(): Promise<BillingModelConfig> {
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    const snap = await db.collection('settings').doc('commission').get();
    if (snap.exists) {
      return { ...DEFAULT_COMMISSION_CONFIG, ...(snap.data() as Partial<BillingModelConfig>) };
    }
  }
  return { ...DEFAULT_COMMISSION_CONFIG, ...DEV_DATA_STORE.billingConfig };
}

// ===========================================================================
// BILLING MODE, COMMISSION & PAYOUT CONFIGURATION
// ===========================================================================
financeRouter.get(
  '/config',
  requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'CONFIGURE_COMMISSIONS_PAYOUTS', 'MANAGE_SUBSCRIPTIONS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);
      const data = await getBillingConfigDoc();
      return res.json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

async function handleUpdateConfig(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body || {};
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      ...(body.billingMode ? { billingMode: body.billingMode } : {}),
      ...(typeof body.enablePatientPaymentSplitting === 'boolean'
        ? { enablePatientPaymentSplitting: body.enablePatientPaymentSplitting }
        : {}),
      ...(typeof body.enablePartnerLabPayouts === 'boolean'
        ? { enablePartnerLabPayouts: body.enablePartnerLabPayouts }
        : {}),
      ...(typeof body.hideSubscriptionsUi === 'boolean'
        ? { hideSubscriptionsUi: body.hideSubscriptionsUi }
        : {}),
      ...(typeof body.enableSubscriptionsModule === 'boolean'
        ? { enableSubscriptionsModule: body.enableSubscriptionsModule }
        : {}),
      ...(typeof body.instantPayoutEnabled === 'boolean'
        ? { instantPayoutEnabled: body.instantPayoutEnabled }
        : {}),
      ...(typeof body.instantPayoutWindowMinutes === 'number'
        ? { instantPayoutWindowMinutes: body.instantPayoutWindowMinutes }
        : {}),
      ...(typeof body.autoReleaseInstantPayouts === 'boolean'
        ? { autoReleaseInstantPayouts: body.autoReleaseInstantPayouts }
        : {}),
      ...(typeof body.platformServiceFeePct === 'number'
        ? { platformServiceFeePct: body.platformServiceFeePct }
        : {}),
      ...(typeof body.defaultSubscriptionGraceDays === 'number'
        ? { defaultSubscriptionGraceDays: body.defaultSubscriptionGraceDays }
        : {}),
      ...(typeof body.commissionPct === 'number' ? { commissionPct: body.commissionPct } : {}),
      ...(body.defaultMarginMode ? { defaultMarginMode: body.defaultMarginMode } : {}),
      ...(typeof body.courierBaseFeeInr === 'number'
        ? { courierBaseFeeInr: body.courierBaseFeeInr }
        : {}),
      ...(typeof body.includedBaseKm === 'number' ? { includedBaseKm: body.includedBaseKm } : {}),
      ...(typeof body.perKmFeeInr === 'number' ? { perKmFeeInr: body.perKmFeeInr } : {}),
      ...(typeof body.customDropBaseFeeInr === 'number'
        ? { customDropBaseFeeInr: body.customDropBaseFeeInr }
        : {}),
      ...(typeof body.statSurchargeInr === 'number'
        ? { statSurchargeInr: body.statSurchargeInr }
        : {}),
      ...(typeof body.defaultBroadcastRadiusKm === 'number'
        ? { defaultBroadcastRadiusKm: body.defaultBroadcastRadiusKm }
        : {}),
      ...(body.largeLabAgreements ? { largeLabAgreements: body.largeLabAgreements } : {}),
      updatedBy: req.user?.email || config.admin.email,
      updatedAt: now,
    };

    const current = await getBillingConfigDoc();
    const merged: BillingModelConfig = { ...current, ...(patch as Partial<BillingModelConfig>) };
    const { db, isMockMode } = initializeFirebase();
    if (db && !isMockMode) {
      await db.collection('settings').doc('commission').set(patch, { merge: true });
    }
    DEV_DATA_STORE.billingConfig = merged;

    await recordAuditLog({
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorName: req.user?.displayName,
      actorRole: req.user?.role,
      action: 'FINANCE_BILLING_CONFIG_UPDATED',
      resourceType: 'FINANCE_CONFIG',
      resourceId: 'commission',
      departmentId: 'FINANCE_BUSINESS',
      severity: 'SENSITIVE',
      summary: `Updated billing/commission configuration (mode=${String(
        patch.billingMode || 'unchanged'
      )}, partnerPayouts=${String(patch.enablePartnerLabPayouts ?? 'unchanged')})`,
      ...getRequestClientMeta(req),
    });

    return res.json({
      success: true,
      data: merged,
      message: 'Finance & billing configuration saved.',
      timestamp: now,
    });
  } catch (err) {
    return next(err);
  }
}

financeRouter.patch('/config', requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'), handleUpdateConfig);
financeRouter.put('/config', requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'), handleUpdateConfig);

// ===========================================================================
// OVERVIEW WORKSPACE (ALL FINANCE COLLECTIONS)
// ===========================================================================
financeRouter.get(
  '/overview',
  requireAnyPermission(
    'VIEW_FINANCE_DASHBOARD',
    'MANAGE_SUBSCRIPTIONS',
    'MANAGE_INVOICES',
    'VIEW_PAYMENT_RECORDS',
    'MANAGE_EXPENSES_BUDGETS',
    'MANAGE_RECONCILIATION',
    'APPROVE_REFUNDS',
    'VIEW_FINANCIAL_REPORTS',
    'VIEW_SUPER_ADMIN_DASHBOARD'
  ),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await ensureOrganisationBootstrapped(req.user?.email);

      const { db, isMockMode } = initializeFirebase();
      const [
        configDoc,
        plans,
        subscriptions,
        invoices,
        payments,
        alerts,
        expenses,
        budgets,
        refunds,
      ] = await Promise.all([
        getBillingConfigDoc(),
        dualList<SubscriptionPlanRecord>('subscription_plans'),
        dualList<LabSubscriptionRecord>('lab_subscriptions'),
        dualList<PlatformInvoiceRecord>('invoices'),
        dualList<PaymentTransactionRecord>('payment_records'),
        dualList<ReconciliationAlertRecord>('reconciliation_alerts'),
        dualList<ExpenseRecord>('expenses'),
        dualList<FinancialBudgetRecord>('financial_budgets'),
        dualList<RefundRequestRecord>('refund_requests'),
      ]);

      let automationRuns: AutomationRunRecord[] = DEV_DATA_STORE.automationRuns.filter(
        (r) => r.departmentId === 'FINANCE_BUSINESS'
      );
      let settlements: Array<Record<string, unknown>> = [];
      let orders: Array<Record<string, unknown>> = [];

      if (db && !isMockMode) {
        const [runsSnap, stlSnap, ordersSnap] = await Promise.all([
          db
            .collection('automation_runs')
            .where('departmentId', '==', 'FINANCE_BUSINESS')
            .limit(40)
            .get(),
          db.collection('settlements').limit(200).get(),
          db.collection('orders').limit(200).get(),
        ]);
        automationRuns = runsSnap.docs.map((d) => d.data() as AutomationRunRecord);
        settlements = stlSnap.docs.map((d) => d.data() as Record<string, unknown>);
        orders = ordersSnap.docs.map((d) => d.data() as Record<string, unknown>);
      }

      const sortDesc = <T extends { createdAt?: string }>(arr: T[]) =>
        arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const paidInvoicesRevenue = invoices
        .filter((i) => i.status === 'PAID')
        .reduce((s, i) => s + Number(i.totalAmountInr || 0), 0);
      const bookingPlatformFees = orders.reduce(
        (s, o) => s + Number(o.platformFeeInr || 0),
        0
      );
      const outstandingAmountInr = invoices
        .filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE')
        .reduce((s, i) => s + Number(i.totalAmountInr || 0), 0);
      const approvedExpensesInr = expenses
        .filter((e) => e.approvalStatus === 'APPROVED')
        .reduce((s, e) => s + Number(e.amountInr || 0), 0);

      const canViewPayments =
        Boolean(req.user?.isSuperAdmin) ||
        Boolean(req.user?.permissions.includes('VIEW_PAYMENT_RECORDS'));

      const nowMs = Date.now();
      let eligiblePendingCount = 0;
      let within30mSlaCount = 0;
      let overdueSlaCount = 0;
      let releasedCount = 0;
      let pendingAmountInr = 0;

      for (const stl of settlements) {
        const labAmt = Number(stl.labPayoutInr || 0);
        const phAmt = Number(stl.phleboPayoutInr || 0);
        const labPending = labAmt > 0 && stl.labPayoutStatus !== 'PAID';
        const phPending = phAmt > 0 && stl.phleboPayoutStatus !== 'PAID';
        if ((labAmt > 0 && stl.labPayoutStatus === 'PAID') || (phAmt > 0 && stl.phleboPayoutStatus === 'PAID')) {
          releasedCount += 1;
        }
        if (stl.paymentStatus === 'PAID' && stl.instantPayoutEligible !== false && (labPending || phPending)) {
          eligiblePendingCount += 1;
          pendingAmountInr += (labPending ? labAmt : 0) + (phPending ? phAmt : 0);
          const dueMs = stl.payoutDueAt ? new Date(String(stl.payoutDueAt)).getTime() : 0;
          if (dueMs && nowMs > dueMs) {
            overdueSlaCount += 1;
          } else {
            within30mSlaCount += 1;
          }
        }
      }

      const instantPayoutStats = {
        eligiblePendingCount,
        within30mSlaCount,
        overdueSlaCount,
        releasedCount,
        pendingAmountInr: Math.round(pendingAmountInr * 100) / 100,
      };

      return res.json({
        success: true,
        data: {
          config: configDoc,
          plans: plans.sort((a, b) => a.priceInr - b.priceInr),
          subscriptions: sortDesc(subscriptions),
          invoices: sortDesc(invoices),
          payments: canViewPayments ? sortDesc(payments) : [],
          reconciliationAlerts: sortDesc(alerts),
          expenses: sortDesc(expenses),
          budgets: sortDesc(budgets),
          refunds: sortDesc(refunds),
          automationRuns: sortDesc(automationRuns),
          instantPayoutStats,
          kpis: {
            paidInvoicesRevenueInr: Math.round(paidInvoicesRevenue * 100) / 100,
            bookingPlatformFeesInr: Math.round(bookingPlatformFees * 100) / 100,
            totalRecognizedRevenueInr:
              Math.round((paidInvoicesRevenue + bookingPlatformFees) * 100) / 100,
            outstandingAmountInr: Math.round(outstandingAmountInr * 100) / 100,
            approvedExpensesInr: Math.round(approvedExpensesInr * 100) / 100,
            netOperatingPositionInr:
              Math.round(
                (paidInvoicesRevenue + bookingPlatformFees - approvedExpensesInr) * 100
              ) / 100,
            activeSubscriptionsCount: subscriptions.filter((s) => s.status === 'ACTIVE').length,
            expiringSoonCount: subscriptions.filter(
              (s) => s.status === 'EXPIRING_SOON' || s.status === 'GRACE_PERIOD'
            ).length,
            openReconciliationAlertsCount: alerts.filter((a) => a.status === 'OPEN').length,
            pendingRefundApprovalsCount: refunds.filter(
              (r) => r.status === 'PENDING_HUMAN_APPROVAL'
            ).length,
            eligiblePhleboCourierFeesInr: settlements.reduce(
              (s, st) => s + Number(st.phleboPayoutInr || 0),
              0
            ),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ===========================================================================
// PLANS & LAB SUBSCRIPTIONS
// ===========================================================================
financeRouter.post(
  '/plans',
  requirePermissions('MANAGE_SUBSCRIPTIONS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        code,
        name,
        targetTier,
        billingCycle,
        priceInr,
        platformServiceFeePct,
        includedMonthlyPickups,
        graceDays,
        features,
      } = req.body || {};

      if (!name?.trim() || Number(priceInr) <= 0) {
        return next(new AppError('Plan name and positive priceInr are required.', 400, 'BAD_REQUEST'));
      }
      const now = new Date().toISOString();
      const id = `PLAN-${String(code || name)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .slice(0, 24)}`;
      const existing = await dualGet<SubscriptionPlanRecord>('subscription_plans', id);

      const plan: SubscriptionPlanRecord = {
        id,
        code: String(code || id).toUpperCase(),
        name: name.trim(),
        targetTier: targetTier || 'SMALL_LAB',
        billingCycle: billingCycle || 'MONTHLY',
        priceInr: Number(priceInr),
        platformServiceFeePct: Number(platformServiceFeePct ?? 5),
        includedMonthlyPickups: Number(includedMonthlyPickups ?? 100),
        graceDays: Number(graceDays ?? 7),
        features: Array.isArray(features) ? features.map(String) : existing?.features || [],
        isActive: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      await dualSet('subscription_plans', id, plan, true);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'SUBSCRIPTION_PLAN_SAVED',
        resourceType: 'SUBSCRIPTION_PLAN',
        resourceId: id,
        departmentId: 'FINANCE_BUSINESS',
        summary: `Saved plan ${plan.name} (₹${plan.priceInr}/${plan.billingCycle}, fee=${plan.platformServiceFeePct}%)`,
        ...getRequestClientMeta(req),
      });
      return res.status(existing ? 200 : 201).json({ success: true, data: plan, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

financeRouter.post(
  '/subscriptions',
  requirePermissions('MANAGE_SUBSCRIPTIONS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { labId, labName, labEmail, labTier, labType, planId, startDate, autoRenew } =
        req.body || {};
      if (!labId || !planId) {
        return next(new AppError('labId and planId are required.', 400, 'BAD_REQUEST'));
      }

      const plan = await dualGet<SubscriptionPlanRecord>('subscription_plans', String(planId));
      if (!plan) {
        return next(new AppError(`Subscription plan not found: ${planId}`, 404, 'NOT_FOUND'));
      }

      let resolvedName = labName?.trim() || String(labId);
      let resolvedEmail = labEmail?.trim() ? String(labEmail).trim().toLowerCase() : undefined;
      let resolvedTier: 'SMALL_LAB' | 'LARGE_LAB' =
        labTier === 'LARGE_LAB' || labType === 'LARGE_LAB' ? 'LARGE_LAB' : 'SMALL_LAB';

      const { db, isMockMode } = initializeFirebase();
      if (db && !isMockMode) {
        const labSnap = await db.collection('labs').doc(String(labId)).get();
        if (!labSnap.exists) {
          return next(new AppError(`Lab not found: ${labId}`, 404, 'NOT_FOUND'));
        }
        const lab = labSnap.data() as Record<string, unknown>;
        resolvedName = String(lab.name || resolvedName);
        resolvedEmail = lab.email ? String(lab.email) : resolvedEmail;
        resolvedTier = lab.type === 'LARGE_LAB' ? 'LARGE_LAB' : 'SMALL_LAB';
      }

      const now = new Date().toISOString();
      const startIso = startDate ? new Date(startDate).toISOString() : now;
      const cycleDays =
        plan.billingCycle === 'YEARLY' ? 365 : plan.billingCycle === 'QUARTERLY' ? 90 : 30;
      const renewalIso = addDaysIso(startIso, cycleDays);
      const subId = `SUB-${labId}`;

      const sub: LabSubscriptionRecord = {
        id: subId,
        labId: String(labId),
        labName: resolvedName,
        ...(resolvedEmail ? { labEmail: resolvedEmail } : {}),
        labTier: resolvedTier,
        planId: plan.id,
        planName: plan.name,
        billingCycle: plan.billingCycle,
        monthlyPriceInr: plan.priceInr,
        platformServiceFeePct: plan.platformServiceFeePct,
        status: 'ACTIVE',
        startDate: startIso,
        renewalDate: renewalIso,
        autoRenew: autoRenew !== false,
        createdAt: now,
        updatedAt: now,
      };

      await dualSet('lab_subscriptions', subId, sub, true);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'LAB_SUBSCRIPTION_ASSIGNED',
        resourceType: 'LAB_SUBSCRIPTION',
        resourceId: subId,
        departmentId: 'FINANCE_BUSINESS',
        summary: `Enrolled ${sub.labName} onto ${plan.name} (₹${plan.priceInr}, renews ${renewalIso.slice(0, 10)})`,
        ...getRequestClientMeta(req),
      });

      return res.status(201).json({ success: true, data: sub, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

// ===========================================================================
// INVOICES & AUTOMATED DEDUPLICATED BILLING + REMINDER JOBS
// ===========================================================================
financeRouter.post(
  '/invoices',
  requirePermissions('MANAGE_INVOICES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        labId,
        labName,
        labEmail,
        invoiceType,
        billingPeriod,
        subtotalInr,
        gstPct,
        dueDate,
        notes,
        subscriptionId,
        razorpayOrderId,
      } = req.body || {};

      if (!labId || !Number.isFinite(Number(subtotalInr)) || Number(subtotalInr) <= 0) {
        return next(
          new AppError('labId and positive subtotalInr are required.', 400, 'BAD_REQUEST')
        );
      }

      let resolvedName = labName?.trim() || String(labId);
      let resolvedEmail = labEmail?.trim() ? String(labEmail).trim().toLowerCase() : undefined;

      const { db, isMockMode } = initializeFirebase();
      if (db && !isMockMode) {
        const labSnap = await db.collection('labs').doc(String(labId)).get();
        if (!labSnap.exists) {
          return next(new AppError(`Lab not found: ${labId}`, 404, 'NOT_FOUND'));
        }
        const lab = labSnap.data() as Record<string, unknown>;
        resolvedName = String(lab.name || resolvedName);
        resolvedEmail = lab.email ? String(lab.email) : resolvedEmail;
      }

      const now = new Date().toISOString();
      const period = String(billingPeriod || currentBillingPeriod());
      const resolvedSub = Number(subtotalInr);
      const resolvedGstPct = typeof gstPct === 'number' ? gstPct : 18;
      const gstAmount = Math.round(resolvedSub * (resolvedGstPct / 100) * 100) / 100;
      const total = Math.round((resolvedSub + gstAmount) * 100) / 100;
      const invNum = `INV-${period.replace('-', '')}-${Date.now().toString().slice(-5)}${Math.floor(10 + Math.random() * 89)}`;

      const inv: PlatformInvoiceRecord = {
        id: invNum,
        invoiceNumber: invNum,
        ...(subscriptionId ? { subscriptionId: String(subscriptionId) } : {}),
        labId: String(labId),
        labName: resolvedName,
        ...(resolvedEmail ? { labEmail: resolvedEmail } : {}),
        invoiceType: invoiceType || 'SUBSCRIPTION',
        billingPeriod: period,
        subtotalInr: resolvedSub,
        gstPct: resolvedGstPct,
        gstAmountInr: gstAmount,
        totalAmountInr: total,
        status: 'ISSUED',
        dueDate: dueDate || addDaysIso(now, 7),
        ...(razorpayOrderId ? { razorpayOrderId: String(razorpayOrderId) } : {}),
        ...(notes ? { notes: String(notes) } : {}),
        createdBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };

      await dualSet('invoices', invNum, inv);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'INVOICE_ISSUED',
        resourceType: 'INVOICE',
        resourceId: invNum,
        departmentId: 'FINANCE_BUSINESS',
        summary: `Issued ${inv.invoiceType} invoice ${invNum} to ${inv.labName} for ₹${total}`,
        ...getRequestClientMeta(req),
      });

      return res.status(201).json({ success: true, data: inv, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

financeRouter.patch(
  '/invoices/:id',
  requirePermissions('MANAGE_INVOICES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<PlatformInvoiceRecord>('invoices', req.params.id);
      if (!existing) {
        return next(new AppError(`Invoice not found: ${req.params.id}`, 404, 'NOT_FOUND'));
      }
      const { status, razorpayPaymentId, razorpayOrderId, notes } = req.body || {};
      const now = new Date().toISOString();

      if (status === 'PAID' && existing.status === 'PAID') {
        return next(new AppError('Invoice is already marked PAID.', 400, 'ALREADY_PAID'));
      }

      const nextPatch: Partial<PlatformInvoiceRecord> = {
        ...(status ? { status } : {}),
        ...(status === 'PAID' ? { paidAt: now } : {}),
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
        ...(razorpayOrderId ? { razorpayOrderId } : {}),
        ...(notes !== undefined ? { notes } : {}),
        updatedAt: now,
      };

      const updated: PlatformInvoiceRecord = { ...existing, ...nextPatch };
      await dualSet('invoices', req.params.id, updated, true);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'INVOICE_STATUS_UPDATED',
        resourceType: 'INVOICE',
        resourceId: req.params.id,
        departmentId: 'FINANCE_BUSINESS',
        severity: 'SENSITIVE',
        summary: `Updated invoice ${existing.invoiceNumber} status -> ${status || existing.status}`,
        ...getRequestClientMeta(req),
      });

      return res.json({
        success: true,
        data: updated,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

async function handleGenerateInvoices(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const startedAt = new Date().toISOString();
  const period = String(req.body?.billingPeriod || currentBillingPeriod());
  const runId = `RUN-INV-${Date.now()}`;
  try {
    const [subs, allInvoices] = await Promise.all([
      dualList<LabSubscriptionRecord>('lab_subscriptions'),
      dualList<PlatformInvoiceRecord>('invoices'),
    ]);

    const periodInvoices = allInvoices.filter(
      (i) => i.billingPeriod === period && i.status !== 'VOID'
    );
    const existingDedupKeys = new Set<string>(
      periodInvoices.map((i) => String(i.dedupKey || ''))
    );

    let generated = 0;
    let dedupSkipped = 0;
    const createdInvoices: PlatformInvoiceRecord[] = [];

    for (const sub of subs) {
      if (sub.status === 'PAUSED' || sub.status === 'EXPIRED') continue;
      const dedupKey = `SUB_${sub.id}_${period}`;
      if (existingDedupKeys.has(dedupKey)) {
        dedupSkipped += 1;
        continue;
      }

      const subtotal = Number(sub.monthlyPriceInr || 0);
      if (subtotal <= 0) continue;
      const gstAmount = Math.round(subtotal * 0.18 * 100) / 100;
      const total = Math.round((subtotal + gstAmount) * 100) / 100;
      const invNum = `INV-${period.replace('-', '')}-${sub.labId.slice(-6)}-${Math.floor(100 + Math.random() * 899)}`;
      const now = new Date().toISOString();

      const inv: PlatformInvoiceRecord = {
        id: invNum,
        invoiceNumber: invNum,
        subscriptionId: sub.id,
        labId: sub.labId,
        labName: sub.labName,
        ...(sub.labEmail ? { labEmail: sub.labEmail } : {}),
        invoiceType: 'SUBSCRIPTION',
        billingPeriod: period,
        subtotalInr: subtotal,
        gstPct: 18,
        gstAmountInr: gstAmount,
        totalAmountInr: total,
        status: 'ISSUED',
        dueDate: addDaysIso(now, 7),
        dedupKey,
        notes: `Automated ${sub.billingCycle} subscription invoice for ${sub.planName}`,
        createdBy: req.user?.email || 'FINANCE_AUTOMATION',
        createdAt: now,
        updatedAt: now,
      };

      await dualSet('invoices', invNum, inv);
      await dualSet('lab_subscriptions', sub.id, { ...sub, lastBilledAt: now, updatedAt: now }, true);

      createdInvoices.push(inv);
      existingDedupKeys.add(dedupKey);
      generated += 1;
    }

    const completedAt = new Date().toISOString();
    const runRecord: AutomationRunRecord = {
      id: runId,
      jobKey: `SUBSCRIPTION_INVOICE_GEN_${period}`,
      automationType: 'SUBSCRIPTION_INVOICE_GEN',
      departmentId: 'FINANCE_BUSINESS',
      status: 'SUCCESS',
      processedCount: generated,
      alertCount: 0,
      dedupSkippedCount: dedupSkipped,
      retryCount: 0,
      triggeredByEmail: req.user?.email || config.admin.email,
      summary: `Generated ${generated} invoice(s) for ${period}; skipped ${dedupSkipped} duplicate(s).`,
      startedAt,
      completedAt,
      createdAt: completedAt,
    };
    await recordDualAutomationRun(runRecord);
    await recordAuditLog({
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorName: req.user?.displayName,
      actorRole: req.user?.role,
      action: 'FINANCE_AUTO_INVOICE_RUN',
      resourceType: 'AUTOMATION_RUN',
      resourceId: runId,
      departmentId: 'FINANCE_BUSINESS',
      summary: runRecord.summary,
      ...getRequestClientMeta(req),
    });

    return res.json({
      success: true,
      data: { run: runRecord, createdInvoices },
      message: runRecord.summary,
      timestamp: completedAt,
    });
  } catch (err) {
    const failedAt = new Date().toISOString();
    const headEmail = await resolveFinanceHeadEmail();
    await recordDualAutomationRun({
      id: runId,
      jobKey: `SUBSCRIPTION_INVOICE_GEN_${period}`,
      automationType: 'SUBSCRIPTION_INVOICE_GEN',
      departmentId: 'FINANCE_BUSINESS',
      status: 'FAILED',
      processedCount: 0,
      alertCount: 1,
      dedupSkippedCount: 0,
      failureReason: err instanceof Error ? err.message : 'Invoice generation failed',
      retryCount: 0,
      escalatedToHead: true,
      escalatedToEmail: headEmail,
      triggeredByEmail: req.user?.email || config.admin.email,
      summary: 'Automated invoice run failed and was escalated to Finance Head.',
      startedAt,
      completedAt: failedAt,
      createdAt: failedAt,
    });
    return next(err);
  }
}

financeRouter.post(
  '/automation/generate-invoices',
  requireAnyPermission('MANAGE_INVOICES', 'MANAGE_SUBSCRIPTIONS'),
  handleGenerateInvoices
);
financeRouter.post(
  '/automation/generate-subscription-invoices',
  requireAnyPermission('MANAGE_INVOICES', 'MANAGE_SUBSCRIPTIONS'),
  handleGenerateInvoices
);

async function handleExpiryReminders(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const startedAt = new Date().toISOString();
  const runId = `RUN-EXP-${Date.now()}`;
  try {
    const [subs, invoices] = await Promise.all([
      dualList<LabSubscriptionRecord>('lab_subscriptions'),
      dualList<PlatformInvoiceRecord>('invoices'),
    ]);

    const nowMs = Date.now();
    let remindersSent = 0;
    let dedupSkipped = 0;
    let escalatedOverdue = 0;

    for (const sub of subs) {
      if (sub.status === 'PAUSED') continue;
      const renewalMs = new Date(sub.renewalDate).getTime();
      const daysLeft = Math.ceil((renewalMs - nowMs) / (1000 * 60 * 60 * 24));

      let nextStatus = sub.status;
      if (daysLeft < -7) nextStatus = 'EXPIRED';
      else if (daysLeft < 0) nextStatus = 'GRACE_PERIOD';
      else if (daysLeft <= 7) nextStatus = 'EXPIRING_SOON';
      else nextStatus = 'ACTIVE';

      if (nextStatus !== sub.status) {
        await dualSet(
          'lab_subscriptions',
          sub.id,
          { ...sub, status: nextStatus, updatedAt: new Date().toISOString() },
          true
        );
      }

      if (daysLeft <= 7 && sub.labEmail) {
        const lastSentMs = sub.lastReminderSentAt
          ? new Date(sub.lastReminderSentAt).getTime()
          : 0;
        if (nowMs - lastSentMs < 72 * 60 * 60 * 1000) {
          dedupSkipped += 1;
          continue;
        }
        await sendPlatformNotification({
          title: `LabSetu Subscription Renewal Reminder — ${sub.labName}`,
          message:
            daysLeft >= 0
              ? `Your ${sub.planName} subscription renews in ${daysLeft} day(s) on ${sub.renewalDate.slice(0, 10)}.`
              : `Your ${sub.planName} renewal is past due (${Math.abs(daysLeft)} day(s)). Please complete payment to avoid disruption.`,
          category: NotificationCategory.SYSTEM_ALERT,
          priority: daysLeft < 0 ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
          recipientEmail: sub.labEmail,
          labId: sub.labId,
          templateType: 'OPERATIONAL_NOTIFICATION',
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        });
        await dualSet(
          'lab_subscriptions',
          sub.id,
          { ...sub, status: nextStatus, lastReminderSentAt: new Date().toISOString() },
          true
        );
        remindersSent += 1;
      }
    }

    for (const inv of invoices) {
      if (inv.status === 'ISSUED' && new Date(inv.dueDate).getTime() < nowMs) {
        await dualSet(
          'invoices',
          inv.id,
          { ...inv, status: 'OVERDUE', updatedAt: new Date().toISOString() },
          true
        );
        escalatedOverdue += 1;
      }
    }

    const headEmail = await resolveFinanceHeadEmail();
    if (escalatedOverdue > 0) {
      await sendPlatformNotification({
        title: `${escalatedOverdue} Overdue Lab Invoice(s) Flagged`,
        message: `Automated billing scan marked ${escalatedOverdue} past-due invoice(s) as OVERDUE for Finance review.`,
        category: NotificationCategory.SYSTEM_ALERT,
        priority: NotificationPriority.HIGH,
        recipientEmail: headEmail,
        recipientRole: UserRole.ADMIN,
        templateType: 'OPERATIONAL_NOTIFICATION',
        channels: [NotificationChannel.IN_APP],
      });
    }

    const completedAt = new Date().toISOString();
    const runRecord: AutomationRunRecord = {
      id: runId,
      jobKey: `SUBSCRIPTION_EXPIRY_${startedAt.slice(0, 10)}`,
      automationType: 'SUBSCRIPTION_EXPIRY_REMINDER',
      departmentId: 'FINANCE_BUSINESS',
      status: 'SUCCESS',
      processedCount: remindersSent,
      alertCount: escalatedOverdue,
      dedupSkippedCount: dedupSkipped,
      retryCount: 0,
      escalatedToHead: escalatedOverdue > 0,
      escalatedToEmail: escalatedOverdue > 0 ? headEmail : undefined,
      triggeredByEmail: req.user?.email || config.admin.email,
      summary: `Sent ${remindersSent} renewal reminder(s), flagged ${escalatedOverdue} overdue invoice(s), skipped ${dedupSkipped} recent alert(s).`,
      startedAt,
      completedAt,
      createdAt: completedAt,
    };
    await recordDualAutomationRun(runRecord);

    return res.json({
      success: true,
      data: runRecord,
      message: runRecord.summary,
      timestamp: completedAt,
    });
  } catch (err) {
    return next(err);
  }
}

financeRouter.post(
  '/automation/expiry-reminders',
  requireAnyPermission('MANAGE_SUBSCRIPTIONS', 'MANAGE_INVOICES'),
  handleExpiryReminders
);
financeRouter.post(
  '/automation/run-renewal-reminders',
  requireAnyPermission('MANAGE_SUBSCRIPTIONS', 'MANAGE_INVOICES'),
  handleExpiryReminders
);

async function handleReconcile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const startedAt = new Date().toISOString();
  const runId = `RUN-REC-${Date.now()}`;
  try {
    const { db, isMockMode } = initializeFirebase();
    const [payments, invoices] = await Promise.all([
      dualList<PaymentTransactionRecord>('payment_records'),
      dualList<PlatformInvoiceRecord>('invoices'),
    ]);

    const stlByOrderId = new Map<string, string>();
    if (db && !isMockMode) {
      const stlSnap = await db.collection('settlements').get();
      stlSnap.docs.forEach((d) => {
        const s = d.data() as Record<string, unknown>;
        if (s.razorpayOrderId) stlByOrderId.set(String(s.razorpayOrderId), d.id);
      });
    }

    const invoicesByOrderId = new Map<string, PlatformInvoiceRecord>();
    invoices.forEach((inv) => {
      if (inv.razorpayOrderId) invoicesByOrderId.set(inv.razorpayOrderId, inv);
    });

    let matched = 0;
    let unmatchedAlerts = 0;

    for (const p of payments) {
      if (p.reconciliationStatus !== 'UNMATCHED' || p.gatewayStatus !== 'CAPTURED') continue;
      const matchingInv = p.razorpayOrderId
        ? invoicesByOrderId.get(p.razorpayOrderId)
        : undefined;
      const matchingStl = p.razorpayOrderId
        ? stlByOrderId.get(p.razorpayOrderId)
        : undefined;
      const now = new Date().toISOString();

      if (matchingInv) {
        await dualSet(
          'payment_records',
          p.id,
          {
            ...p,
            invoiceId: matchingInv.id,
            labId: matchingInv.labId,
            labName: matchingInv.labName,
            reconciliationStatus: 'MATCHED',
            reconciledBy: 'FINANCE_AUTOMATION',
            reconciledAt: now,
            updatedAt: now,
          },
          true
        );
        await dualSet(
          'invoices',
          matchingInv.id,
          {
            ...matchingInv,
            status: 'PAID',
            razorpayPaymentId: p.razorpayPaymentId,
            paidAt: p.paidAt || now,
            updatedAt: now,
          },
          true
        );
        matched += 1;
      } else if (matchingStl) {
        await dualSet(
          'payment_records',
          p.id,
          {
            ...p,
            reconciliationStatus: 'MATCHED',
            reconciledBy: 'FINANCE_AUTOMATION',
            reconciledAt: now,
            updatedAt: now,
          },
          true
        );
        matched += 1;
      } else {
        const alertId = `RECON-${p.razorpayPaymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const alertRec: ReconciliationAlertRecord = {
          id: alertId,
          paymentId: p.razorpayPaymentId,
          ...(p.razorpayOrderId ? { razorpayOrderId: p.razorpayOrderId } : {}),
          amountInr: p.amountInr,
          reason: `Unmatched gateway payment ${p.razorpayPaymentId} (₹${p.amountInr}) requires human verification.`,
          severity: 'WARNING',
          status: 'OPEN',
          createdAt: now,
          updatedAt: now,
        };
        await dualSet('reconciliation_alerts', alertId, alertRec, true);
        unmatchedAlerts += 1;
      }
    }

    const completedAt = new Date().toISOString();
    const runRecord: AutomationRunRecord = {
      id: runId,
      jobKey: `RECON_MATCH_${startedAt.slice(0, 13)}`,
      automationType: 'RECONCILIATION_MATCH',
      departmentId: 'FINANCE_BUSINESS',
      status: 'SUCCESS',
      processedCount: matched,
      alertCount: unmatchedAlerts,
      dedupSkippedCount: 0,
      retryCount: 0,
      triggeredByEmail: req.user?.email || config.admin.email,
      summary: `Matched ${matched} payment(s); ${unmatchedAlerts} unmatched transaction(s) queued for Finance review.`,
      startedAt,
      completedAt,
      createdAt: completedAt,
    };
    await recordDualAutomationRun(runRecord);

    return res.json({
      success: true,
      data: runRecord,
      message: runRecord.summary,
      timestamp: completedAt,
    });
  } catch (err) {
    return next(err);
  }
}

financeRouter.post('/automation/reconcile', requirePermissions('MANAGE_RECONCILIATION'), handleReconcile);
financeRouter.post('/automation/run-reconciliation', requirePermissions('MANAGE_RECONCILIATION'), handleReconcile);

financeRouter.post(
  '/automation/process-instant-payouts',
  requireAnyPermission('CONFIGURE_COMMISSIONS_PAYOUTS', 'MANAGE_RECONCILIATION', 'MANAGE_INVOICES'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startedAt = new Date().toISOString();
    const runId = `RUN-PAYOUT-30M-${Date.now()}`;
    try {
      const { db, isMockMode } = initializeFirebase();
      if (!db || isMockMode) {
        return res.json({
          success: true,
          data: {
            run: {
              id: runId,
              jobKey: `INSTANT_PAYOUT_30M_${startedAt.slice(0, 16)}`,
              automationType: 'INSTANT_PAYOUT_30M',
              departmentId: 'FINANCE_BUSINESS',
              status: 'SUCCESS',
              processedCount: 0,
              alertCount: 0,
              dedupSkippedCount: 0,
              retryCount: 0,
              triggeredByEmail: req.user?.email || config.admin.email,
              summary: 'Mock mode active: no live settlements to disburse.',
              startedAt,
              completedAt: startedAt,
              createdAt: startedAt,
            },
            releasedCount: 0,
            skippedCount: 0,
          },
          message: 'No live settlements pending in mock mode.',
          timestamp: startedAt,
        });
      }

      const stlSnap = await db.collection('settlements').limit(250).get();
      let releasedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const releasedSettlementIds: string[] = [];
      const mode =
        req.body?.mode && ['UPI', 'IMPS', 'NEFT', 'RAZORPAYX'].includes(req.body.mode)
          ? req.body.mode
          : undefined;

      for (const stlDoc of stlSnap.docs) {
        const stl = stlDoc.data() as Record<string, unknown>;
        if (stl.paymentStatus !== 'PAID' || stl.instantPayoutEligible === false) {
          continue;
        }
        const labDue = Number(stl.labPayoutInr || 0) > 0 && stl.labPayoutStatus !== 'PAID';
        const phDue =
          Number(stl.phleboPayoutInr || 0) > 0 &&
          stl.phleboPayoutStatus !== 'PAID' &&
          Boolean(stl.phlebotomistId);

        if (!labDue && !phDue) {
          skippedCount += 1;
          continue;
        }

        const recipientType: 'LARGE_LAB' | 'PHLEBOTOMIST' | 'BOTH' =
          labDue && phDue ? 'BOTH' : labDue ? 'LARGE_LAB' : 'PHLEBOTOMIST';

        try {
          await releasePayout({
            settlementId: stlDoc.id,
            recipientType,
            mode,
            notes: '30-Minute Instant Payout Window Auto-Release',
            adminEmail: req.user?.email || config.admin.email,
          });
          await stlDoc.ref.set(
            {
              instantPayoutAutoTriggered: true,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          releasedCount += 1;
          releasedSettlementIds.push(stlDoc.id);
        } catch (err) {
          console.warn(`Instant payout skip/fail for ${stlDoc.id}:`, err);
          failedCount += 1;
        }
      }

      const completedAt = new Date().toISOString();
      const summary = `30-min Instant Payout run released ${releasedCount} settlement(s); ${skippedCount} already settled; ${failedCount} alert(s).`;
      const runRecord: AutomationRunRecord = {
        id: runId,
        jobKey: `INSTANT_PAYOUT_30M_${startedAt.slice(0, 16)}`,
        automationType: 'INSTANT_PAYOUT_30M',
        departmentId: 'FINANCE_BUSINESS',
        status: failedCount > 0 ? 'PARTIAL' : 'SUCCESS',
        processedCount: releasedCount,
        alertCount: failedCount,
        dedupSkippedCount: skippedCount,
        retryCount: 0,
        triggeredByEmail: req.user?.email || config.admin.email,
        summary,
        startedAt,
        completedAt,
        createdAt: completedAt,
      };
      await recordDualAutomationRun(runRecord);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'INSTANT_30M_PAYOUTS_PROCESSED',
        resourceType: 'AUTOMATION_RUN',
        resourceId: runId,
        departmentId: 'FINANCE_BUSINESS',
        severity: 'SENSITIVE',
        summary,
        ...getRequestClientMeta(req),
      });

      return res.json({
        success: true,
        data: { run: runRecord, releasedCount, failedCount, skippedCount, releasedSettlementIds },
        message: summary,
        timestamp: completedAt,
      });
    } catch (err) {
      return next(err);
    }
  }
);

async function handleResolveReconciliation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const alertId = req.params.alertId;
    const alert = await dualGet<ReconciliationAlertRecord>('reconciliation_alerts', alertId);
    if (!alert) {
      return next(new AppError('Reconciliation alert not found.', 404, 'NOT_FOUND'));
    }
    const { status, resolutionNotes, notes, linkedInvoiceId } = req.body || {};
    const now = new Date().toISOString();
    const nextStatus = status === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED_MATCHED';

    await dualSet(
      'reconciliation_alerts',
      alertId,
      {
        ...alert,
        status: nextStatus,
        resolvedBy: req.user?.email || config.admin.email,
        resolutionNotes: resolutionNotes || notes || 'Reviewed by Finance team',
        resolvedAt: now,
        updatedAt: now,
      },
      true
    );

    const payDocId = `PAY-${alert.paymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const existingPay = await dualGet<PaymentTransactionRecord>('payment_records', payDocId);
    if (existingPay) {
      await dualSet(
        'payment_records',
        payDocId,
        {
          ...existingPay,
          reconciliationStatus: 'RESOLVED_MANUALLY',
          ...(linkedInvoiceId ? { invoiceId: String(linkedInvoiceId) } : {}),
          reconciledBy: req.user?.email || config.admin.email,
          reconciledAt: now,
          updatedAt: now,
        },
        true
      );
    }

    await recordAuditLog({
      actorUid: req.user?.uid,
      actorEmail: req.user?.email,
      actorName: req.user?.displayName,
      actorRole: req.user?.role,
      action: 'RECONCILIATION_ALERT_RESOLVED',
      resourceType: 'RECONCILIATION_ALERT',
      resourceId: alertId,
      departmentId: 'FINANCE_BUSINESS',
      severity: 'SENSITIVE',
      summary: `Resolved unmatched payment ${alert.paymentId} -> ${nextStatus}`,
      ...getRequestClientMeta(req),
    });

    return res.json({
      success: true,
      data: { id: alertId, status: nextStatus },
      timestamp: now,
    });
  } catch (err) {
    return next(err);
  }
}

financeRouter.post('/reconciliation/:alertId/resolve', requirePermissions('MANAGE_RECONCILIATION'), handleResolveReconciliation);
financeRouter.post('/reconciliation-alerts/:alertId/resolve', requirePermissions('MANAGE_RECONCILIATION'), handleResolveReconciliation);

// ===========================================================================
// EXPENSES & BUDGETS
// ===========================================================================
financeRouter.post(
  '/expenses',
  requirePermissions('MANAGE_EXPENSES_BUDGETS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, category, departmentId, vendorName, amountInr, gstInr, expenseDate, notes } =
        req.body || {};
      if (!title?.trim() || !Number.isFinite(Number(amountInr)) || Number(amountInr) <= 0) {
        return next(
          new AppError('Expense title and positive amountInr are required.', 400, 'BAD_REQUEST')
        );
      }
      const now = new Date().toISOString();
      const id = `EXP-${Date.now().toString().slice(-6)}`;
      const record: ExpenseRecord = {
        id,
        title: title.trim(),
        category: category || 'OTHER',
        departmentId: (departmentId || 'FINANCE_BUSINESS') as CoreDepartmentId,
        vendorName: vendorName?.trim() || 'General Vendor',
        amountInr: Number(amountInr),
        ...(typeof gstInr === 'number' ? { gstInr } : {}),
        expenseDate: expenseDate || now.slice(0, 10),
        approvalStatus: req.user?.isSuperAdmin ? 'APPROVED' : 'PENDING_REVIEW',
        ...(req.user?.isSuperAdmin ? { approvedBy: req.user.email } : {}),
        ...(notes ? { notes: String(notes) } : {}),
        createdBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };

      await dualSet('expenses', id, record);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'EXPENSE_RECORDED',
        resourceType: 'EXPENSE',
        resourceId: id,
        departmentId: record.departmentId,
        summary: `Logged expense "${record.title}" ₹${record.amountInr} (${record.approvalStatus})`,
        ...getRequestClientMeta(req),
      });

      return res.status(201).json({ success: true, data: record, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

financeRouter.patch(
  '/expenses/:id',
  requirePermissions('MANAGE_EXPENSES_BUDGETS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await dualGet<ExpenseRecord>('expenses', req.params.id);
      if (!existing) {
        return next(new AppError('Expense record not found.', 404, 'NOT_FOUND'));
      }
      const { approvalStatus, notes } = req.body || {};
      const now = new Date().toISOString();
      const updated: ExpenseRecord = {
        ...existing,
        ...(approvalStatus ? { approvalStatus } : {}),
        ...(approvalStatus === 'APPROVED' || approvalStatus === 'REJECTED'
          ? { approvedBy: req.user?.email || config.admin.email }
          : {}),
        ...(notes !== undefined ? { notes } : {}),
        updatedAt: now,
      };
      await dualSet('expenses', req.params.id, updated, true);
      return res.json({ success: true, data: updated, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

financeRouter.post(
  '/budgets',
  requirePermissions('MANAGE_EXPENSES_BUDGETS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { fiscalMonth, departmentId, allocatedBudgetInr, projectedRevenueInr, notes } =
        req.body || {};
      if (!fiscalMonth || !departmentId || !Number.isFinite(Number(allocatedBudgetInr))) {
        return next(
          new AppError('fiscalMonth, departmentId, and allocatedBudgetInr are required.', 400, 'BAD_REQUEST')
        );
      }
      const dept = await dualGet<{ name?: string }>('departments', String(departmentId));
      const deptName = dept?.name || String(departmentId);
      const id = `BGT-${fiscalMonth}-${departmentId}`;
      const existing = await dualGet<FinancialBudgetRecord>('financial_budgets', id);
      const now = new Date().toISOString();
      const budget: FinancialBudgetRecord = {
        id,
        fiscalMonth: String(fiscalMonth),
        departmentId: departmentId as CoreDepartmentId,
        departmentName: deptName,
        allocatedBudgetInr: Number(allocatedBudgetInr),
        ...(typeof projectedRevenueInr === 'number' ? { projectedRevenueInr } : {}),
        ...(notes ? { notes: String(notes) } : {}),
        updatedBy: req.user?.email || config.admin.email,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await dualSet('financial_budgets', id, budget, true);
      return res.status(201).json({ success: true, data: budget, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

// ===========================================================================
// HUMAN-REVIEWED REFUND REQUEST WORKFLOW
// ===========================================================================
financeRouter.post(
  '/refunds',
  requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'MANAGE_INVOICES', 'APPROVE_REFUNDS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { paymentId, invoiceId, bookingId, labId, labName, requestedAmountInr, amountInr, reason } =
        req.body || {};
      const resolvedAmt = Number(requestedAmountInr ?? amountInr);
      if (!paymentId?.trim() || !Number.isFinite(resolvedAmt) || resolvedAmt <= 0 || !reason?.trim()) {
        return next(
          new AppError(
            'paymentId, positive requestedAmountInr, and reason are required.',
            400,
            'BAD_REQUEST'
          )
        );
      }
      const now = new Date().toISOString();
      const id = `RFD-${Date.now().toString().slice(-6)}`;
      const record: RefundRequestRecord = {
        id,
        paymentId: String(paymentId).trim(),
        ...(invoiceId ? { invoiceId: String(invoiceId) } : {}),
        ...(bookingId ? { bookingId: String(bookingId) } : {}),
        labId: labId ? String(labId) : 'LAB-PARTNER',
        labName: labName ? String(labName) : 'Partner Lab',
        requestedAmountInr: resolvedAmt,
        reason: reason.trim(),
        status: 'PENDING_HUMAN_APPROVAL',
        requestedBy: req.user?.email || config.admin.email,
        createdAt: now,
        updatedAt: now,
      };

      await dualSet('refund_requests', id, record);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: 'REFUND_REQUEST_SUBMITTED',
        resourceType: 'REFUND_REQUEST',
        resourceId: id,
        departmentId: 'FINANCE_BUSINESS',
        severity: 'SENSITIVE',
        summary: `Submitted refund request ${id} for ₹${record.requestedAmountInr} (awaiting human approval)`,
        ...getRequestClientMeta(req),
      });

      return res.status(201).json({ success: true, data: record, timestamp: now });
    } catch (err) {
      return next(err);
    }
  }
);

financeRouter.post(
  '/refunds/:id/decision',
  requirePermissions('APPROVE_REFUNDS'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rawDecision = req.body?.decision;
      const decision =
        rawDecision === 'APPROVE' || rawDecision === 'APPROVED'
          ? 'APPROVE'
          : rawDecision === 'REJECT' || rawDecision === 'REJECTED'
            ? 'REJECT'
            : null;
      if (!decision) {
        return next(new AppError('decision must be APPROVE or REJECT.', 400, 'BAD_REQUEST'));
      }

      const refund = await dualGet<RefundRequestRecord>('refund_requests', req.params.id);
      if (!refund) {
        return next(new AppError(`Refund request not found: ${req.params.id}`, 404, 'NOT_FOUND'));
      }
      if (refund.status !== 'PENDING_HUMAN_APPROVAL') {
        return next(
          new AppError(`Refund request is already ${refund.status}.`, 400, 'ALREADY_REVIEWED')
        );
      }

      const { reviewNotes, executeGatewayRefund } = req.body || {};
      const now = new Date().toISOString();
      let nextStatus: RefundRequestRecord['status'] =
        decision === 'REJECT' ? 'REJECTED' : 'APPROVED_PENDING_GATEWAY';
      let gatewayRefundId: string | undefined;

      if (decision === 'APPROVE' && executeGatewayRefund && refund.paymentId.startsWith('pay_')) {
        const gw = await issueGatewayRefund({
          paymentId: refund.paymentId,
          amountInr: refund.requestedAmountInr,
          notes: { refundRequestId: refund.id, approvedBy: req.user?.email || config.admin.email },
        });
        gatewayRefundId = gw.refundId;
        nextStatus = 'PROCESSED';
      } else if (decision === 'APPROVE' && !executeGatewayRefund) {
        nextStatus = 'APPROVED_PENDING_GATEWAY';
      }

      const updated: RefundRequestRecord = {
        ...refund,
        status: nextStatus,
        reviewedBy: req.user?.email || config.admin.email,
        reviewNotes: reviewNotes || `${decision}ED by human reviewer`,
        ...(gatewayRefundId ? { gatewayRefundId } : {}),
        reviewedAt: now,
        updatedAt: now,
      };

      await dualSet('refund_requests', req.params.id, updated, true);
      await recordAuditLog({
        actorUid: req.user?.uid,
        actorEmail: req.user?.email,
        actorName: req.user?.displayName,
        actorRole: req.user?.role,
        action: `REFUND_${decision}D`,
        resourceType: 'REFUND_REQUEST',
        resourceId: refund.id,
        departmentId: 'FINANCE_BUSINESS',
        severity: 'CRITICAL',
        summary: `Human reviewer ${req.user?.email} ${decision}D refund ${refund.id} (₹${refund.requestedAmountInr}) -> ${nextStatus}`,
        ...getRequestClientMeta(req),
      });

      return res.json({
        success: true,
        data: updated,
        message: `Refund request ${refund.id} -> ${nextStatus}`,
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ===========================================================================
// MONTHLY, YEARLY, OUTSTANDING & CA-REVIEW TAX / ACCOUNTING REPORTS
// ===========================================================================
async function handleFinancialReportSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const yearParam = String(req.query.year || new Date().getFullYear());
    const { db, isMockMode } = initializeFirebase();
    const [invoices, expenses, payments] = await Promise.all([
      dualList<PlatformInvoiceRecord>('invoices'),
      dualList<ExpenseRecord>('expenses'),
      dualList<PaymentTransactionRecord>('payment_records'),
    ]);

    let orders: Array<Record<string, unknown>> = [];
    if (db && !isMockMode) {
      const ordersSnap = await db.collection('orders').get();
      orders = ordersSnap.docs.map((d) => d.data() as Record<string, unknown>);
    }

    const monthlyBuckets: Record<
      string,
      {
        month: string;
        billedRevenueInr: number;
        collectedRevenueInr: number;
        gstCollectedInr: number;
        approvedExpensesInr: number;
        inputGstInr: number;
      }
    > = {};

    for (const inv of invoices) {
      const m = inv.billingPeriod || inv.createdAt.slice(0, 7);
      if (!m.startsWith(yearParam)) continue;
      if (!monthlyBuckets[m]) {
        monthlyBuckets[m] = {
          month: m,
          billedRevenueInr: 0,
          collectedRevenueInr: 0,
          gstCollectedInr: 0,
          approvedExpensesInr: 0,
          inputGstInr: 0,
        };
      }
      if (inv.status !== 'VOID') {
        monthlyBuckets[m].billedRevenueInr += Number(inv.totalAmountInr || 0);
      }
      if (inv.status === 'PAID') {
        monthlyBuckets[m].collectedRevenueInr += Number(inv.totalAmountInr || 0);
        monthlyBuckets[m].gstCollectedInr += Number(inv.gstAmountInr || 0);
      }
    }

    for (const exp of expenses) {
      const m = (exp.expenseDate || exp.createdAt).slice(0, 7);
      if (!m.startsWith(yearParam) || exp.approvalStatus !== 'APPROVED') continue;
      if (!monthlyBuckets[m]) {
        monthlyBuckets[m] = {
          month: m,
          billedRevenueInr: 0,
          collectedRevenueInr: 0,
          gstCollectedInr: 0,
          approvedExpensesInr: 0,
          inputGstInr: 0,
        };
      }
      monthlyBuckets[m].approvedExpensesInr += Number(exp.amountInr || 0);
      monthlyBuckets[m].inputGstInr += Number(exp.gstInr || 0);
    }

    const nowMs = Date.now();
    const outstandingInvoices = invoices
      .filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE')
      .map((i) => ({
        ...i,
        overdueDays: Math.max(
          0,
          Math.floor((nowMs - new Date(i.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        ),
      }));

    const monthlySeries = Object.values(monthlyBuckets).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
    const totals = monthlySeries.reduce(
      (acc, row) => ({
        billedRevenueInr: acc.billedRevenueInr + row.billedRevenueInr,
        collectedRevenueInr: acc.collectedRevenueInr + row.collectedRevenueInr,
        gstCollectedInr: acc.gstCollectedInr + row.gstCollectedInr,
        approvedExpensesInr: acc.approvedExpensesInr + row.approvedExpensesInr,
        inputGstInr: acc.inputGstInr + row.inputGstInr,
      }),
      {
        billedRevenueInr: 0,
        collectedRevenueInr: 0,
        gstCollectedInr: 0,
        approvedExpensesInr: 0,
        inputGstInr: 0,
      }
    );

    const bookingPlatformFeesInr = orders.reduce(
      (s, o) => s + Number(o.platformFeeInr || 0),
      0
    );

    return res.json({
      success: true,
      data: {
        fiscalYear: yearParam,
        caReviewNotice:
          'Prepared as structured financial, GST, and ledger working schedules for Chartered Accountant (CA) review and statutory filing verification. Does not represent automated tax filing.',
        monthlySeries,
        annualTotals: {
          ...totals,
          bookingPlatformFeesInr,
          netOperatingSurplusInr:
            Math.round(
              (totals.collectedRevenueInr + bookingPlatformFeesInr - totals.approvedExpensesInr) *
              100
            ) / 100,
          estimatedNetGstPayableForCaReviewInr:
            Math.round((totals.gstCollectedInr - totals.inputGstInr) * 100) / 100,
        },
        outstandingInvoices,
        capturedPaymentsCount: payments.filter((p) => p.gatewayStatus === 'CAPTURED').length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

financeRouter.get('/reports/summary', requirePermissions('VIEW_FINANCIAL_REPORTS'), handleFinancialReportSummary);
financeRouter.get('/reports/ca-summary', requirePermissions('VIEW_FINANCIAL_REPORTS'), handleFinancialReportSummary);

financeRouter.post(
  '/cash-platform-fees/audit',
  requireAnyPermission('VIEW_FINANCIAL_REPORTS', 'CONFIGURE_COMMISSIONS_PAYOUTS'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const report = await runCashPlatformFeeAudit();
      return res.json({ success: true, report });
    } catch (err) {
      return next(err);
    }
  }
);
