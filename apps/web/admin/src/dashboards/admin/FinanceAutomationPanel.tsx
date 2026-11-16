import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_SUPER_ADMIN_EMAIL,
  formatInr,
  hasPermission,
  isEffectiveSuperAdmin,
  type CommissionConfig,
  type CoreDepartmentId,
  type ExpenseCategory,
  type LabFacility,
  type PlatformBillingMode,
  type PlatformInvoiceRecord,
  type UserProfile,
} from '@diagnostic/shared';
import { type DynamicAlertVariant } from '../../components/DynamicAlertModal';
import {
  assignLabSubscriptionApi,
  createExpenseApi,
  createInvoiceApi,
  decideRefundRequestApi,
  getFinanceOverviewApi,
  getFinancialReportSummaryApi,
  resolveReconciliationAlertApi,
  runAutoInvoiceGenerationApi,
  runExpiryRemindersApi,
  runInstantPayoutProcessorApi,
  runReconciliationApi,
  saveBudgetApi,
  saveSubscriptionPlanApi,
  submitRefundRequestApi,
  updateExpenseApprovalApi,
  updateFinanceConfigApi,
  updateInvoiceStatusApi,
  type FinanceOverviewData,
  type FinancialReportSummaryData,
} from '../../services/orgApiService';

type AlertTriggerFn = (opts: {
  variant: DynamicAlertVariant;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}) => void;

type FinanceSubTab =
  | 'payouts'
  | 'plans'
  | 'invoices'
  | 'reconciliation'
  | 'expenses'
  | 'refunds'
  | 'reports';

interface FinanceAutomationPanelProps {
  currentUser: UserProfile;
  bearerToken?: string;
  labs: LabFacility[];
  onShowAlert: AlertTriggerFn;
  onConfigSaved?: (cfg: CommissionConfig) => void;
}

export function FinanceAutomationPanel({
  currentUser,
  bearerToken,
  labs,
  onShowAlert,
  onConfigSaved,
}: FinanceAutomationPanelProps) {
  const [subTab, setSubTab] = useState<FinanceSubTab>('payouts');
  const [data, setData] = useState<FinanceOverviewData | null>(null);
  const [reportSummary, setReportSummary] = useState<FinancialReportSummaryData | null>(null);
  const [reportYear, setReportYear] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Billing Config Form State
  const [billingMode, setBillingMode] = useState<PlatformBillingMode>(
    DEFAULT_COMMISSION_CONFIG.billingMode || 'INSTANT_30M_PAYOUT'
  );
  const [showSubsUiControl, setShowSubsUiControl] = useState(false);
  const [instantPayoutEnabled, setInstantPayoutEnabled] = useState(
    DEFAULT_COMMISSION_CONFIG.instantPayoutEnabled ?? true
  );
  const [instantPayoutWindowMinutes, setInstantPayoutWindowMinutes] = useState(
    DEFAULT_COMMISSION_CONFIG.instantPayoutWindowMinutes ?? 30
  );
  const [autoReleaseInstantPayouts, setAutoReleaseInstantPayouts] = useState(
    DEFAULT_COMMISSION_CONFIG.autoReleaseInstantPayouts ?? true
  );
  const [enableSplitPayments, setEnableSplitPayments] = useState(false);
  const [enablePartnerPayouts, setEnablePartnerPayouts] = useState(true);
  const [platformServiceFeePct, setPlatformServiceFeePct] = useState(5);
  const [graceDays, setGraceDays] = useState(7);
  const [savingBillingMode, setSavingBillingMode] = useState(false);

  // Subscription Plan Modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [planTier, setPlanTier] = useState<'SMALL_LAB' | 'LARGE_LAB' | 'ENTERPRISE'>('SMALL_LAB');
  const [planCycle, setPlanCycle] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('MONTHLY');
  const [planPriceInr, setPlanPriceInr] = useState(1499);
  const [planFeePct, setPlanFeePct] = useState(5);
  const [planPickups, setPlanPickups] = useState(120);
  const [savingPlan, setSavingPlan] = useState(false);

  // Assign Subscription Modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [subLabId, setSubLabId] = useState('');
  const [subPlanId, setSubPlanId] = useState('');
  const [subAutoRenew, setSubAutoRenew] = useState(true);
  const [savingSub, setSavingSub] = useState(false);

  // Create Invoice Modal
  const [showInvModal, setShowInvModal] = useState(false);
  const [invLabId, setInvLabId] = useState('');
  const [invType, setInvType] = useState<'SUBSCRIPTION' | 'PLATFORM_SERVICE_FEE' | 'ADJUSTMENT'>('SUBSCRIPTION');
  const [invPeriod, setInvPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [invSubtotal, setInvSubtotal] = useState(1499);
  const [invGstPct, setInvGstPct] = useState(18);
  const [invNotes, setInvNotes] = useState('');
  const [savingInv, setSavingInv] = useState(false);

  // Expense Modal
  const [showExpModal, setShowExpModal] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('CLOUD_INFRASTRUCTURE');
  const [expDeptId, setExpDeptId] = useState<CoreDepartmentId>('FINANCE_BUSINESS');
  const [expVendor, setExpVendor] = useState('');
  const [expAmount, setExpAmount] = useState(0);
  const [expGst, setExpGst] = useState(0);
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingExp, setSavingExp] = useState(false);

  // Budget Modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetMonth, setBudgetMonth] = useState(new Date().toISOString().slice(0, 7));
  const [budgetDeptId, setBudgetDeptId] = useState<CoreDepartmentId>('FINANCE_BUSINESS');
  const [budgetAllocated, setBudgetAllocated] = useState(50000);
  const [budgetProjectedRev, setBudgetProjectedRev] = useState(100000);
  const [savingBudget, setSavingBudget] = useState(false);

  // Refund Modal
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [rfPaymentId, setRfPaymentId] = useState('');
  const [rfLabId, setRfLabId] = useState('');
  const [rfAmount, setRfAmount] = useState(0);
  const [rfReason, setRfReason] = useState('');
  const [savingRefund, setSavingRefund] = useState(false);

  const isSuperAdmin = useMemo(
    () => isEffectiveSuperAdmin(currentUser, DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser]
  );
  const canConfigureBilling = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'CONFIGURE_COMMISSIONS_PAYOUTS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageSubs = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_SUBSCRIPTIONS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageInvoices = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_INVOICES', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canViewPayments = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'VIEW_PAYMENT_RECORDS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageRecon = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_RECONCILIATION', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canManageExpenses = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'MANAGE_EXPENSES_BUDGETS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canApproveRefunds = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'APPROVE_REFUNDS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );
  const canViewReports = useMemo(
    () => isSuperAdmin || hasPermission(currentUser, 'VIEW_FINANCIAL_REPORTS', DEFAULT_SUPER_ADMIN_EMAIL),
    [currentUser, isSuperAdmin]
  );

  const showSubscriptionsUi = Boolean(
    data?.config?.enableSubscriptionsModule && data?.config?.hideSubscriptionsUi === false
  );

  useEffect(() => {
    if (!showSubscriptionsUi && subTab === 'plans') {
      setSubTab('payouts');
    }
  }, [showSubscriptionsUi, subTab]);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getFinanceOverviewApi(bearerToken);
      setData(res.data);
      const cfg = res.data.config;
      setBillingMode(cfg.billingMode || 'INSTANT_30M_PAYOUT');
      setShowSubsUiControl(Boolean(cfg.enableSubscriptionsModule && cfg.hideSubscriptionsUi === false));
      setInstantPayoutEnabled(cfg.instantPayoutEnabled ?? true);
      setInstantPayoutWindowMinutes(cfg.instantPayoutWindowMinutes ?? 30);
      setAutoReleaseInstantPayouts(cfg.autoReleaseInstantPayouts ?? true);
      setEnableSplitPayments(Boolean(cfg.enablePatientPaymentSplitting));
      setEnablePartnerPayouts(cfg.enablePartnerLabPayouts ?? true);
      setPlatformServiceFeePct(cfg.platformServiceFeePct ?? 5);
      setGraceDays(cfg.defaultSubscriptionGraceDays ?? 7);

      if (canViewReports) {
        const rep = await getFinancialReportSummaryApi(reportYear, bearerToken).catch(() => null);
        if (rep?.data) setReportSummary(rep.data);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load finance workspace.');
    } finally {
      setLoading(false);
    }
  }, [bearerToken, canViewReports, reportYear]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  async function handleSaveBillingMode(e: FormEvent) {
    e.preventDefault();
    setSavingBillingMode(true);
    try {
      const res = await updateFinanceConfigApi(
        {
          billingMode,
          hideSubscriptionsUi: !showSubsUiControl,
          enableSubscriptionsModule: showSubsUiControl,
          instantPayoutEnabled,
          instantPayoutWindowMinutes: Math.max(5, Number(instantPayoutWindowMinutes) || 30),
          autoReleaseInstantPayouts,
          enablePatientPaymentSplitting: enableSplitPayments,
          enablePartnerLabPayouts: enablePartnerPayouts,
          platformServiceFeePct: Number(platformServiceFeePct),
          defaultSubscriptionGraceDays: Number(graceDays),
        },
        bearerToken
      );
      onConfigSaved?.(res.data);
      onShowAlert({
        variant: 'success',
        title: 'Billing Architecture Saved',
        message: `Mode set to ${billingMode.replace(/_/g, ' ')}. Instant 30-min payouts ${instantPayoutEnabled ? 'ACTIVE' : 'PAUSED'} • Subscriptions UI ${showSubsUiControl ? 'VISIBLE' : 'HIDDEN'}.`,
      });
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Save Failed',
        message: err instanceof Error ? err.message : 'Unable to save billing config.',
      });
    } finally {
      setSavingBillingMode(false);
    }
  }

  async function handleSavePlan(e: FormEvent) {
    e.preventDefault();
    if (!planName.trim()) return;
    setSavingPlan(true);
    try {
      await saveSubscriptionPlanApi(
        {
          code: planCode.trim() || undefined,
          name: planName.trim(),
          targetTier: planTier,
          billingCycle: planCycle,
          priceInr: Number(planPriceInr),
          platformServiceFeePct: Number(planFeePct),
          includedMonthlyPickups: Number(planPickups),
        },
        bearerToken
      );
      setShowPlanModal(false);
      onShowAlert({
        variant: 'success',
        title: 'Subscription Plan Saved',
        message: `${planName.trim()} is now ready for lab assignments.`,
      });
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Plan Error',
        message: err instanceof Error ? err.message : 'Could not save subscription plan.',
      });
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleAssignSubscription(e: FormEvent) {
    e.preventDefault();
    const chosenLab = labs.find((l) => l.id === subLabId);
    if (!subLabId || !subPlanId) return;
    setSavingSub(true);
    try {
      await assignLabSubscriptionApi(
        {
          labId: subLabId,
          labName: chosenLab?.name,
          labEmail: chosenLab?.email,
          labTier: chosenLab?.type,
          planId: subPlanId,
          autoRenew: subAutoRenew,
        },
        bearerToken
      );
      setShowSubModal(false);
      onShowAlert({
        variant: 'success',
        title: 'Subscription Assigned',
        message: `Assigned plan ${subPlanId} to ${chosenLab?.name || subLabId}.`,
      });
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Assignment Failed',
        message: err instanceof Error ? err.message : 'Could not assign lab subscription.',
      });
    } finally {
      setSavingSub(false);
    }
  }

  async function handleCreateInvoice(e: FormEvent) {
    e.preventDefault();
    const chosenLab = labs.find((l) => l.id === invLabId);
    if (!invLabId || invSubtotal <= 0) return;
    setSavingInv(true);
    try {
      await createInvoiceApi(
        {
          labId: invLabId,
          labName: chosenLab?.name,
          labEmail: chosenLab?.email,
          invoiceType: invType,
          billingPeriod: invPeriod,
          subtotalInr: Number(invSubtotal),
          gstPct: Number(invGstPct),
          notes: invNotes.trim() || undefined,
        },
        bearerToken
      );
      setShowInvModal(false);
      onShowAlert({
        variant: 'success',
        title: 'Invoice Issued',
        message: `Issued GST invoice for ${chosenLab?.name || invLabId} (${invPeriod}).`,
      });
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Invoice Error',
        message: err instanceof Error ? err.message : 'Could not issue invoice.',
      });
    } finally {
      setSavingInv(false);
    }
  }

  async function handleAutomationAction(job: 'INVOICES' | 'EXPIRY' | 'RECONCILE' | 'INSTANT_PAYOUTS') {
    setRunningJob(job);
    try {
      if (job === 'INSTANT_PAYOUTS') {
        const res = await runInstantPayoutProcessorApi('UPI', bearerToken);
        onShowAlert({
          variant: res.data.failedCount > 0 ? 'warning' : 'success',
          title: '30-Min Instant Payout Batch Processed',
          message: res.data.run.summary,
          detail: `Released: ${res.data.releasedCount} • Skipped: ${res.data.skippedCount} • Failed: ${res.data.failedCount}`,
        });
      } else if (job === 'INVOICES') {
        const res = await runAutoInvoiceGenerationApi(new Date().toISOString().slice(0, 7), bearerToken);
        onShowAlert({
          variant: 'success',
          title: 'Monthly Invoice Generation Complete',
          message: res.data.run.summary,
          detail: `Created ${res.data.createdInvoices.length} invoice(s); skipped ${res.data.run.dedupSkippedCount} duplicate(s).`,
        });
      } else if (job === 'EXPIRY') {
        const res = await runExpiryRemindersApi(bearerToken);
        onShowAlert({
          variant: 'success',
          title: 'Renewal & Expiry Reminders Run',
          message: res.data.summary,
        });
      } else {
        const res = await runReconciliationApi(bearerToken);
        onShowAlert({
          variant: res.data.alertCount > 0 ? 'warning' : 'success',
          title: 'Reconciliation Scan Complete',
          message: res.data.summary,
        });
      }
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Automation Error',
        message: err instanceof Error ? err.message : 'Automation job failed.',
      });
    } finally {
      setRunningJob(null);
    }
  }

  async function handleCreateExpense(e: FormEvent) {
    e.preventDefault();
    if (!expTitle.trim() || expAmount <= 0) return;
    setSavingExp(true);
    try {
      await createExpenseApi(
        {
          title: expTitle.trim(),
          category: expCategory,
          departmentId: expDeptId,
          vendorName: expVendor.trim() || undefined,
          amountInr: Number(expAmount),
          gstInr: Number(expGst) || 0,
          expenseDate: expDate,
        },
        bearerToken
      );
      setShowExpModal(false);
      setExpTitle('');
      setExpAmount(0);
      setExpGst(0);
      onShowAlert({
        variant: 'success',
        title: 'Expense Recorded',
        message: 'Expense voucher logged and queued for approval.',
      });
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Expense Save Failed',
        message: err instanceof Error ? err.message : 'Unable to log expense.',
      });
    } finally {
      setSavingExp(false);
    }
  }

  async function handleSaveBudget(e: FormEvent) {
    e.preventDefault();
    setSavingBudget(true);
    try {
      await saveBudgetApi(
        {
          fiscalMonth: budgetMonth,
          departmentId: budgetDeptId,
          allocatedBudgetInr: Number(budgetAllocated),
          projectedRevenueInr: Number(budgetProjectedRev),
        },
        bearerToken
      );
      setShowBudgetModal(false);
      onShowAlert({
        variant: 'success',
        title: 'Department Budget Saved',
        message: `Budget updated for ${budgetDeptId} (${budgetMonth}).`,
      });
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Budget Save Failed',
        message: err instanceof Error ? err.message : 'Unable to save budget.',
      });
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleCreateRefund(e: FormEvent) {
    e.preventDefault();
    if (!rfPaymentId.trim() || rfAmount <= 0 || !rfReason.trim()) return;
    setSavingRefund(true);
    const chosenLab = labs.find((l) => l.id === rfLabId);
    try {
      await submitRefundRequestApi(
        {
          paymentId: rfPaymentId.trim(),
          labId: rfLabId || undefined,
          labName: chosenLab?.name,
          requestedAmountInr: Number(rfAmount),
          reason: rfReason.trim(),
        },
        bearerToken
      );
      setShowRefundModal(false);
      setRfPaymentId('');
      setRfAmount(0);
      setRfReason('');
      onShowAlert({
        variant: 'success',
        title: 'Refund Request Logged',
        message: 'Queued for mandatory human financial review before gateway payout.',
      });
      await loadFinance();
    } catch (err) {
      onShowAlert({
        variant: 'error',
        title: 'Refund Submit Failed',
        message: err instanceof Error ? err.message : 'Could not submit refund request.',
      });
    } finally {
      setSavingRefund(false);
    }
  }

  function exportCaSummaryCsv() {
    if (!reportSummary) return;
    const headers = ['Month', 'Billed Revenue INR', 'Collected Revenue INR', 'Output GST INR', 'Approved Expenses INR', 'Input GST INR'];
    const rows = reportSummary.monthlySeries.map((r) =>
      [r.month, r.billedRevenueInr, r.collectedRevenueInr, r.gstCollectedInr, r.approvedExpensesInr, r.inputGstInr].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `labsetu-ca-working-schedule-${reportSummary.fiscalYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !data) {
    return (
      <div className="chart-card-modern">
        <h2 className="card-top-title">Finance &amp; Business Automation</h2>
        <p style={{ color: '#64748B', fontSize: '0.86rem', marginTop: '8px' }}>
          Loading billing configuration, subscriptions, invoices, and reconciliation ledger...
        </p>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="chart-card-modern">
        <div className="admin-auth-alert error">{errorMsg}</div>
        <button type="button" className="btn-primary" onClick={() => void loadFinance()}>
          Retry Loading Finance
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="page-header-row" style={{ marginBottom: 0 }}>
        <div className="page-title-group">
          <h1>Finance &amp; Business Department (Ashwani)</h1>
          <p>
            30-minute instant partner payouts, platform fees, webhook reconciliation, duplicate prevention, expenses, human-approved refunds &amp; CA-review reporting.
          </p>
        </div>
        <span className={billingMode === 'INSTANT_30M_PAYOUT' || billingMode === 'SUBSCRIPTION_AND_PLATFORM_FEES' ? 'status-pill-green' : 'status-pill-purple'}>
          Active Model: {billingMode.replace(/_/g, ' ')}
        </span>
      </div>

      {/* KPI Row */}
      <section className="kpi-5-row" style={{ marginBottom: 0 }}>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-teal">₹</div>
          <div className="kpi-body">
            <span className="kpi-title">Recognized Revenue</span>
            <span className="kpi-main-number">{formatInr(data?.kpis.totalRecognizedRevenueInr || 0)}</span>
            <span className="kpi-sub-split">{showSubscriptionsUi ? 'Subscriptions + Platform Fees' : 'Platform Fees & Settlements'}</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-blue">⚡</div>
          <div className="kpi-body">
            <span className="kpi-title">30-Min Payout Queue</span>
            <span className="kpi-main-number">{data?.instantPayoutStats?.eligiblePendingCount ?? 0}</span>
            <span className="kpi-sub-split">
              {data?.instantPayoutStats?.within30mSlaCount ?? 0} within 30m • {data?.instantPayoutStats?.overdueSlaCount ?? 0} due now ({formatInr(data?.instantPayoutStats?.pendingAmountInr || 0)})
            </span>
          </div>
        </div>
        {showSubscriptionsUi ? (
          <div className="kpi-card-modern">
            <div className="kpi-icon-box-green">🔁</div>
            <div className="kpi-body">
              <span className="kpi-title">Active Subscriptions</span>
              <span className="kpi-main-number">{data?.kpis.activeSubscriptionsCount ?? 0}</span>
              <span className="kpi-sub-split">{data?.kpis.expiringSoonCount ?? 0} expiring soon</span>
            </div>
          </div>
        ) : (
          <div className="kpi-card-modern">
            <div className="kpi-icon-box-green">✅</div>
            <div className="kpi-body">
              <span className="kpi-title">Instant Payouts Settled</span>
              <span className="kpi-main-number">{data?.instantPayoutStats?.releasedCount ?? 0}</span>
              <span className="kpi-sub-split">Automated &le; {instantPayoutWindowMinutes}-min release</span>
            </div>
          </div>
        )}
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-orange">⚖️</div>
          <div className="kpi-body">
            <span className="kpi-title">Open Recon Alerts</span>
            <span className="kpi-main-number">{data?.kpis.openReconciliationAlertsCount ?? 0}</span>
            <span className="kpi-sub-split">Webhook &amp; match checks</span>
          </div>
        </div>
        <div className="kpi-card-modern">
          <div className="kpi-icon-box-purple">💼</div>
          <div className="kpi-body">
            <span className="kpi-title">Pending Refunds</span>
            <span className="kpi-main-number">{data?.kpis.pendingRefundApprovalsCount ?? 0}</span>
            <span className="kpi-sub-split">Human approval queue</span>
          </div>
        </div>
      </section>

      {/* Billing Architecture & Future Toggle Panel */}
      <div className="chart-card-modern">
        <div className="card-top-header">
          <div>
            <h2 className="card-top-title">Billing Mode, 30-Min Instant Payouts &amp; Module Toggles</h2>
            <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Active launch mode settles partner payouts within 30 minutes of job completion. Subscription plans remain preserved in code and hidden in UI until enabled.
            </p>
          </div>
          <span className={instantPayoutEnabled ? 'status-pill-green' : 'status-pill-slate'}>
            30-Min Instant Payout: {instantPayoutEnabled ? 'ACTIVE' : 'PAUSED'} • Subscriptions: {showSubsUiControl ? 'VISIBLE' : 'HIDDEN'}
          </span>
        </div>

        <form onSubmit={(e) => void handleSaveBillingMode(e)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Billing Architecture Mode</label>
              <select
                className="form-select"
                value={billingMode}
                disabled={!canConfigureBilling}
                onChange={(e) => setBillingMode(e.target.value as PlatformBillingMode)}
              >
                <option value="INSTANT_30M_PAYOUT">30-Min Instant Payouts (Active Launch)</option>
                <option value="SUBSCRIPTION_AND_PLATFORM_FEES">Subscription &amp; Platform Fees</option>
                <option value="FULL_B2B_SPLIT">Full B2B Split Settlement Mode</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Platform Service Fee (%)</label>
              <input
                type="number"
                className="form-input"
                value={platformServiceFeePct}
                disabled={!canConfigureBilling}
                onChange={(e) => setPlatformServiceFeePct(Number(e.target.value))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Instant Payout Window (Minutes)</label>
              <input
                type="number"
                min={5}
                max={120}
                className="form-input"
                value={instantPayoutWindowMinutes}
                disabled={!canConfigureBilling}
                onChange={(e) => setInstantPayoutWindowMinutes(Number(e.target.value))}
              />
            </div>
            {showSubsUiControl && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Subscription Grace Days</label>
                <input
                  type="number"
                  className="form-input"
                  value={graceDays}
                  disabled={!canConfigureBilling}
                  onChange={(e) => setGraceDays(Number(e.target.value))}
                />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.79rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoReleaseInstantPayouts}
                  disabled={!canConfigureBilling}
                  onChange={(e) => {
                    setAutoReleaseInstantPayouts(e.target.checked);
                    if (e.target.checked) setInstantPayoutEnabled(true);
                  }}
                />
                Auto-Release Verified Payouts (&le; 30 Min SLA)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enablePartnerPayouts}
                  disabled={!canConfigureBilling}
                  onChange={(e) => setEnablePartnerPayouts(e.target.checked)}
                />
                Enable Automated Partner Lab &amp; Courier Payouts
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enableSplitPayments}
                  disabled={!canConfigureBilling}
                  onChange={(e) => setEnableSplitPayments(e.target.checked)}
                />
                Enable Patient Payment Splitting
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#0F766E', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={showSubsUiControl}
                  disabled={!canConfigureBilling}
                  onChange={(e) => setShowSubsUiControl(e.target.checked)}
                />
                Show Subscriptions UI &amp; Plans Module
              </label>
            </div>
            {canConfigureBilling && (
              <button type="submit" className="btn-primary" disabled={savingBillingMode}>
                {savingBillingMode ? 'Saving...' : 'Save Billing Rules'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Sub-navigation Pills */}
      <div className="sub-tab-pills">
        <button type="button" className={`sub-tab-pill ${subTab === 'payouts' ? 'active' : ''}`} onClick={() => setSubTab('payouts')}>
          ⚡ 30-Min Instant Payouts ({data?.instantPayoutStats?.eligiblePendingCount || 0})
        </button>
        {showSubscriptionsUi && (
          <button type="button" className={`sub-tab-pill ${subTab === 'plans' ? 'active' : ''}`} onClick={() => setSubTab('plans')}>
            Plans &amp; Subscriptions
          </button>
        )}
        <button type="button" className={`sub-tab-pill ${subTab === 'invoices' ? 'active' : ''}`} onClick={() => setSubTab('invoices')}>
          Invoices &amp; Auto-Billing ({data?.invoices.length || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'reconciliation' ? 'active' : ''}`} onClick={() => setSubTab('reconciliation')}>
          Razorpay &amp; Reconciliation ({data?.reconciliationAlerts.filter((a) => a.status === 'OPEN').length || 0} open)
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'expenses' ? 'active' : ''}`} onClick={() => setSubTab('expenses')}>
          Expenses &amp; Budgets ({data?.expenses.length || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'refunds' ? 'active' : ''}`} onClick={() => setSubTab('refunds')}>
          Human-Reviewed Refunds ({data?.kpis.pendingRefundApprovalsCount || 0})
        </button>
        <button type="button" className={`sub-tab-pill ${subTab === 'reports' ? 'active' : ''}`} onClick={() => setSubTab('reports')}>
          CA-Review Reports &amp; Runs
        </button>
      </div>

      {/* SUB-TAB 0: 30-MIN INSTANT PAYOUTS */}
      {subTab === 'payouts' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <div>
              <h2 className="card-top-title">30-Minute Instant Partner &amp; Phlebo Payout SLA</h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                As soon as a pickup job is dropped/completed, a {instantPayoutWindowMinutes}-minute SLA payout countdown starts automatically for partner labs and phlebotomists.
              </p>
            </div>
            {canConfigureBilling && (
              <button
                type="button"
                className="btn-primary"
                disabled={runningJob === 'INSTANT_PAYOUTS'}
                onClick={() => void handleAutomationAction('INSTANT_PAYOUTS')}
              >
                {runningJob === 'INSTANT_PAYOUTS' ? 'Processing Instant Payouts...' : '⚡ Run 30-Min Auto-Payout Batch'}
              </button>
            )}
          </div>

          <div className="comm-simulator-grid" style={{ marginBottom: '16px' }}>
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Eligible Pending Orders</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                {data?.instantPayoutStats?.eligiblePendingCount ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#0F766E' }}>
                Amount queued: {formatInr(data?.instantPayoutStats?.pendingAmountInr || 0)}
              </div>
            </div>
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Within 30-Min Countdown</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284C7' }}>
                {data?.instantPayoutStats?.within30mSlaCount ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Active SLA timers running</div>
            </div>
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Due Now / Overdue SLA</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: (data?.instantPayoutStats?.overdueSlaCount ?? 0) > 0 ? '#DC2626' : '#16A34A' }}>
                {data?.instantPayoutStats?.overdueSlaCount ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Triggered immediately on next batch</div>
            </div>
            <div className="comm-split-box">
              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Settled Settlements</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16A34A' }}>
                {data?.instantPayoutStats?.releasedCount ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>UPI / IMPS / RazorpayX verified</div>
            </div>
          </div>

          <div className="disclaimer-banner-ca" style={{ marginBottom: 0 }}>
            <strong>How 30-Min Instant Payouts Work:</strong>{' '}
            Every order transitioned to <code>DELIVERED_TO_LAB</code> or <code>COMPLETED</code> automatically stamps <code>completedAt</code> and <code>payoutDueAt</code> (+30 minutes). Individual settlements and one-click payouts can also be inspected anytime inside the main <strong>Payments &amp; Settlements</strong> workspace.
          </div>
        </div>
      )}

      {/* SUB-TAB 1: PLANS & SUBSCRIPTIONS (HIDDEN BY DEFAULT WHEN hideSubscriptionsUi = true) */}
      {showSubscriptionsUi && subTab === 'plans' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="chart-card-modern">
            <div className="card-top-header">
              <div>
                <h2 className="card-top-title">Subscription Plans ({data?.plans.length || 0})</h2>
                <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Default plans configured cleanly for Small Labs, Large Labs, and Enterprise networks.</p>
              </div>
              {canManageSubs && (
                <button type="button" className="btn-primary" onClick={() => setShowPlanModal(true)}>
                  + Add / Update Plan
                </button>
              )}
            </div>
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Target Tier</th>
                    <th>Cycle Price</th>
                    <th>Platform Fee</th>
                    <th>Included Pickups</th>
                    <th>Grace Window</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.plans || []).map((pl) => (
                    <tr key={pl.id}>
                      <td>
                        <strong>{pl.name}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}><code>{pl.code}</code></div>
                      </td>
                      <td><span className="status-pill-blue">{pl.targetTier.replace(/_/g, ' ')}</span></td>
                      <td><strong>{formatInr(pl.priceInr)}</strong> / {pl.billingCycle}</td>
                      <td>{pl.platformServiceFeePct}%</td>
                      <td>{pl.includedMonthlyPickups} / cycle</td>
                      <td>{pl.graceDays} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="chart-card-modern">
            <div className="card-top-header">
              <div>
                <h2 className="card-top-title">Lab Subscriptions ({data?.subscriptions.length || 0})</h2>
                <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Active plans linked to partner laboratories with renewal and expiry automation.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {canManageSubs && (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={runningJob === 'EXPIRY'}
                      onClick={() => void handleAutomationAction('EXPIRY')}
                    >
                      {runningJob === 'EXPIRY' ? 'Running Reminders...' : 'Run Expiry & Renewal Reminders'}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setSubLabId(labs[0]?.id || '');
                        setSubPlanId(data?.plans[0]?.id || '');
                        setShowSubModal(true);
                      }}
                    >
                      + Assign Lab Subscription
                    </button>
                  </>
                )}
              </div>
            </div>
            {(data?.subscriptions || []).length === 0 ? (
              <div className="empty-state-box">
                <h4>No Active Lab Subscriptions Yet</h4>
                <p>Enroll a verified Small Lab or Reference Lab onto a subscription plan to enable automated monthly invoicing and renewal reminders.</p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Laboratory</th>
                      <th>Plan &amp; Fee</th>
                      <th>Renewal Date</th>
                      <th>Auto-Renew</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.subscriptions || []).map((sub) => (
                      <tr key={sub.id}>
                        <td>
                          <strong>{sub.labName}</strong>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{sub.labId} • {sub.labTier}</div>
                        </td>
                        <td>{sub.planName} ({formatInr(sub.monthlyPriceInr)} • {sub.platformServiceFeePct}% fee)</td>
                        <td>{new Date(sub.renewalDate).toLocaleDateString('en-IN')}</td>
                        <td>{sub.autoRenew ? 'Enabled' : 'Manual'}</td>
                        <td>
                          <span className={sub.status === 'ACTIVE' ? 'status-pill-green' : sub.status === 'EXPIRED' ? 'status-pill-red' : 'status-pill-amber'}>
                            {sub.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INVOICES & AUTO-BILLING */}
      {subTab === 'invoices' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <div>
              <h2 className="card-top-title">Invoices &amp; Automated Monthly Billing ({data?.invoices.length || 0})</h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Idempotent deduplicated invoice generation prevents duplicate monthly bills per lab period.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {canManageInvoices && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={runningJob === 'INVOICES'}
                    onClick={() => void handleAutomationAction('INVOICES')}
                  >
                    {runningJob === 'INVOICES' ? 'Generating...' : 'Auto-Generate Monthly Invoices'}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setInvLabId(labs[0]?.id || '');
                      setShowInvModal(true);
                    }}
                  >
                    + Create Manual Invoice
                  </button>
                </>
              )}
            </div>
          </div>

          {(data?.invoices || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No Invoices Issued Yet</h4>
              <p>Run automated monthly billing once subscriptions are active, or issue an ad-hoc invoice.</p>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Partner Lab</th>
                    <th>Type &amp; Period</th>
                    <th>Total (Incl. GST)</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    {canManageInvoices && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(data?.invoices || []).map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <strong>{inv.invoiceNumber}</strong>
                        {inv.razorpayPaymentId && (
                          <div style={{ fontSize: '0.7rem', color: '#0F766E' }}>{inv.razorpayPaymentId}</div>
                        )}
                      </td>
                      <td>{inv.labName} ({inv.labId})</td>
                      <td>{inv.invoiceType.replace(/_/g, ' ')} • {inv.billingPeriod}</td>
                      <td>
                        <strong>{formatInr(inv.totalAmountInr)}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          Base {formatInr(inv.subtotalInr)} + GST {formatInr(inv.gstAmountInr)}
                        </div>
                      </td>
                      <td>{new Date(inv.dueDate).toLocaleDateString('en-IN')}</td>
                      <td>
                        <span className={inv.status === 'PAID' ? 'status-pill-green' : inv.status === 'OVERDUE' ? 'status-pill-red' : 'status-pill-amber'}>
                          {inv.status}
                        </span>
                      </td>
                      {canManageInvoices && (
                        <td>
                          {inv.status !== 'PAID' && inv.status !== 'VOID' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  void updateInvoiceStatusApi(inv.id, { status: 'PAID' as PlatformInvoiceRecord['status'] }, bearerToken)
                                    .then(() => loadFinance())
                                    .catch((err) =>
                                      onShowAlert({ variant: 'error', title: 'Update Failed', message: err instanceof Error ? err.message : 'Unable to mark paid.' })
                                    );
                                }}
                              >
                                Mark Paid
                              </button>
                              <button
                                type="button"
                                className="btn-danger-soft"
                                onClick={() => {
                                  void updateInvoiceStatusApi(inv.id, { status: 'VOID' }, bearerToken)
                                    .then(() => loadFinance())
                                    .catch((err) =>
                                      onShowAlert({ variant: 'error', title: 'Void Failed', message: err instanceof Error ? err.message : 'Unable to void invoice.' })
                                    );
                                }}
                              >
                                Void
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: RAZORPAY PAYMENTS & RECONCILIATION */}
      {subTab === 'reconciliation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="chart-card-modern">
            <div className="card-top-header">
              <div>
                <h2 className="card-top-title">Unmatched Reconciliation Alerts ({data?.reconciliationAlerts.length || 0})</h2>
                <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Verified Razorpay webhooks match gateway settlements to invoices automatically. Unmatched transactions require human review before closing.
                </p>
              </div>
              {canManageRecon && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={runningJob === 'RECONCILE'}
                  onClick={() => void handleAutomationAction('RECONCILE')}
                >
                  {runningJob === 'RECONCILE' ? 'Reconciling...' : 'Run Reconciliation Match'}
                </button>
              )}
            </div>

            {(data?.reconciliationAlerts || []).length === 0 ? (
              <div className="empty-state-box">
                <h4>All Reconciliations Clean</h4>
                <p>Zero open unmatched Razorpay alerts. Replay-idempotent webhook verification prevents duplicate charges.</p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Alert &amp; Payment ID</th>
                      <th>Amount</th>
                      <th>Reason</th>
                      <th>Severity</th>
                      <th>Status</th>
                      {canManageRecon && <th>Human Review</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.reconciliationAlerts || []).map((al) => (
                      <tr key={al.id}>
                        <td>
                          <strong>{al.id}</strong>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{al.paymentId}</div>
                        </td>
                        <td><strong>{formatInr(al.amountInr)}</strong></td>
                        <td style={{ maxWidth: '300px', fontSize: '0.79rem' }}>{al.reason}</td>
                        <td><span className={al.severity === 'CRITICAL' ? 'status-pill-red' : 'status-pill-amber'}>{al.severity}</span></td>
                        <td><span className={al.status === 'OPEN' ? 'status-pill-amber' : 'status-pill-green'}>{al.status}</span></td>
                        {canManageRecon && (
                          <td>
                            {al.status === 'OPEN' && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    void resolveReconciliationAlertApi(
                                      al.id,
                                      { status: 'RESOLVED_MATCHED', resolutionNotes: 'Human verified & matched' },
                                      bearerToken
                                    ).then(() => loadFinance());
                                  }}
                                >
                                  Resolve Matched
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    void resolveReconciliationAlertApi(
                                      al.id,
                                      { status: 'DISMISSED', resolutionNotes: 'Dismissed after human audit' },
                                      bearerToken
                                    ).then(() => loadFinance());
                                  }}
                                >
                                  Dismiss
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="chart-card-modern">
            <h2 className="card-top-title">Webhook-Verified Payment Records ({data?.payments.length || 0})</h2>
            {!canViewPayments ? (
              <div className="disclaimer-banner-ca" style={{ marginTop: '12px', marginBottom: 0 }}>
                <strong>Restricted Financial Ledger:</strong> You do not hold <code>VIEW_PAYMENT_RECORDS</code> permission. Payment gateway details are masked for security isolation.
              </div>
            ) : (data?.payments || []).length === 0 ? (
              <div className="empty-state-box" style={{ marginTop: '12px' }}>
                <h4>No Gateway Payment Transactions Yet</h4>
                <p>Verified Razorpay webhook events appear here automatically with replay protection.</p>
              </div>
            ) : (
              <div className="data-table-container" style={{ marginTop: '12px' }}>
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Razorpay Payment ID</th>
                      <th>Source</th>
                      <th>Amount</th>
                      <th>Gateway</th>
                      <th>Recon Status</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.payments || []).map((pmt) => (
                      <tr key={pmt.id}>
                        <td><code>{pmt.razorpayPaymentId}</code></td>
                        <td>{pmt.sourceType} • {pmt.labName || pmt.referenceId}</td>
                        <td><strong>{formatInr(pmt.amountInr)}</strong></td>
                        <td><span className={pmt.gatewayStatus === 'CAPTURED' ? 'status-pill-green' : 'status-pill-amber'}>{pmt.gatewayStatus}</span></td>
                        <td><span className={pmt.reconciliationStatus === 'MATCHED' ? 'status-pill-green' : 'status-pill-amber'}>{pmt.reconciliationStatus.replace(/_/g, ' ')}</span></td>
                        <td>{new Date(pmt.createdAt).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: EXPENSES & BUDGETS */}
      {subTab === 'expenses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="chart-card-modern">
            <div className="card-top-header">
              <div>
                <h2 className="card-top-title">Business Expenses &amp; Vouchers ({data?.expenses.length || 0})</h2>
                <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Track infrastructure, logistics, marketing, and legal expenses by department.</p>
              </div>
              {canManageExpenses && (
                <button type="button" className="btn-primary" onClick={() => setShowExpModal(true)}>
                  + Record Expense
                </button>
              )}
            </div>
            {(data?.expenses || []).length === 0 ? (
              <div className="empty-state-box">
                <h4>No Expenses Recorded Yet</h4>
                <p>Add verified vendor bills or operating vouchers to include them in P&amp;L and input-GST CA workbooks.</p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Expense Title</th>
                      <th>Category &amp; Dept</th>
                      <th>Amount (GST)</th>
                      <th>Status</th>
                      {canManageExpenses && <th>Review</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.expenses || []).map((ex) => (
                      <tr key={ex.id}>
                        <td>
                          <strong>{ex.title}</strong>
                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>{ex.vendorName} • {ex.expenseDate}</div>
                        </td>
                        <td>{ex.category.replace(/_/g, ' ')} • {ex.departmentId}</td>
                        <td><strong>{formatInr(ex.amountInr)}</strong> {ex.gstInr ? `(GST ${formatInr(ex.gstInr)})` : ''}</td>
                        <td>
                          <span className={ex.approvalStatus === 'APPROVED' ? 'status-pill-green' : ex.approvalStatus === 'REJECTED' ? 'status-pill-red' : 'status-pill-amber'}>
                            {ex.approvalStatus.replace(/_/g, ' ')}
                          </span>
                        </td>
                        {canManageExpenses && (
                          <td>
                            {ex.approvalStatus === 'PENDING_REVIEW' && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => void updateExpenseApprovalApi(ex.id, { approvalStatus: 'APPROVED' }, bearerToken).then(() => loadFinance())}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn-danger-soft"
                                  onClick={() => void updateExpenseApprovalApi(ex.id, { approvalStatus: 'REJECTED' }, bearerToken).then(() => loadFinance())}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="chart-card-modern">
            <div className="card-top-header">
              <h2 className="card-top-title">Department Budgets ({data?.budgets.length || 0})</h2>
              {canManageExpenses && (
                <button type="button" className="btn-secondary" onClick={() => setShowBudgetModal(true)}>
                  + Set Monthly Budget
                </button>
              )}
            </div>
            {(data?.budgets || []).length === 0 ? (
              <div className="empty-state-box">
                <h4>No Department Budgets Configured Yet</h4>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="modern-data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Department</th>
                      <th>Allocated Budget</th>
                      <th>Projected Revenue</th>
                      <th>Updated By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.budgets || []).map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.fiscalMonth}</strong></td>
                        <td>{b.departmentName}</td>
                        <td>{formatInr(b.allocatedBudgetInr)}</td>
                        <td>{b.projectedRevenueInr !== undefined ? formatInr(b.projectedRevenueInr) : '—'}</td>
                        <td>{b.updatedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: HUMAN-REVIEWED REFUNDS */}
      {subTab === 'refunds' && (
        <div className="chart-card-modern">
          <div className="card-top-header">
            <div>
              <h2 className="card-top-title">Human-Reviewed Refund Queue ({data?.refunds.length || 0})</h2>
              <p style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Safety Control: Refunds never auto-execute. Every refund requires explicit human financial approval.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setRfLabId(labs[0]?.id || '');
                setShowRefundModal(true);
              }}
            >
              + Log Refund Request
            </button>
          </div>
          {(data?.refunds || []).length === 0 ? (
            <div className="empty-state-box">
              <h4>No Refund Requests Pending</h4>
            </div>
          ) : (
            <div className="data-table-container">
              <table className="modern-data-table">
                <thead>
                  <tr>
                    <th>Refund ID</th>
                    <th>Partner &amp; Payment</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Human Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.refunds || []).map((rf) => (
                    <tr key={rf.id}>
                      <td><strong>{rf.id}</strong></td>
                      <td>{rf.labName} • <code>{rf.paymentId}</code></td>
                      <td><strong>{formatInr(rf.requestedAmountInr)}</strong></td>
                      <td style={{ maxWidth: '280px', fontSize: '0.78rem' }}>{rf.reason}</td>
                      <td>
                        <span className={rf.status === 'PROCESSED' ? 'status-pill-green' : rf.status === 'REJECTED' ? 'status-pill-red' : 'status-pill-amber'}>
                          {rf.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        {rf.status === 'PENDING_HUMAN_APPROVAL' ? (
                          canApproveRefunds ? (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() =>
                                  onShowAlert({
                                    variant: 'confirm',
                                    title: `Approve Refund ${rf.id}?`,
                                    message: `Approve refund of ${formatInr(rf.requestedAmountInr)} for ${rf.labName}?`,
                                    onConfirm: () => {
                                      void decideRefundRequestApi(
                                        rf.id,
                                        { decision: 'APPROVE', executeGatewayRefund: false },
                                        bearerToken
                                      ).then(() => loadFinance());
                                    },
                                  })
                                }
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn-danger-soft"
                                onClick={() => {
                                  void decideRefundRequestApi(rf.id, { decision: 'REJECT' }, bearerToken)
                                    .then(() => loadFinance());
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Requires APPROVE_REFUNDS</span>
                          )
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: '#475569' }}>
                            {rf.reviewedBy ? `By ${rf.reviewedBy}` : 'Reviewed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 6: CA-REVIEW REPORTS & AUTOMATION RUNS */}
      {subTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="chart-card-modern">
            <div className="card-top-header">
              <div>
                <h2 className="card-top-title">Annual Financial &amp; GST Working Summary</h2>
                <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Structured working schedule prepared for Chartered Accountant verification.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  className="form-input"
                  style={{ width: '100px' }}
                  value={reportYear}
                  onChange={(e) => setReportYear(e.target.value)}
                />
                {reportSummary && (
                  <button type="button" className="btn-primary" onClick={exportCaSummaryCsv}>
                    Download CA Schedule CSV
                  </button>
                )}
              </div>
            </div>

            <div className="disclaimer-banner-ca">
              <strong>Chartered Accountant Review Required:</strong>{' '}
              {reportSummary?.caReviewNotice ||
                'Prepared as structured financial, GST, and ledger working schedules for Chartered Accountant (CA) review and statutory filing verification. Does not represent automated tax filing.'}
            </div>

            {reportSummary && (
              <div className="comm-simulator-grid" style={{ marginBottom: '16px' }}>
                <div className="comm-split-box">
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Collected Invoice Revenue</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{formatInr(reportSummary.annualTotals.collectedRevenueInr)}</div>
                </div>
                <div className="comm-split-box">
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Booking Platform Fees</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{formatInr(reportSummary.annualTotals.bookingPlatformFeesInr)}</div>
                </div>
                <div className="comm-split-box">
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Approved Expenses</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{formatInr(reportSummary.annualTotals.approvedExpensesInr)}</div>
                </div>
                <div className="comm-split-box">
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Estimated Net GST (For CA Review)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#D97706' }}>
                    {formatInr(reportSummary.annualTotals.estimatedNetGstPayableForCaReviewInr)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="chart-card-modern">
            <h2 className="card-top-title">Finance Automation Run History ({data?.automationRuns.length || 0})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {(data?.automationRuns || []).length === 0 ? (
                <div className="empty-state-box"><h4>No Finance Automation Runs Executed Yet</h4></div>
              ) : (
                (data?.automationRuns || []).map((run) => (
                  <div key={run.id} className="automation-run-row">
                    <div>
                      <strong>{run.automationType.replace(/_/g, ' ')}</strong>
                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>{run.summary}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Processed: {run.processedCount} • Alerts: {run.alertCount} • Dedup Skipped: {run.dedupSkippedCount}
                      </div>
                    </div>
                    <span className={run.status === 'SUCCESS' ? 'status-pill-green' : 'status-pill-amber'}>
                      {run.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUBSCRIPTION PLAN */}
      {showPlanModal && (
        <div className="modal-overlay" onClick={() => !savingPlan && setShowPlanModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Save Subscription Plan</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowPlanModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSavePlan(e)}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Plan Code</label><input className="form-input" placeholder="SMALL-PRO" value={planCode} onChange={(e) => setPlanCode(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Plan Name</label><input className="form-input" value={planName} onChange={(e) => setPlanName(e.target.value)} required /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Target Tier</label>
                    <select className="form-select" value={planTier} onChange={(e) => setPlanTier(e.target.value as 'SMALL_LAB' | 'LARGE_LAB' | 'ENTERPRISE')}>
                      <option value="SMALL_LAB">Small Lab</option>
                      <option value="LARGE_LAB">Large Lab</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Billing Cycle</label>
                    <select className="form-select" value={planCycle} onChange={(e) => setPlanCycle(e.target.value as 'MONTHLY' | 'QUARTERLY' | 'YEARLY')}>
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Price (₹)</label><input type="number" className="form-input" value={planPriceInr} onChange={(e) => setPlanPriceInr(Number(e.target.value))} required /></div>
                  <div className="form-group"><label className="form-label">Service Fee (%)</label><input type="number" className="form-input" value={planFeePct} onChange={(e) => setPlanFeePct(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">Included Pickups</label><input type="number" className="form-input" value={planPickups} onChange={(e) => setPlanPickups(Number(e.target.value))} /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowPlanModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingPlan}>{savingPlan ? 'Saving...' : 'Save Plan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN SUBSCRIPTION */}
      {showSubModal && (
        <div className="modal-overlay" onClick={() => !savingSub && setShowSubModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Lab Subscription</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowSubModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleAssignSubscription(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Partner Laboratory</label>
                  <select className="form-select" value={subLabId} onChange={(e) => setSubLabId(e.target.value)} required>
                    <option value="">Select registered lab...</option>
                    {labs.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.id})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subscription Plan</label>
                  <select className="form-select" value={subPlanId} onChange={(e) => setSubPlanId(e.target.value)} required>
                    <option value="">Select plan...</option>
                    {(data?.plans || []).map((pl) => (
                      <option key={pl.id} value={pl.id}>{pl.name} — {formatInr(pl.priceInr)}/{pl.billingCycle}</option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                  <input type="checkbox" checked={subAutoRenew} onChange={(e) => setSubAutoRenew(e.target.checked)} />
                  Enable automated monthly renewal cycle
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowSubModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingSub}>{savingSub ? 'Assigning...' : 'Activate Subscription'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE INVOICE */}
      {showInvModal && (
        <div className="modal-overlay" onClick={() => !savingInv && setShowInvModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Issue Invoice</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowInvModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateInvoice(e)}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Partner Lab</label>
                  <select className="form-select" value={invLabId} onChange={(e) => setInvLabId(e.target.value)} required>
                    <option value="">Select lab...</option>
                    {labs.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.id})</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Invoice Type</label>
                    <select className="form-select" value={invType} onChange={(e) => setInvType(e.target.value as 'SUBSCRIPTION' | 'PLATFORM_SERVICE_FEE' | 'ADJUSTMENT')}>
                      <option value="SUBSCRIPTION">Subscription</option>
                      <option value="PLATFORM_SERVICE_FEE">Platform Service Fee</option>
                      <option value="ADJUSTMENT">Adjustment</option>
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Billing Period</label><input className="form-input" value={invPeriod} onChange={(e) => setInvPeriod(e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Subtotal (₹)</label><input type="number" className="form-input" value={invSubtotal} onChange={(e) => setInvSubtotal(Number(e.target.value))} required /></div>
                  <div className="form-group"><label className="form-label">GST (%)</label><input type="number" className="form-input" value={invGstPct} onChange={(e) => setInvGstPct(Number(e.target.value))} /></div>
                </div>
                <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={invNotes} onChange={(e) => setInvNotes(e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowInvModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingInv}>{savingInv ? 'Issuing...' : 'Issue Invoice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD EXPENSE */}
      {showExpModal && (
        <div className="modal-overlay" onClick={() => !savingExp && setShowExpModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Record Business Expense</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowExpModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateExpense(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Expense Title</label><input className="form-input" value={expTitle} onChange={(e) => setExpTitle(e.target.value)} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={expCategory} onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}>
                      <option value="CLOUD_INFRASTRUCTURE">Cloud Infrastructure</option>
                      <option value="LOGISTICS_OPERATIONS">Logistics Operations</option>
                      <option value="MARKETING_GROWTH">Marketing &amp; Growth</option>
                      <option value="SALARIES_CONTRACTORS">Salaries &amp; Contractors</option>
                      <option value="COMPLIANCE_LEGAL">Compliance &amp; Legal</option>
                      <option value="OFFICE_ADMIN">Office Admin</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-select" value={expDeptId} onChange={(e) => setExpDeptId(e.target.value as CoreDepartmentId)}>
                      <option value="FINANCE_BUSINESS">Finance &amp; Business</option>
                      <option value="OPERATIONS_PARTNERSHIPS">Operations &amp; Partnerships</option>
                      <option value="MARKETING_GROWTH">Marketing &amp; Growth</option>
                      <option value="PRODUCT_TECHNOLOGY">Product &amp; Technology</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" className="form-input" value={expAmount} onChange={(e) => setExpAmount(Number(e.target.value))} required /></div>
                  <div className="form-group"><label className="form-label">Input GST (₹)</label><input type="number" className="form-input" value={expGst} onChange={(e) => setExpGst(Number(e.target.value))} /></div>
                  <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={expDate} onChange={(e) => setExpDate(e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Vendor</label><input className="form-input" value={expVendor} onChange={(e) => setExpVendor(e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowExpModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingExp}>{savingExp ? 'Saving...' : 'Record Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SET DEPARTMENT BUDGET */}
      {showBudgetModal && (
        <div className="modal-overlay" onClick={() => !savingBudget && setShowBudgetModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Set Department Monthly Budget</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowBudgetModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleSaveBudget(e)}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Fiscal Month (YYYY-MM)</label><input className="form-input" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} required /></div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-select" value={budgetDeptId} onChange={(e) => setBudgetDeptId(e.target.value as CoreDepartmentId)}>
                      <option value="FINANCE_BUSINESS">Finance &amp; Business</option>
                      <option value="OPERATIONS_PARTNERSHIPS">Operations &amp; Partnerships</option>
                      <option value="MARKETING_GROWTH">Marketing &amp; Growth</option>
                      <option value="PRODUCT_TECHNOLOGY">Product &amp; Technology</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group"><label className="form-label">Allocated Budget (₹)</label><input type="number" className="form-input" value={budgetAllocated} onChange={(e) => setBudgetAllocated(Number(e.target.value))} required /></div>
                  <div className="form-group"><label className="form-label">Projected Revenue (₹)</label><input type="number" className="form-input" value={budgetProjectedRev} onChange={(e) => setBudgetProjectedRev(Number(e.target.value))} /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowBudgetModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingBudget}>{savingBudget ? 'Saving...' : 'Save Budget'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUBMIT REFUND REQUEST */}
      {showRefundModal && (
        <div className="modal-overlay" onClick={() => !savingRefund && setShowRefundModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Submit Refund Request (Human Approval Required)</h3>
              <button type="button" className="btn-secondary" onClick={() => setShowRefundModal(false)}>✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateRefund(e)}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Razorpay / Internal Payment ID</label><input className="form-input" value={rfPaymentId} onChange={(e) => setRfPaymentId(e.target.value)} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Partner Lab</label>
                    <select className="form-select" value={rfLabId} onChange={(e) => setRfLabId(e.target.value)}>
                      <option value="">Optional...</option>
                      {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Refund Amount (₹)</label><input type="number" className="form-input" value={rfAmount} onChange={(e) => setRfAmount(Number(e.target.value))} required /></div>
                </div>
                <div className="form-group"><label className="form-label">Reason for Refund</label><textarea className="form-input" rows={3} value={rfReason} onChange={(e) => setRfReason(e.target.value)} required /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowRefundModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingRefund}>{savingRefund ? 'Submitting...' : 'Submit for Human Review'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

