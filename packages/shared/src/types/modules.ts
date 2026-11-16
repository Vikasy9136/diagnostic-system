import { type CoreDepartmentId, type EmployeeStatus, type FounderSeatKey } from './org.js';
import { type CommissionConfig } from './platform.js';

export type BillingModelConfig = CommissionConfig;

// ============================================================================
// AUTOMATION GOVERNANCE (CROSS-DEPARTMENT)
// ============================================================================
export type AutomationStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RETRY_PENDING' | 'ESCALATED';

export interface AutomationRunRecord {
  id: string;
  jobKey: string; // Idempotent deduplication key per trigger window
  automationType:
    | 'SUBSCRIPTION_INVOICE_GEN'
    | 'SUBSCRIPTION_EXPIRY_REMINDER'
    | 'RAZORPAY_WEBHOOK_SYNC'
    | 'RECONCILIATION_MATCH'
    | 'PHLEBO_ASSIGNMENT_CHECK'
    | 'UNASSIGNED_BOOKING_ALERT'
    | 'DELAY_CANCELLATION_ALERT'
    | 'INSTANT_PAYOUT_30M'
    | 'MARKETING_FOLLOWUP_REMINDER'
    | 'SYSTEM_HEALTH_CHECK';
  departmentId: CoreDepartmentId;
  status: AutomationStatus;
  processedCount: number;
  alertCount: number;
  dedupSkippedCount: number;
  failureReason?: string;
  retryCount: number;
  escalatedToHead?: boolean;
  escalatedToEmail?: string;
  triggeredByEmail: string;
  summary: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

// ============================================================================
// PHASE 4: FINANCE & BUSINESS AUTOMATION (`FINANCE_BUSINESS`)
// ============================================================================
export interface SubscriptionPlanRecord {
  id: string;
  code: string;
  name: string;
  targetTier: 'SMALL_LAB' | 'LARGE_LAB' | 'ENTERPRISE';
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  priceInr: number;
  platformServiceFeePct: number;
  includedMonthlyPickups: number;
  graceDays: number;
  features: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'GRACE_PERIOD' | 'EXPIRED' | 'PAUSED';

export interface LabSubscriptionRecord {
  id: string;
  labId: string;
  labName: string;
  labEmail?: string;
  labTier: 'SMALL_LAB' | 'LARGE_LAB';
  planId: string;
  planName: string;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  monthlyPriceInr: number;
  platformServiceFeePct: number;
  status: SubscriptionStatus;
  startDate: string;
  renewalDate: string;
  lastBilledAt?: string;
  lastReminderSentAt?: string;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceType = 'SUBSCRIPTION' | 'PLATFORM_SERVICE_FEE' | 'ADJUSTMENT';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOID' | 'REFUNDED';

export interface PlatformInvoiceRecord {
  id: string;
  invoiceNumber: string;
  subscriptionId?: string;
  labId: string;
  labName: string;
  labEmail?: string;
  invoiceType: InvoiceType;
  billingPeriod: string;
  subtotalInr: number;
  gstPct: number;
  gstAmountInr: number;
  totalAmountInr: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  notes?: string;
  dedupKey?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceRecord = PlatformInvoiceRecord;

export interface PaymentTransactionRecord {
  id: string;
  sourceType: 'INVOICE' | 'SUBSCRIPTION' | 'BOOKING_FEE' | 'WEBHOOK';
  referenceId: string;
  invoiceId?: string;
  bookingId?: string;
  labId?: string;
  labName?: string;
  amountInr: number;
  currency: 'INR';
  razorpayOrderId?: string;
  razorpayPaymentId: string;
  razorpayEventId?: string;
  paymentMethod: string;
  gatewayStatus: 'CAPTURED' | 'AUTHORIZED' | 'FAILED' | 'REFUNDED';
  reconciliationStatus: 'MATCHED' | 'UNMATCHED' | 'DUPLICATE_PREVENTED' | 'RESOLVED_MANUALLY';
  reconciledBy?: string;
  reconciledAt?: string;
  notes?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentRecord = PaymentTransactionRecord;

export interface ReconciliationAlertRecord {
  id: string;
  paymentId: string;
  razorpayOrderId?: string;
  amountInr: number;
  reason: string;
  severity: 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED_MATCHED' | 'DISMISSED';
  resolvedBy?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'CLOUD_INFRASTRUCTURE'
  | 'LOGISTICS_OPERATIONS'
  | 'MARKETING_GROWTH'
  | 'SALARIES_CONTRACTORS'
  | 'COMPLIANCE_LEGAL'
  | 'OFFICE_ADMIN'
  | 'OTHER';

export interface ExpenseRecord {
  id: string;
  title: string;
  category: ExpenseCategory;
  departmentId: CoreDepartmentId;
  vendorName: string;
  amountInr: number;
  gstInr?: number;
  expenseDate: string;
  paymentReference?: string;
  approvalStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialBudgetRecord {
  id: string;
  fiscalMonth: string; // e.g. "2026-11" or "FY 2026-27"
  departmentId: CoreDepartmentId;
  departmentName: string;
  allocatedBudgetInr: number;
  projectedRevenueInr?: number;
  notes?: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRequestRecord {
  id: string;
  paymentId: string;
  invoiceId?: string;
  bookingId?: string;
  labId: string;
  labName: string;
  requestedAmountInr: number;
  reason: string;
  status: 'PENDING_HUMAN_APPROVAL' | 'APPROVED_PENDING_GATEWAY' | 'PROCESSED' | 'REJECTED';
  requestedBy: string;
  reviewedBy?: string;
  reviewNotes?: string;
  gatewayRefundId?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PHASE 5: OPERATIONS & PARTNERSHIPS (`OPERATIONS_PARTNERSHIPS`)
// ============================================================================
export type OnboardingEntityType = 'SMALL_LAB' | 'LARGE_LAB' | 'PHLEBOTOMIST';
export type OnboardingStage =
  | 'APPLICATION_SUBMITTED'
  | 'DOCUMENTS_UPLOADED'
  | 'UNDER_VERIFICATION'
  | 'TRAINING_IN_PROGRESS'
  | 'READY_FOR_ACTIVATION'
  | 'ACTIVE'
  | 'REJECTED';

export interface OnboardingRecord {
  id: string;
  entityType: OnboardingEntityType;
  entityId?: string;
  entityName: string;
  city: string;
  zone?: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  stage: OnboardingStage;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'CHANGES_REQUESTED' | 'REJECTED';
  trainingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  assignedOwnerName?: string;
  documentUrls?: Array<{ label: string; storagePath?: string; url?: string }>;
  notes?: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationReviewRecord {
  id: string;
  onboardingId?: string;
  entityType: OnboardingEntityType;
  entityId: string;
  entityName: string;
  documentType: 'NABL_CERTIFICATE' | 'LAB_REGISTRATION' | 'AADHAAR_PAN_KYC' | 'PHLEBO_DL_ID' | 'COLD_BOX_AUDIT';
  storagePath?: string;
  documentUrl?: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'RESUBMIT_REQUIRED';
  reviewerEmail?: string;
  reviewerName?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingRecord {
  id: string;
  traineeType: 'SMALL_LAB_STAFF' | 'LARGE_LAB_STAFF' | 'PHLEBOTOMIST';
  traineeId?: string;
  traineeName: string;
  traineeEmail?: string;
  moduleName: string;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';
  assessmentScorePct?: number;
  trainerName?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketRecord {
  id: string;
  ticketNumber: string;
  sourceType: 'SMALL_LAB' | 'LARGE_LAB' | 'PHLEBOTOMIST' | 'INTERNAL';
  sourceId?: string;
  sourceName: string;
  orderId?: string;
  category:
    | 'PICKUP_DELAY'
    | 'UNASSIGNED_BOOKING'
    | 'COLD_CHAIN_ISSUE'
    | 'REPORT_DELAY'
    | 'PARTNER_ONBOARDING'
    | 'BILLING_QUERY'
    | 'TECHNICAL_ISSUE'
    | 'OTHER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
  departmentId: CoreDepartmentId;
  assignedToEmail?: string;
  assignedToName?: string;
  escalatedToHead?: boolean;
  subject: string;
  description: string;
  resolutionNotes?: string;
  slaDueAt?: string;
  resolvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalExceptionRecord {
  id: string;
  exceptionType:
    | 'UNASSIGNED_TIMEOUT'
    | 'PHLEBO_REJECTION_SPIKE'
    | 'PICKUP_DELAY'
    | 'DROP_OFF_DELAY'
    | 'CANCELLATION_ALERT'
    | 'TEMPERATURE_EXCURSION'
    | 'QUALITY_INCIDENT';
  orderId?: string;
  orderNumber?: string;
  phlebotomistId?: string;
  smallLabName?: string;
  targetLabName?: string;
  city?: string;
  severity: 'WARNING' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED';
  details: string;
  recommendedAction: string;
  escalatedToHead?: boolean;
  resolvedBy?: string;
  resolutionNotes?: string;
  dedupKey: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PHASE 6: MARKETING & GROWTH (`MARKETING_GROWTH`)
// ============================================================================
export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'DEMO_SCHEDULED'
  | 'PROPOSAL_SENT'
  | 'NEGOTIATION'
  | 'CONVERTED_TO_LAB'
  | 'LOST';

export interface LeadRecord {
  id: string;
  leadCode: string;
  labName: string;
  leadType: 'SMALL_LAB' | 'LARGE_LAB' | 'DIAGNOSTIC_CHAIN' | 'CORPORATE_PARTNER';
  contactPerson: string;
  phone: string;
  email?: string;
  city: string;
  zone?: string;
  estimatedMonthlyBookings?: number;
  estimatedMonthlyValueInr?: number;
  stage: LeadStage;
  source: 'FIELD_VISIT' | 'REFERRAL' | 'DIGITAL_CAMPAIGN' | 'INBOUND_WEB' | 'COLD_OUTREACH';
  campaignId?: string;
  assignedOwnerEmail?: string;
  assignedOwnerName?: string;
  nextFollowUpAt?: string;
  lastContactedAt?: string;
  followUpReminderSentAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingCampaignRecord {
  id: string;
  name: string;
  channel: 'FIELD_OUTREACH' | 'WHATSAPP_B2B' | 'SEARCH_ADS' | 'SOCIAL_MEDIA' | 'MEDICAL_EXPO' | 'REFERRAL_PROGRAM';
  targetCity: string;
  status: 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  budgetInr: number;
  spentInr: number;
  leadsGenerated: number;
  conversionsCount: number;
  startDate: string;
  endDate?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignRecord = MarketingCampaignRecord;

// ============================================================================
// PHASE 3: PRODUCT & TECHNOLOGY MANAGEMENT (`PRODUCT_TECHNOLOGY` — VIKAS)
// ============================================================================
export interface AppErrorLogRecord {
  id: string;
  service: 'PORTAL_WEB' | 'PHLEBO_APP' | 'CLOUD_FUNCTIONS' | 'EXPRESS_API' | 'WEBHOOK_SYNC';
  severity: 'WARN' | 'ERROR' | 'CRITICAL';
  errorCode: string;
  message: string;
  endpointOrRoute?: string;
  resolved: boolean;
  resolvedBy?: string;
  createdAt: string;
}

export interface SystemHealthCheckRecord {
  id: string;
  checkedAt: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  authServiceOk: boolean;
  databaseOk: boolean;
  storageOk: boolean;
  paymentWebhookConfigured: boolean;
  emailServiceConfigured: boolean;
  checkedBy: string;
  notes?: string;
}

export interface BackupRecord {
  id: string;
  backupType: 'DATABASE_SNAPSHOT' | 'RULES_CONFIG' | 'AUDIT_ARCHIVE';
  status: 'VERIFIED' | 'SCHEDULED' | 'FAILED';
  scopeSummary: string;
  storageLocation: string;
  verifiedBy: string;
  recoveryPointObjectiveMinutes?: number;
  createdAt: string;
}

export interface TechIssueRecord {
  id: string;
  issueKey: string;
  surface: 'ADMIN_WEBSITE' | 'PARTNER_PORTAL' | 'PHLEBO_MOBILE_APP' | 'API_BACKEND' | 'SECURITY_RBAC' | 'QA_AUTOMATION';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'IN_QA_REVIEW' | 'RESOLVED';
  qaStatus?: 'PENDING_TEST' | 'PASSED' | 'FAILED';
  assignedToEmail?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentSummaryReport {
  departmentId: string;
  departmentName: string;
  headName: string;
  headEmail?: string;
  headSeatStatus?: FounderSeatKey | string;
  isActive: boolean;
  designationCount: number;
  activeEmployeeCount: number;
  inactiveEmployeeCount: number;
  keyMetrics: Record<string, string | number>;
  employeeStatuses?: Array<{ employeeId: string; name: string; designationTitle: string; status: EmployeeStatus }>;
}

export interface ServiceZoneRecord {
  id: string;
  zoneCode: string;
  name: string;
  city: string;
  state?: string;
  pincodes: string[];
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  isActive: boolean;
  launchPhase: 'PILOT' | 'EXPANSION' | 'PAUSED';
  notes?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}
