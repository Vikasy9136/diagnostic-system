import {
  type AppErrorLogRecord,
  type AuditLogRecord,
  type AutomationRunRecord,
  type BackupRecord,
  type CommissionConfig,
  type DepartmentRecord,
  type DepartmentSummaryReport,
  type DesignationCategory,
  type DesignationRecord,
  type EmployeeRecord,
  type ExpenseCategory,
  type ExpenseRecord,
  type FinancialBudgetRecord,
  type FounderSeatKey,
  type FounderSeatRecord,
  type FounderRoleCode,
  type LabFacility,
  type LabSubscriptionRecord,
  type LeadRecord,
  type LeadStage,
  type LoginHistoryRecord,
  type MarketingCampaignRecord,
  type OnboardingEntityType,
  type OnboardingRecord,
  type OnboardingStage,
  type OperationalExceptionRecord,
  type PaymentTransactionRecord,
  type PermissionCode,
  type PermissionDefinition,
  type PlatformInvoiceRecord,
  type ReconciliationAlertRecord,
  type RefundRequestRecord,
  type ServiceZoneRecord,
  type SubscriptionPlanRecord,
  type SupportTicketRecord,
  type SystemHealthCheckRecord,
  type TechIssueRecord,
  type TrainingRecord,
  type UserProfile,
  type VerificationReviewRecord,
} from '@diagnostic/shared';
import { API_BASE_URL, auth } from '../firebase';

const CLOUD_FALLBACK_API_BASE =
  'https://us-central1-labsetu-diagnostics.cloudfunctions.net/api/api/v1';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

async function callOrgApi<T>(
  path: string,
  options: RequestInit & { fallbackToken?: string } = {}
): Promise<ApiEnvelope<T>> {
  const freshToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const bearer = freshToken || options.fallbackToken || '';
  if (!bearer) {
    throw new Error('Your sign-in session expired. Please sign in again.');
  }

  const { fallbackToken: _ignored, headers: extraHeaders, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'WEB',
    Authorization: `Bearer ${bearer}`,
    ...((extraHeaders as Record<string, string>) || {}),
  };

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  let res: Response;
  let json: (ApiEnvelope<T> & { error?: { code?: string; message?: string } }) | null = null;

  try {
    res = await fetch(primaryUrl, { ...fetchOpts, headers });
    json = await res.json().catch(() => null);
    if (isLocalHost && res.status >= 502 && !json) {
      const fallbackRes = await fetch(`${CLOUD_FALLBACK_API_BASE}${normalizedPath}`, {
        ...fetchOpts,
        headers,
      });
      res = fallbackRes;
      json = await res.json().catch(() => null);
    }
  } catch {
    res = await fetch(`${CLOUD_FALLBACK_API_BASE}${normalizedPath}`, { ...fetchOpts, headers });
    json = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      `Request failed with status ${res.status}.`;
    throw new Error(msg);
  }

  if (!json) {
    throw new Error('Empty response received from service.');
  }

  return json;
}

// ============================================================================
// INTERFACES
// ============================================================================
export interface OrgOverviewData {
  currentActor: {
    email: string;
    displayName: string;
    isSuperAdmin: boolean;
    founderRoles: FounderRoleCode[];
    primaryDepartmentId: string | null;
    departmentIds: string[];
    permissions: PermissionCode[];
  };
  departments: DepartmentRecord[];
  designations: DesignationRecord[];
  founderSeats: FounderSeatRecord[];
  employees: EmployeeRecord[];
  permissionCatalog: PermissionDefinition[];
  stats: {
    activeFoundersCount: number;
    awaitingFoundersCount: number;
    totalDepartmentsCount: number;
    totalDesignationsCount: number;
    totalEmployeesCount: number;
    activeEmployeesCount: number;
  };
}

export interface EmployeeActivityData {
  employee: EmployeeRecord;
  auditLogs: AuditLogRecord[];
  loginHistory: LoginHistoryRecord[];
}

export interface FinanceOverviewData {
  config: CommissionConfig;
  plans: SubscriptionPlanRecord[];
  subscriptions: LabSubscriptionRecord[];
  invoices: PlatformInvoiceRecord[];
  payments: PaymentTransactionRecord[];
  reconciliationAlerts: ReconciliationAlertRecord[];
  expenses: ExpenseRecord[];
  budgets: FinancialBudgetRecord[];
  refunds: RefundRequestRecord[];
  automationRuns: AutomationRunRecord[];
  instantPayoutStats?: {
    eligiblePendingCount: number;
    within30mSlaCount: number;
    overdueSlaCount: number;
    releasedCount: number;
    pendingAmountInr: number;
  };
  kpis: {
    paidInvoicesRevenueInr: number;
    bookingPlatformFeesInr: number;
    totalRecognizedRevenueInr: number;
    outstandingAmountInr: number;
    approvedExpensesInr: number;
    netOperatingPositionInr: number;
    activeSubscriptionsCount: number;
    expiringSoonCount: number;
    openReconciliationAlertsCount: number;
    pendingRefundApprovalsCount: number;
    eligiblePhleboCourierFeesInr: number;
  };
}

export interface FinancialReportSummaryData {
  fiscalYear: string;
  caReviewNotice: string;
  monthlySeries: Array<{
    month: string;
    billedRevenueInr: number;
    collectedRevenueInr: number;
    gstCollectedInr: number;
    approvedExpensesInr: number;
    inputGstInr: number;
  }>;
  annualTotals: {
    billedRevenueInr: number;
    collectedRevenueInr: number;
    gstCollectedInr: number;
    approvedExpensesInr: number;
    inputGstInr: number;
    bookingPlatformFeesInr: number;
    netOperatingSurplusInr: number;
    estimatedNetGstPayableForCaReviewInr: number;
  };
  outstandingInvoices: Array<PlatformInvoiceRecord & { overdueDays: number }>;
  capturedPaymentsCount: number;
}

export interface UnassignedBookingMatchItem {
  orderId: string;
  orderNumber: string;
  smallLabName: string;
  targetLabName: string;
  radiusKm: number;
  createdAt: string;
  eligibleCandidates: Array<{
    phlebotomistId: string;
    name: string;
    distanceKm: number;
    activeLoad: number;
    status: string;
  }>;
}

export interface OpsOverviewData {
  sla: Record<string, unknown>;
  unassignedMatches: UnassignedBookingMatchItem[];
  onboarding: OnboardingRecord[];
  verificationReviews: VerificationReviewRecord[];
  training: TrainingRecord[];
  tickets: SupportTicketRecord[];
  exceptions: OperationalExceptionRecord[];
  automationRuns: AutomationRunRecord[];
  kpis: {
    openOrdersCount: number;
    unassignedOrdersCount: number;
    onlinePhlebosCount: number;
    pendingLabsVerificationCount: number;
    openExceptionsCount: number;
    openTicketsCount: number;
    pendingOnboardingCount: number;
  };
}

export interface AreaGrowthItem {
  city: string;
  leadsCount: number;
  convertedLeadsCount: number;
  registeredSmallLabs: number;
  registeredLargeLabs: number;
}

export interface MarketingOverviewData {
  leads: LeadRecord[];
  campaigns: MarketingCampaignRecord[];
  automationRuns: AutomationRunRecord[];
  areaGrowth: AreaGrowthItem[];
  kpis: {
    totalLeads: number;
    convertedLeads: number;
    conversionRatePct: number;
    dueFollowUpsCount: number;
    activeCampaignsCount: number;
    totalCampaignSpendInr: number;
    registeredSmallLabsCount: number;
  };
}

export interface TechOverviewData {
  platformsStatus: Array<{
    name: string;
    surface: string;
    runtime: string;
    status: string;
  }>;
  securityMatrix: {
    activeAdminAccounts: number;
    activeSuperAdmins: number;
    permissionCatalogCount: number;
    customClaimsCompactEnforced: boolean;
    multiTenantStrictLabIdEnforced: boolean;
    webhookHmacVerified: boolean;
    emailDeliveryConfigured: boolean;
  };
  errorLogs: AppErrorLogRecord[];
  healthChecks: SystemHealthCheckRecord[];
  backups: BackupRecord[];
  techIssues: TechIssueRecord[];
}

export interface ExecutiveSummaryData {
  bookingsOverview: {
    total: number;
    active: number;
    completed: number;
    unassignedAlerts: number;
    byStatus: Record<string, number>;
  };
  labsOverview: {
    total: number;
    smallLabs: number;
    largeLabs: number;
    verified: number;
    pendingVerification: number;
    onboardingInProgress: number;
  };
  phleboOverview: {
    total: number;
    online: number;
    onBreak: number;
    offline: number;
    verified: number;
    onboardingInProgress: number;
  };
  financeOverview: {
    recognizedRevenueInr: number;
    outstandingInr: number;
    approvedExpensesInr: number;
    activeSubscriptions: number;
    openReconAlerts: number;
  };
  supportAndAlerts: {
    openTickets: number;
    escalatedTickets: number;
    openExceptions: number;
  };
  marketingOverview: {
    totalLeads: number;
    convertedToLabs: number;
    hotPipeline: number;
  };
  pendingApprovals: {
    refundRequests: number;
    verificationReviews: number;
    labCompliancePending: number;
    expenseApprovals: number;
  };
  systemHealth: {
    latestCheck: Partial<SystemHealthCheckRecord> & {
      overallStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
      authServiceOk: boolean;
      databaseOk: boolean;
      storageOk: boolean;
      paymentWebhookConfigured: boolean;
      emailServiceConfigured: boolean;
    };
    unresolvedErrorsCount: number;
  };
  departmentReports: DepartmentSummaryReport[];
  recentAuditLogs: AuditLogRecord[];
  recentAutomationRuns: AutomationRunRecord[];
  founderSeats: FounderSeatRecord[];
}

export interface AuditLogsWorkspaceData {
  auditLogs: AuditLogRecord[];
  loginHistory: LoginHistoryRecord[];
  automationRuns: AutomationRunRecord[];
}

// ============================================================================
// ORG STRUCTURE, FOUNDERS & EMPLOYEES API
// ============================================================================
export function getOrgOverviewApi(fallbackToken?: string) {
  return callOrgApi<OrgOverviewData>('/org/overview', { fallbackToken });
}

export function bootstrapOrgStructureApi(fallbackToken?: string) {
  return callOrgApi<Record<string, unknown>>('/org/bootstrap', {
    method: 'POST',
    fallbackToken,
  });
}

export function assignFounderSeatApi(
  seatKey: FounderSeatKey,
  payload: {
    email: string;
    founderName?: string;
    phoneNumber?: string;
    sendPasswordSetupEmail?: boolean;
  },
  fallbackToken?: string
) {
  return callOrgApi<{ seat: FounderSeatRecord; profile: UserProfile }>(
    `/org/founders/${seatKey}/assign`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      fallbackToken,
    }
  );
}

export function transferSuperAdminApi(
  payload: {
    targetEmail: string;
    targetName?: string;
    confirmPhrase: string;
    revokeCurrentSuperAdmin?: boolean;
    keepCurrentAsProductHead?: boolean;
  },
  fallbackToken?: string
) {
  return callOrgApi<{
    newSuperAdmin: UserProfile;
    transferredTo: string;
    previousEmail: string;
    previousRevoked: boolean;
  }>('/org/founders/transfer-super-admin', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function saveDepartmentApi(
  payload: {
    code?: string;
    name: string;
    shortName?: string;
    description?: string;
    headName?: string;
    headEmail?: string;
    responsibilities?: string[];
    defaultPermissions?: PermissionCode[];
  },
  fallbackToken?: string
) {
  return callOrgApi<DepartmentRecord>('/org/departments', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateDepartmentApi(
  id: string,
  payload: Partial<DepartmentRecord>,
  fallbackToken?: string
) {
  return callOrgApi<DepartmentRecord>(`/org/departments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function saveDesignationApi(
  payload: {
    id?: string;
    departmentId: string;
    title: string;
    category?: DesignationCategory;
    description?: string;
    isSoftwareQa?: boolean;
    isOperationalQuality?: boolean;
    defaultResponsibilities?: string[];
    defaultPermissions?: PermissionCode[];
  },
  fallbackToken?: string
) {
  return callOrgApi<DesignationRecord>('/org/designations', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateDesignationApi(
  id: string,
  payload: Partial<DesignationRecord>,
  fallbackToken?: string
) {
  return callOrgApi<DesignationRecord>(`/org/designations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function createEmployeeApi(
  payload: {
    employeeId?: string;
    name: string;
    email: string;
    phoneNumber?: string;
    departmentId: string;
    designationId: string;
    reportingManagerEmail?: string;
    reportingManagerName?: string;
    responsibilities?: string[];
    permissions?: PermissionCode[];
    joiningDate?: string;
    assignedCity?: string;
    assignedZone?: string;
    initialPassword?: string;
    sendPasswordSetupEmail?: boolean;
  },
  fallbackToken?: string
) {
  return callOrgApi<EmployeeRecord>('/org/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateEmployeeApi(
  id: string,
  payload: Partial<EmployeeRecord>,
  fallbackToken?: string
) {
  return callOrgApi<EmployeeRecord>(`/org/employees/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function transferEmployeeApi(
  id: string,
  payload: {
    departmentId: string;
    designationId: string;
    reportingManagerEmail?: string;
    reportingManagerName?: string;
    permissions?: PermissionCode[];
    reason?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<EmployeeRecord>(`/org/employees/${encodeURIComponent(id)}/transfer`, {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function toggleEmployeeStatusApi(
  id: string,
  isActive: boolean,
  fallbackToken?: string
) {
  return callOrgApi<{ id: string; isActive: boolean; status: string }>(
    `/org/employees/${encodeURIComponent(id)}/status`,
    {
      method: 'POST',
      body: JSON.stringify({ isActive }),
      fallbackToken,
    }
  );
}

export function resetEmployeePasswordApi(id: string, fallbackToken?: string) {
  return callOrgApi<{ sent: boolean }>(`/org/employees/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    fallbackToken,
  });
}

export function getEmployeeActivityApi(id: string, fallbackToken?: string) {
  return callOrgApi<EmployeeActivityData>(`/org/employees/${encodeURIComponent(id)}/activity`, {
    fallbackToken,
  });
}

// ============================================================================
// FINANCE & BUSINESS AUTOMATION API
// ============================================================================
export function getFinanceOverviewApi(fallbackToken?: string) {
  return callOrgApi<FinanceOverviewData>('/finance/overview', { fallbackToken });
}

export function updateFinanceConfigApi(
  payload: Partial<CommissionConfig>,
  fallbackToken?: string
) {
  return callOrgApi<CommissionConfig>('/finance/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function saveSubscriptionPlanApi(
  payload: {
    code?: string;
    name: string;
    targetTier: 'SMALL_LAB' | 'LARGE_LAB' | 'ENTERPRISE';
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    priceInr: number;
    platformServiceFeePct?: number;
    includedMonthlyPickups?: number;
    graceDays?: number;
    features?: string[];
  },
  fallbackToken?: string
) {
  return callOrgApi<SubscriptionPlanRecord>('/finance/plans', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function assignLabSubscriptionApi(
  payload: {
    labId: string;
    labName?: string;
    labEmail?: string;
    labTier?: 'SMALL_LAB' | 'LARGE_LAB';
    planId: string;
    startDate?: string;
    autoRenew?: boolean;
  },
  fallbackToken?: string
) {
  return callOrgApi<LabSubscriptionRecord>('/finance/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function createInvoiceApi(
  payload: {
    labId: string;
    labName?: string;
    labEmail?: string;
    invoiceType: 'SUBSCRIPTION' | 'PLATFORM_SERVICE_FEE' | 'ADJUSTMENT';
    billingPeriod?: string;
    subtotalInr: number;
    gstPct?: number;
    dueDate?: string;
    notes?: string;
    subscriptionId?: string;
    razorpayOrderId?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<PlatformInvoiceRecord>('/finance/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateInvoiceStatusApi(
  id: string,
  payload: {
    status: PlatformInvoiceRecord['status'];
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<PlatformInvoiceRecord>(`/finance/invoices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function runAutoInvoiceGenerationApi(billingPeriod?: string, fallbackToken?: string) {
  return callOrgApi<{
    run: AutomationRunRecord;
    createdInvoices: PlatformInvoiceRecord[];
  }>('/finance/automation/generate-invoices', {
    method: 'POST',
    body: JSON.stringify(billingPeriod ? { billingPeriod } : {}),
    fallbackToken,
  });
}

export function runExpiryRemindersApi(fallbackToken?: string) {
  return callOrgApi<AutomationRunRecord>('/finance/automation/expiry-reminders', {
    method: 'POST',
    fallbackToken,
  });
}

export function runReconciliationApi(fallbackToken?: string) {
  return callOrgApi<AutomationRunRecord>('/finance/automation/reconcile', {
    method: 'POST',
    fallbackToken,
  });
}

export function runInstantPayoutProcessorApi(
  mode?: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX',
  fallbackToken?: string
) {
  return callOrgApi<{
    run: AutomationRunRecord;
    releasedCount: number;
    failedCount: number;
    skippedCount: number;
    releasedSettlementIds?: string[];
  }>('/finance/automation/process-instant-payouts', {
    method: 'POST',
    body: JSON.stringify(mode ? { mode } : {}),
    fallbackToken,
  });
}

export function resolveReconciliationAlertApi(
  alertId: string,
  payload: {
    status: 'RESOLVED_MATCHED' | 'DISMISSED';
    resolutionNotes?: string;
    linkedInvoiceId?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<{ id: string; status: string }>(
    `/finance/reconciliation/${encodeURIComponent(alertId)}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      fallbackToken,
    }
  );
}

export function createExpenseApi(
  payload: {
    title: string;
    category: ExpenseCategory;
    departmentId: string;
    vendorName?: string;
    amountInr: number;
    gstInr?: number;
    expenseDate?: string;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<ExpenseRecord>('/finance/expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateExpenseApprovalApi(
  id: string,
  payload: { approvalStatus: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW'; notes?: string },
  fallbackToken?: string
) {
  return callOrgApi<ExpenseRecord>(`/finance/expenses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function saveBudgetApi(
  payload: {
    fiscalMonth: string;
    departmentId: string;
    allocatedBudgetInr: number;
    projectedRevenueInr?: number;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<FinancialBudgetRecord>('/finance/budgets', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function submitRefundRequestApi(
  payload: {
    paymentId: string;
    invoiceId?: string;
    bookingId?: string;
    labId?: string;
    labName?: string;
    requestedAmountInr: number;
    reason: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<RefundRequestRecord>('/finance/refunds', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function decideRefundRequestApi(
  id: string,
  payload: { decision: 'APPROVE' | 'REJECT'; reviewNotes?: string; executeGatewayRefund?: boolean },
  fallbackToken?: string
) {
  return callOrgApi<RefundRequestRecord>(`/finance/refunds/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function getFinancialReportSummaryApi(year: string, fallbackToken?: string) {
  return callOrgApi<FinancialReportSummaryData>(
    `/finance/reports/summary?year=${encodeURIComponent(year)}`,
    { fallbackToken }
  );
}

// ============================================================================
// OPERATIONS & PARTNERSHIPS API
// ============================================================================
export function getOpsOverviewApi(fallbackToken?: string) {
  return callOrgApi<OpsOverviewData>('/ops/overview', { fallbackToken });
}

export function runOpsDispatchMonitorApi(fallbackToken?: string) {
  return callOrgApi<AutomationRunRecord>('/ops/automation/run-dispatch-monitor', {
    method: 'POST',
    fallbackToken,
  });
}

export function resolveOpsExceptionApi(
  id: string,
  payload: {
    status?: 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED';
    escalate?: boolean;
    resolutionNotes?: string;
    assignPhlebotomistId?: string;
    assignPhlebotomistName?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<OperationalExceptionRecord>(
    `/ops/exceptions/${encodeURIComponent(id)}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      fallbackToken,
    }
  );
}

export function createOnboardingApi(
  payload: {
    entityType: OnboardingEntityType;
    entityId?: string;
    entityName: string;
    city: string;
    zone?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail: string;
    stage?: OnboardingStage;
    assignedOwnerName?: string;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<OnboardingRecord>('/ops/onboarding', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateOnboardingApi(
  id: string,
  payload: {
    stage?: OnboardingStage;
    trainingStatus?: OnboardingRecord['trainingStatus'];
    assignedOwnerName?: string;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<OnboardingRecord>(`/ops/onboarding/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function createVerificationReviewApi(
  payload: {
    onboardingId?: string;
    entityType: OnboardingEntityType;
    entityId: string;
    entityName: string;
    documentType: VerificationReviewRecord['documentType'];
    storagePath?: string;
    documentUrl?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<VerificationReviewRecord>('/ops/verification-reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function decideVerificationReviewApi(
  id: string,
  payload: {
    decision: 'APPROVED' | 'REJECTED' | 'RESUBMIT_REQUIRED';
    reviewNotes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<VerificationReviewRecord>(
    `/ops/verification-reviews/${encodeURIComponent(id)}/decision`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      fallbackToken,
    }
  );
}

export function createTrainingRecordApi(
  payload: {
    traineeType: TrainingRecord['traineeType'];
    traineeId?: string;
    traineeName: string;
    traineeEmail?: string;
    moduleName: string;
    status?: TrainingRecord['status'];
    assessmentScorePct?: number;
    trainerName?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<TrainingRecord>('/ops/training', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateTrainingRecordApi(
  id: string,
  payload: { status?: TrainingRecord['status']; assessmentScorePct?: number },
  fallbackToken?: string
) {
  return callOrgApi<TrainingRecord>(`/ops/training/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function createSupportTicketApi(
  payload: {
    sourceType?: SupportTicketRecord['sourceType'];
    sourceId?: string;
    sourceName?: string;
    orderId?: string;
    category: SupportTicketRecord['category'];
    priority: SupportTicketRecord['priority'];
    departmentId?: string;
    subject: string;
    description: string;
    assignedToEmail?: string;
    assignedToName?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<SupportTicketRecord>('/ops/tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateSupportTicketApi(
  id: string,
  payload: {
    status?: SupportTicketRecord['status'];
    priority?: SupportTicketRecord['priority'];
    resolutionNotes?: string;
    assignedToEmail?: string;
    assignedToName?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<SupportTicketRecord>(`/ops/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

// ============================================================================
// MARKETING & GROWTH API
// ============================================================================
export function getMarketingOverviewApi(fallbackToken?: string) {
  return callOrgApi<MarketingOverviewData>('/marketing/overview', { fallbackToken });
}

export function createLeadApi(
  payload: {
    labName: string;
    leadType: LeadRecord['leadType'];
    contactPerson: string;
    phone: string;
    email?: string;
    city: string;
    zone?: string;
    estimatedMonthlyBookings?: number;
    estimatedMonthlyValueInr?: number;
    stage?: LeadStage;
    source?: LeadRecord['source'];
    campaignId?: string;
    assignedOwnerEmail?: string;
    assignedOwnerName?: string;
    nextFollowUpAt?: string;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<LeadRecord>('/marketing/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateLeadApi(
  id: string,
  payload: {
    stage?: LeadStage;
    nextFollowUpAt?: string;
    lastContactedAt?: string;
    assignedOwnerEmail?: string;
    assignedOwnerName?: string;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<LeadRecord>(`/marketing/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function createCampaignApi(
  payload: {
    name: string;
    channel: MarketingCampaignRecord['channel'];
    targetCity: string;
    status?: MarketingCampaignRecord['status'];
    budgetInr: number;
    spentInr?: number;
    leadsGenerated?: number;
    conversionsCount?: number;
    startDate?: string;
    endDate?: string;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<MarketingCampaignRecord>('/marketing/campaigns', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateCampaignApi(
  id: string,
  payload: {
    status?: MarketingCampaignRecord['status'];
    spentInr?: number;
    leadsGenerated?: number;
    conversionsCount?: number;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<MarketingCampaignRecord>(`/marketing/campaigns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function runMarketingFollowUpRemindersApi(fallbackToken?: string) {
  return callOrgApi<AutomationRunRecord>('/marketing/automation/follow-up-reminders', {
    method: 'POST',
    fallbackToken,
  });
}

// ============================================================================
// PRODUCT, TECH & EXECUTIVE AUDIT API
// ============================================================================
export function getExecutiveSummaryApi(fallbackToken?: string) {
  return callOrgApi<ExecutiveSummaryData>('/tech/executive-summary', { fallbackToken });
}

export function getTechOverviewApi(fallbackToken?: string) {
  return callOrgApi<TechOverviewData>('/tech/overview', { fallbackToken });
}

export function runSystemHealthCheckApi(fallbackToken?: string) {
  return callOrgApi<SystemHealthCheckRecord>('/tech/health-check/run', {
    method: 'POST',
    fallbackToken,
  });
}

export function createBackupRecordApi(
  payload: {
    backupType: BackupRecord['backupType'];
    status?: BackupRecord['status'];
    scopeSummary: string;
    storageLocation?: string;
    recoveryPointObjectiveMinutes?: number;
  },
  fallbackToken?: string
) {
  return callOrgApi<BackupRecord>('/tech/backups', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function createTechIssueApi(
  payload: {
    surface: TechIssueRecord['surface'];
    title: string;
    description: string;
    priority: TechIssueRecord['priority'];
    qaStatus?: TechIssueRecord['qaStatus'];
    assignedToEmail?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<TechIssueRecord>('/tech/issues', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateTechIssueApi(
  id: string,
  payload: {
    status?: TechIssueRecord['status'];
    qaStatus?: TechIssueRecord['qaStatus'];
    priority?: TechIssueRecord['priority'];
    assignedToEmail?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<TechIssueRecord>(`/tech/issues/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function resolveAppErrorLogApi(id: string, fallbackToken?: string) {
  return callOrgApi<AppErrorLogRecord>(`/tech/errors/${encodeURIComponent(id)}/resolve`, {
    method: 'PATCH',
    fallbackToken,
  });
}

export function getAuditLogsApi(limit = 80, fallbackToken?: string) {
  return callOrgApi<AuditLogsWorkspaceData>(`/tech/audit-logs?limit=${limit}`, { fallbackToken });
}

// ============================================================================
// OPERATIONAL SERVICE ZONES API (CONTROLLED AREA EXPANSION)
// ============================================================================
export function getServiceZonesApi(activeOnly = false, fallbackToken?: string) {
  return callOrgApi<ServiceZoneRecord[]>(
    `/ops/service-zones${activeOnly ? '?activeOnly=true' : ''}`,
    { fallbackToken }
  );
}

export function createServiceZoneApi(
  payload: {
    id?: string;
    zoneCode?: string;
    name: string;
    city: string;
    state?: string;
    centerLatitude: number;
    centerLongitude: number;
    radiusKm: number;
    pincodes?: string[] | string;
    launchPhase?: ServiceZoneRecord['launchPhase'];
    isActive?: boolean;
    notes?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<ServiceZoneRecord>('/ops/service-zones', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function updateServiceZoneApi(
  id: string,
  payload: Partial<{
    zoneCode: string;
    name: string;
    city: string;
    state: string;
    centerLatitude: number;
    centerLongitude: number;
    radiusKm: number;
    pincodes: string[] | string;
    launchPhase: ServiceZoneRecord['launchPhase'];
    isActive: boolean;
    notes: string;
  }>,
  fallbackToken?: string
) {
  return callOrgApi<ServiceZoneRecord>(`/ops/service-zones/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

export function deleteServiceZoneApi(id: string, fallbackToken?: string) {
  return callOrgApi<{ id: string; deleted: boolean }>(
    `/ops/service-zones/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      fallbackToken,
    }
  );
}

// ============================================================================
// UNIFIED CREDENTIAL & BRANCH HUB PROVISIONING API
// ============================================================================
export function setManagedUserInitialPasswordApi(
  identifier: string,
  payload: {
    password: string;
    mustChangePassword?: boolean;
    sendNotificationEmail?: boolean;
  },
  fallbackToken?: string
) {
  return callOrgApi<UserProfile>(
    `/users/${encodeURIComponent(identifier)}/initial-password`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      fallbackToken,
    }
  );
}

export function provisionBranchFacilityApi(
  payload: {
    parentLabId: string;
    name: string;
    city: string;
    address: string;
    pincode?: string;
    phone?: string;
    latitude?: number;
    longitude?: number;
    serviceRadiusKm?: number;
    nablNumber?: string;
    managerName?: string;
    createSeparateLogin?: boolean;
    email?: string;
    password?: string;
  },
  fallbackToken?: string
) {
  return callOrgApi<{
    branchId: string;
    lab: LabFacility;
    profile?: UserProfile | null;
  }>('/labs/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
    fallbackToken,
  });
}

