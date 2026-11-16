import { NextFunction, Response, Router } from 'express';
import {
  type AutomationRunRecord,
  type CoreDepartmentId,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserRole,
} from './types';
import {
  type BillingModelConfig,
  type ExpenseRecord,
  type FinancialBudgetRecord,
  type LabSubscriptionRecord,
  type PaymentTransactionRecord,
  type PlatformInvoiceRecord,
  type ReconciliationAlertRecord,
  type RefundRequestRecord,
  type SubscriptionPlanRecord,
} from './modulesTypes';
import { DEFAULT_COMMISSION_CONFIG } from './orgConstants';
import { ADMIN_EMAIL, AppError, db } from './firebaseAdmin';
import { ensureOrganisationBootstrapped } from './directory';
import { sendPlatformNotification } from './mailer';
import { issueGatewayRefund, releaseSettlementPayout } from './razorpay';
import {
  type AuthenticatedRequest,
  getRequestClientMeta,
  recordAuditLog,
  requireAnyPermission,
  requireAuth,
  requirePermissions,
} from './rbac';

async function getBillingConfigDoc(): Promise<BillingModelConfig> {
  const snap = await db.collection('settings').doc('commission').get();
  if (snap.exists) {
    return {
      ...DEFAULT_COMMISSION_CONFIG,
      ...(snap.data() as Partial<BillingModelConfig>),
    };
  }
  return { ...DEFAULT_COMMISSION_CONFIG };
}

function currentBillingPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function addDaysIso(isoOrDate: Date | string, days: number): string {
  const dt = typeof isoOrDate === 'string' ? new Date(isoOrDate) : new Date(isoOrDate.getTime());
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

async function resolveFinanceHeadEmail(): Promise<string> {
  const deptSnap = await db.collection('departments').doc('FINANCE_BUSINESS').get();
  const email = deptSnap.exists ? (deptSnap.data()?.headEmail as string | undefined) : undefined;
  return (email || ADMIN_EMAIL).trim().toLowerCase();
}

async function saveAutomationRun(run: AutomationRunRecord): Promise<void> {
  await db.collection('automation_runs').doc(run.id).set(run);
}

export function createFinanceRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // ===========================================================================
  // BILLING MODE, COMMISSION & PAYOUT CONFIGURATION
  // ===========================================================================
  router.get(
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
        updatedBy: req.user?.email || ADMIN_EMAIL,
        updatedAt: now,
      };

      await db.collection('settings').doc('commission').set(patch, { merge: true });
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

      const fresh = await getBillingConfigDoc();
      return res.json({
        success: true,
        data: fresh,
        message: 'Finance & billing configuration saved.',
        timestamp: now,
      });
    } catch (err) {
      return next(err);
    }
  }

  router.patch('/config', requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'), handleUpdateConfig);
  router.put('/config', requirePermissions('CONFIGURE_COMMISSIONS_PAYOUTS'), handleUpdateConfig);

  // ===========================================================================
  // OVERVIEW WORKSPACE (ALL FINANCE COLLECTIONS)
  // ===========================================================================
  router.get(
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
        const [
          configDoc,
          plansSnap,
          subsSnap,
          invSnap,
          paySnap,
          alertsSnap,
          expSnap,
          budgetSnap,
          refundSnap,
          runsSnap,
          stlSnap,
          ordersSnap,
        ] = await Promise.all([
          getBillingConfigDoc(),
          db.collection('subscription_plans').get(),
          db.collection('lab_subscriptions').get(),
          db.collection('invoices').limit(200).get(),
          db.collection('payment_records').limit(200).get(),
          db.collection('reconciliation_alerts').limit(100).get(),
          db.collection('expenses').limit(200).get(),
          db.collection('financial_budgets').limit(100).get(),
          db.collection('refund_requests').limit(100).get(),
          db
            .collection('automation_runs')
            .where('departmentId', '==', 'FINANCE_BUSINESS')
            .limit(40)
            .get(),
          db.collection('settlements').limit(200).get(),
          db.collection('orders').limit(200).get(),
        ]);

        const sortDesc = <T extends { createdAt?: string }>(arr: T[]) =>
          arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        const invoices = sortDesc(invSnap.docs.map((d) => d.data() as PlatformInvoiceRecord));
        const payments = sortDesc(paySnap.docs.map((d) => d.data() as PaymentTransactionRecord));
        const expenses = sortDesc(expSnap.docs.map((d) => d.data() as ExpenseRecord));
        const alerts = sortDesc(alertsSnap.docs.map((d) => d.data() as ReconciliationAlertRecord));
        const refunds = sortDesc(refundSnap.docs.map((d) => d.data() as RefundRequestRecord));
        const subscriptions = sortDesc(subsSnap.docs.map((d) => d.data() as LabSubscriptionRecord));
        const plans = plansSnap.docs.map((d) => d.data() as SubscriptionPlanRecord);
        const budgets = budgetSnap.docs.map((d) => d.data() as FinancialBudgetRecord);
        const automationRuns = sortDesc(runsSnap.docs.map((d) => d.data() as AutomationRunRecord));
        const settlements = stlSnap.docs.map((d) => d.data() as Record<string, unknown>);
        const orders = ordersSnap.docs.map((d) => d.data() as Record<string, unknown>);

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
            subscriptions,
            invoices,
            payments: req.user?.isSuperAdmin || req.user?.permissions.includes('VIEW_PAYMENT_RECORDS')
              ? payments
              : [],
            reconciliationAlerts: alerts,
            expenses,
            budgets,
            refunds,
            automationRuns,
            instantPayoutStats,
            kpis: {
              paidInvoicesRevenueInr: Math.round(paidInvoicesRevenue * 100) / 100,
              bookingPlatformFeesInr: Math.round(bookingPlatformFees * 100) / 100,
              totalRecognizedRevenueInr:
                Math.round((paidInvoicesRevenue + bookingPlatformFees) * 100) / 100,
              outstandingAmountInr: Math.round(outstandingAmountInr * 100) / 100,
              approvedExpensesInr: Math.round(approvedExpensesInr * 100) / 100,
              netOperatingPositionInr:
                Math.round((paidInvoicesRevenue + bookingPlatformFees - approvedExpensesInr) * 100) / 100,
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
  router.post(
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

        if (!name?.trim() || typeof priceInr !== 'number') {
          return next(new AppError('Plan name and priceInr are required.', 400, 'BAD_REQUEST'));
        }
        const now = new Date().toISOString();
        const id = `PLAN-${String(code || name)
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .slice(0, 24)}`;

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
          features: Array.isArray(features) ? features : [],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('subscription_plans').doc(id).set(plan, { merge: true });
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
        return res.status(201).json({ success: true, data: plan, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/subscriptions',
    requirePermissions('MANAGE_SUBSCRIPTIONS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { labId, planId, startDate, autoRenew } = req.body || {};
        if (!labId || !planId) {
          return next(new AppError('labId and planId are required.', 400, 'BAD_REQUEST'));
        }

        const [labSnap, planSnap] = await Promise.all([
          db.collection('labs').doc(labId).get(),
          db.collection('subscription_plans').doc(planId).get(),
        ]);
        if (!labSnap.exists) {
          return next(new AppError(`Lab not found: ${labId}`, 404, 'NOT_FOUND'));
        }
        if (!planSnap.exists) {
          return next(new AppError(`Subscription plan not found: ${planId}`, 404, 'NOT_FOUND'));
        }

        const lab = labSnap.data() as Record<string, unknown>;
        const plan = planSnap.data() as SubscriptionPlanRecord;
        const now = new Date().toISOString();
        const startIso = startDate ? new Date(startDate).toISOString() : now;
        const cycleDays =
          plan.billingCycle === 'YEARLY' ? 365 : plan.billingCycle === 'QUARTERLY' ? 90 : 30;
        const renewalIso = addDaysIso(startIso, cycleDays);
        const subId = `SUB-${labId}`;

        const sub: LabSubscriptionRecord = {
          id: subId,
          labId,
          labName: String(lab.name || labId),
          labEmail: lab.email ? String(lab.email) : undefined,
          labTier: (lab.type === 'LARGE_LAB' ? 'LARGE_LAB' : 'SMALL_LAB'),
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

        await db.collection('lab_subscriptions').doc(subId).set(sub, { merge: true });
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
  router.post(
    '/invoices',
    requirePermissions('MANAGE_INVOICES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const {
          labId,
          invoiceType,
          billingPeriod,
          subtotalInr,
          gstPct,
          dueDate,
          notes,
          subscriptionId,
        } = req.body || {};

        if (!labId || typeof subtotalInr !== 'number' || subtotalInr <= 0) {
          return next(
            new AppError('labId and positive subtotalInr are required.', 400, 'BAD_REQUEST')
          );
        }

        const labSnap = await db.collection('labs').doc(labId).get();
        if (!labSnap.exists) {
          return next(new AppError(`Lab not found: ${labId}`, 404, 'NOT_FOUND'));
        }
        const lab = labSnap.data() as Record<string, unknown>;
        const now = new Date().toISOString();
        const period = billingPeriod || currentBillingPeriod();
        const resolvedGstPct = typeof gstPct === 'number' ? gstPct : 18;
        const gstAmount = Math.round(subtotalInr * (resolvedGstPct / 100) * 100) / 100;
        const total = Math.round((subtotalInr + gstAmount) * 100) / 100;
        const invNum = `INV-${period.replace('-', '')}-${Date.now().toString().slice(-5)}`;

        const inv: PlatformInvoiceRecord = {
          id: invNum,
          invoiceNumber: invNum,
          ...(subscriptionId ? { subscriptionId } : {}),
          labId,
          labName: String(lab.name || labId),
          ...(lab.email ? { labEmail: String(lab.email) } : {}),
          invoiceType: invoiceType || 'SUBSCRIPTION',
          billingPeriod: period,
          subtotalInr,
          gstPct: resolvedGstPct,
          gstAmountInr: gstAmount,
          totalAmountInr: total,
          status: 'ISSUED',
          dueDate: dueDate || addDaysIso(now, 7),
          ...(notes ? { notes } : {}),
          createdBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('invoices').doc(invNum).set(inv);
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

  router.patch(
    '/invoices/:id',
    requirePermissions('MANAGE_INVOICES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('invoices').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Invoice not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const existing = snap.data() as PlatformInvoiceRecord;
        const { status, razorpayPaymentId, notes } = req.body || {};
        const now = new Date().toISOString();

        // Duplicate payment protection on manual mark-paid
        if (status === 'PAID' && existing.status === 'PAID') {
          return next(new AppError('Invoice is already marked PAID.', 400, 'ALREADY_PAID'));
        }

        const nextPatch: Partial<PlatformInvoiceRecord> = {
          ...(status ? { status } : {}),
          ...(status === 'PAID' ? { paidAt: now } : {}),
          ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
          ...(notes !== undefined ? { notes } : {}),
          updatedAt: now,
        };

        await ref.set(nextPatch, { merge: true });
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
          data: { ...existing, ...nextPatch },
          timestamp: now,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Automated job 1: Subscription Invoice Generation (deduplicated per billingPeriod)
  router.post(
    '/automation/generate-invoices',
    requireAnyPermission('MANAGE_INVOICES', 'MANAGE_SUBSCRIPTIONS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startedAt = new Date().toISOString();
      const period = String(req.body?.billingPeriod || currentBillingPeriod());
      const runId = `RUN-INV-${Date.now()}`;
      try {
        const [subsSnap, invSnap] = await Promise.all([
          db.collection('lab_subscriptions').get(),
          db.collection('invoices').where('billingPeriod', '==', period).get(),
        ]);

        const existingDedupKeys = new Set<string>(
          invSnap.docs.map((d) => String(d.data()?.dedupKey || ''))
        );

        let generated = 0;
        let dedupSkipped = 0;
        const createdInvoices: PlatformInvoiceRecord[] = [];

        for (const doc of subsSnap.docs) {
          const sub = doc.data() as LabSubscriptionRecord;
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

          await db.collection('invoices').doc(invNum).set(inv);
          await db
            .collection('lab_subscriptions')
            .doc(sub.id)
            .set({ lastBilledAt: now, updatedAt: now }, { merge: true });

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
          triggeredByEmail: req.user?.email || ADMIN_EMAIL,
          summary: `Generated ${generated} invoice(s) for ${period}; skipped ${dedupSkipped} duplicate(s).`,
          startedAt,
          completedAt,
          createdAt: completedAt,
        };
        await saveAutomationRun(runRecord);
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
        await saveAutomationRun({
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
          triggeredByEmail: req.user?.email || ADMIN_EMAIL,
          summary: 'Automated invoice run failed and was escalated to Finance Head.',
          startedAt,
          completedAt: failedAt,
          createdAt: failedAt,
        });
        return next(err);
      }
    }
  );

  // Automated job 2: Subscription Expiry & Renewal Reminders + Overdue Invoice Escalation
  router.post(
    '/automation/expiry-reminders',
    requireAnyPermission('MANAGE_SUBSCRIPTIONS', 'MANAGE_INVOICES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startedAt = new Date().toISOString();
      const runId = `RUN-EXP-${Date.now()}`;
      try {
        const [subsSnap, invSnap] = await Promise.all([
          db.collection('lab_subscriptions').get(),
          db.collection('invoices').get(),
        ]);

        const nowMs = Date.now();
        let remindersSent = 0;
        let dedupSkipped = 0;
        let escalatedOverdue = 0;

        for (const doc of subsSnap.docs) {
          const sub = doc.data() as LabSubscriptionRecord;
          if (sub.status === 'PAUSED') continue;
          const renewalMs = new Date(sub.renewalDate).getTime();
          const daysLeft = Math.ceil((renewalMs - nowMs) / (1000 * 60 * 60 * 24));

          let nextStatus = sub.status;
          if (daysLeft < -7) nextStatus = 'EXPIRED';
          else if (daysLeft < 0) nextStatus = 'GRACE_PERIOD';
          else if (daysLeft <= 7) nextStatus = 'EXPIRING_SOON';
          else nextStatus = 'ACTIVE';

          if (nextStatus !== sub.status) {
            await doc.ref.set(
              { status: nextStatus, updatedAt: new Date().toISOString() },
              { merge: true }
            );
          }

          if (daysLeft <= 7 && sub.labEmail) {
            const lastSentMs = sub.lastReminderSentAt
              ? new Date(sub.lastReminderSentAt).getTime()
              : 0;
            // Deduplicate: do not spam more than once per 72 hours
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
            await doc.ref.set(
              { lastReminderSentAt: new Date().toISOString() },
              { merge: true }
            );
            remindersSent += 1;
          }
        }

        // Flag overdue invoices
        for (const doc of invSnap.docs) {
          const inv = doc.data() as PlatformInvoiceRecord;
          if (inv.status === 'ISSUED' && new Date(inv.dueDate).getTime() < nowMs) {
            await doc.ref.set(
              { status: 'OVERDUE', updatedAt: new Date().toISOString() },
              { merge: true }
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
          triggeredByEmail: req.user?.email || ADMIN_EMAIL,
          summary: `Sent ${remindersSent} renewal reminder(s), flagged ${escalatedOverdue} overdue invoice(s), skipped ${dedupSkipped} recent alert(s).`,
          startedAt,
          completedAt,
          createdAt: completedAt,
        };
        await saveAutomationRun(runRecord);

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
  );

  // Automated job 3: Reconciliation Matcher & Unmatched Alert Scanner
  router.post(
    '/automation/reconcile',
    requirePermissions('MANAGE_RECONCILIATION'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startedAt = new Date().toISOString();
      const runId = `RUN-REC-${Date.now()}`;
      try {
        const [paySnap, invSnap, stlSnap] = await Promise.all([
          db.collection('payment_records').get(),
          db.collection('invoices').get(),
          db.collection('settlements').get(),
        ]);

        const invoicesByOrderId = new Map<string, PlatformInvoiceRecord>();
        invSnap.docs.forEach((d) => {
          const inv = d.data() as PlatformInvoiceRecord;
          if (inv.razorpayOrderId) invoicesByOrderId.set(inv.razorpayOrderId, inv);
        });
        const stlByOrderId = new Map<string, string>();
        stlSnap.docs.forEach((d) => {
          const s = d.data() as Record<string, unknown>;
          if (s.razorpayOrderId) stlByOrderId.set(String(s.razorpayOrderId), d.id);
        });

        let matched = 0;
        let unmatchedAlerts = 0;

        for (const doc of paySnap.docs) {
          const p = doc.data() as PaymentTransactionRecord;
          if (p.reconciliationStatus !== 'UNMATCHED' || p.gatewayStatus !== 'CAPTURED') continue;
          const matchingInv = p.razorpayOrderId
            ? invoicesByOrderId.get(p.razorpayOrderId)
            : undefined;
          const matchingStl = p.razorpayOrderId
            ? stlByOrderId.get(p.razorpayOrderId)
            : undefined;

          if (matchingInv) {
            await doc.ref.set(
              {
                invoiceId: matchingInv.id,
                labId: matchingInv.labId,
                labName: matchingInv.labName,
                reconciliationStatus: 'MATCHED',
                reconciledBy: 'FINANCE_AUTOMATION',
                reconciledAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
            await db.collection('invoices').doc(matchingInv.id).set(
              {
                status: 'PAID',
                razorpayPaymentId: p.razorpayPaymentId,
                paidAt: p.paidAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
            matched += 1;
          } else if (matchingStl) {
            await doc.ref.set(
              {
                reconciliationStatus: 'MATCHED',
                reconciledBy: 'FINANCE_AUTOMATION',
                reconciledAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
            matched += 1;
          } else {
            const alertId = `RECON-${p.razorpayPaymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
            await db
              .collection('reconciliation_alerts')
              .doc(alertId)
              .set(
                {
                  id: alertId,
                  paymentId: p.razorpayPaymentId,
                  ...(p.razorpayOrderId ? { razorpayOrderId: p.razorpayOrderId } : {}),
                  amountInr: p.amountInr,
                  reason: `Unmatched gateway payment ${p.razorpayPaymentId} (₹${p.amountInr}) requires human verification.`,
                  severity: 'WARNING',
                  status: 'OPEN',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
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
          triggeredByEmail: req.user?.email || ADMIN_EMAIL,
          summary: `Matched ${matched} payment(s); ${unmatchedAlerts} unmatched transaction(s) queued for Finance review.`,
          startedAt,
          completedAt,
          createdAt: completedAt,
        };
        await saveAutomationRun(runRecord);

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
  );

  // Automated job 4: 30-Minute Instant Payout Disbursement Processor
  router.post(
    '/automation/process-instant-payouts',
    requireAnyPermission('CONFIGURE_COMMISSIONS_PAYOUTS', 'MANAGE_RECONCILIATION', 'MANAGE_INVOICES'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startedAt = new Date().toISOString();
      const runId = `RUN-PAYOUT-30M-${Date.now()}`;
      try {
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
            await releaseSettlementPayout({
              settlementId: stlDoc.id,
              recipientType,
              mode,
              notes: '30-Minute Instant Payout Window Auto-Release',
              adminEmail: req.user?.email || ADMIN_EMAIL,
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
          triggeredByEmail: req.user?.email || ADMIN_EMAIL,
          summary,
          startedAt,
          completedAt,
          createdAt: completedAt,
        };
        await saveAutomationRun(runRecord);
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

  // Resolve reconciliation alert (human decision)
  router.post(
    '/reconciliation/:alertId/resolve',
    requirePermissions('MANAGE_RECONCILIATION'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('reconciliation_alerts').doc(req.params.alertId);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Reconciliation alert not found.', 404, 'NOT_FOUND'));
        }
        const { status, resolutionNotes, linkedInvoiceId } = req.body || {};
        const now = new Date().toISOString();
        const nextStatus = status === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED_MATCHED';

        await ref.set(
          {
            status: nextStatus,
            resolvedBy: req.user?.email || ADMIN_EMAIL,
            resolutionNotes: resolutionNotes || 'Reviewed by Finance team',
            resolvedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        const alert = snap.data() as ReconciliationAlertRecord;
        const payDocId = `PAY-${alert.paymentId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        await db.collection('payment_records').doc(payDocId).set(
          {
            reconciliationStatus: 'RESOLVED_MANUALLY',
            ...(linkedInvoiceId ? { invoiceId: linkedInvoiceId } : {}),
            reconciledBy: req.user?.email || ADMIN_EMAIL,
            reconciledAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        await recordAuditLog({
          actorUid: req.user?.uid,
          actorEmail: req.user?.email,
          actorName: req.user?.displayName,
          actorRole: req.user?.role,
          action: 'RECONCILIATION_ALERT_RESOLVED',
          resourceType: 'RECONCILIATION_ALERT',
          resourceId: req.params.alertId,
          departmentId: 'FINANCE_BUSINESS',
          severity: 'SENSITIVE',
          summary: `Resolved unmatched payment ${alert.paymentId} -> ${nextStatus}`,
          ...getRequestClientMeta(req),
        });

        return res.json({ success: true, data: { id: req.params.alertId, status: nextStatus }, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // EXPENSES & BUDGETS
  // ===========================================================================
  router.post(
    '/expenses',
    requirePermissions('MANAGE_EXPENSES_BUDGETS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { title, category, departmentId, vendorName, amountInr, gstInr, expenseDate, notes } =
          req.body || {};
        if (!title?.trim() || typeof amountInr !== 'number' || amountInr <= 0) {
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
          ...(notes ? { notes } : {}),
          createdBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('expenses').doc(id).set(record);
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

  router.patch(
    '/expenses/:id',
    requirePermissions('MANAGE_EXPENSES_BUDGETS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ref = db.collection('expenses').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError('Expense record not found.', 404, 'NOT_FOUND'));
        }
        const { approvalStatus, notes } = req.body || {};
        const now = new Date().toISOString();
        await ref.set(
          {
            ...(approvalStatus ? { approvalStatus } : {}),
            ...(approvalStatus === 'APPROVED' || approvalStatus === 'REJECTED'
              ? { approvedBy: req.user?.email || ADMIN_EMAIL }
              : {}),
            ...(notes !== undefined ? { notes } : {}),
            updatedAt: now,
          },
          { merge: true }
        );
        const updated = (await ref.get()).data();
        return res.json({ success: true, data: updated, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/budgets',
    requirePermissions('MANAGE_EXPENSES_BUDGETS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { fiscalMonth, departmentId, allocatedBudgetInr, projectedRevenueInr, notes } =
          req.body || {};
        if (!fiscalMonth || !departmentId || typeof allocatedBudgetInr !== 'number') {
          return next(
            new AppError('fiscalMonth, departmentId, and allocatedBudgetInr are required.', 400, 'BAD_REQUEST')
          );
        }
        const deptSnap = await db.collection('departments').doc(departmentId).get();
        const deptName = deptSnap.exists ? String(deptSnap.data()?.name || departmentId) : departmentId;
        const id = `BGT-${fiscalMonth}-${departmentId}`;
        const now = new Date().toISOString();
        const budget: FinancialBudgetRecord = {
          id,
          fiscalMonth,
          departmentId,
          departmentName: deptName,
          allocatedBudgetInr: Number(allocatedBudgetInr),
          ...(typeof projectedRevenueInr === 'number' ? { projectedRevenueInr } : {}),
          ...(notes ? { notes } : {}),
          updatedBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };
        await db.collection('financial_budgets').doc(id).set(budget, { merge: true });
        return res.status(201).json({ success: true, data: budget, timestamp: now });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ===========================================================================
  // HUMAN-REVIEWED REFUND REQUEST WORKFLOW
  // ===========================================================================
  router.post(
    '/refunds',
    requireAnyPermission('VIEW_FINANCE_DASHBOARD', 'MANAGE_INVOICES', 'APPROVE_REFUNDS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { paymentId, invoiceId, bookingId, labId, labName, requestedAmountInr, reason } =
          req.body || {};
        if (!paymentId || typeof requestedAmountInr !== 'number' || requestedAmountInr <= 0 || !reason?.trim()) {
          return next(
            new AppError('paymentId, positive requestedAmountInr, and reason are required.', 400, 'BAD_REQUEST')
          );
        }
        const now = new Date().toISOString();
        const id = `RFD-${Date.now().toString().slice(-6)}`;
        // Always enters human-review queue first!
        const record: RefundRequestRecord = {
          id,
          paymentId: paymentId.trim(),
          ...(invoiceId ? { invoiceId } : {}),
          ...(bookingId ? { bookingId } : {}),
          labId: labId || 'LAB-PARTNER',
          labName: labName || 'Partner Lab',
          requestedAmountInr: Number(requestedAmountInr),
          reason: reason.trim(),
          status: 'PENDING_HUMAN_APPROVAL',
          requestedBy: req.user?.email || ADMIN_EMAIL,
          createdAt: now,
          updatedAt: now,
        };

        await db.collection('refund_requests').doc(id).set(record);
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

  router.post(
    '/refunds/:id/decision',
    requirePermissions('APPROVE_REFUNDS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const { decision, reviewNotes, executeGatewayRefund } = req.body || {};
        if (decision !== 'APPROVE' && decision !== 'REJECT') {
          return next(new AppError('decision must be APPROVE or REJECT.', 400, 'BAD_REQUEST'));
        }

        const ref = db.collection('refund_requests').doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
          return next(new AppError(`Refund request not found: ${req.params.id}`, 404, 'NOT_FOUND'));
        }
        const refund = snap.data() as RefundRequestRecord;
        if (refund.status !== 'PENDING_HUMAN_APPROVAL') {
          return next(
            new AppError(`Refund request is already ${refund.status}.`, 400, 'ALREADY_REVIEWED')
          );
        }

        const now = new Date().toISOString();
        let nextStatus: RefundRequestRecord['status'] =
          decision === 'REJECT' ? 'REJECTED' : 'APPROVED_PENDING_GATEWAY';
        let gatewayRefundId: string | undefined;

        if (decision === 'APPROVE' && executeGatewayRefund && refund.paymentId.startsWith('pay_')) {
          const gw = await issueGatewayRefund({
            paymentId: refund.paymentId,
            amountInr: refund.requestedAmountInr,
            notes: { refundRequestId: refund.id, approvedBy: req.user?.email || ADMIN_EMAIL },
          });
          gatewayRefundId = gw.refundId;
          nextStatus = 'PROCESSED';
        } else if (decision === 'APPROVE' && !executeGatewayRefund) {
          nextStatus = 'APPROVED_PENDING_GATEWAY';
        }

        const updated: RefundRequestRecord = {
          ...refund,
          status: nextStatus,
          reviewedBy: req.user?.email || ADMIN_EMAIL,
          reviewNotes: reviewNotes || `${decision}ED by human reviewer`,
          ...(gatewayRefundId ? { gatewayRefundId } : {}),
          reviewedAt: now,
          updatedAt: now,
        };

        await ref.set(updated, { merge: true });
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
  router.get(
    '/reports/summary',
    requirePermissions('VIEW_FINANCIAL_REPORTS'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const yearParam = String(req.query.year || new Date().getFullYear());
        const [invSnap, expSnap, paySnap, ordersSnap] = await Promise.all([
          db.collection('invoices').get(),
          db.collection('expenses').get(),
          db.collection('payment_records').get(),
          db.collection('orders').get(),
        ]);

        const invoices = invSnap.docs.map((d) => d.data() as PlatformInvoiceRecord);
        const expenses = expSnap.docs.map((d) => d.data() as ExpenseRecord);
        const payments = paySnap.docs.map((d) => d.data() as PaymentTransactionRecord);
        const orders = ordersSnap.docs.map((d) => d.data() as Record<string, unknown>);

        const monthlyBuckets: Record<
          string,
          { month: string; billedRevenueInr: number; collectedRevenueInr: number; gstCollectedInr: number; approvedExpensesInr: number; inputGstInr: number }
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
                  (totals.collectedRevenueInr + bookingPlatformFeesInr - totals.approvedExpensesInr) * 100
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
  );

  return router;
}

