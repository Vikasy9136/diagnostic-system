import {
  ALL_PERMISSION_CODES,
  AppErrorLogRecord,
  AuditLogRecord,
  AutomationRunRecord,
  BackupRecord,
  BillingModelConfig,
  CampaignRecord,
  DEFAULT_COMMISSION_CONFIG,
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_STARTER_SERVICE_ZONES,
  DEFAULT_SUBSCRIPTION_PLANS,
  DepartmentRecord,
  DesignationRecord,
  EmployeeRecord,
  ExpenseRecord,
  FinancialBudgetRecord,
  FounderSeatRecord,
  InvoiceRecord,
  LabSubscriptionRecord,
  LeadRecord,
  LoginHistoryRecord,
  OnboardingRecord,
  OperationalExceptionRecord,
  PaymentRecord,
  ReconciliationAlertRecord,
  RefundRequestRecord,
  ServiceZoneRecord,
  SubscriptionPlanRecord,
  SupportTicketRecord,
  SystemHealthCheckRecord,
  TechIssueRecord,
  TrainingRecord,
  UserProfile,
  UserRole,
  VerificationReviewRecord,
  buildDefaultFounderSeats,
} from '@diagnostic/shared';
import { config } from '../config/env';

const now = new Date().toISOString();

export const DEV_DATA_STORE = {
  bootstrapped: false,
  usersDirectory: new Map<string, UserProfile>(),
  departments: new Map<string, DepartmentRecord>(),
  designations: new Map<string, DesignationRecord>(),
  founderSeats: new Map<string, FounderSeatRecord>(),
  employees: new Map<string, EmployeeRecord>(),
  subscriptionPlans: new Map<string, SubscriptionPlanRecord>(),
  labSubscriptions: new Map<string, LabSubscriptionRecord>(),
  invoices: new Map<string, InvoiceRecord>(),
  paymentRecords: new Map<string, PaymentRecord>(),
  webhookEvents: new Set<string>(),
  reconciliationAlerts: new Map<string, ReconciliationAlertRecord>(),
  expenses: new Map<string, ExpenseRecord>(),
  budgets: new Map<string, FinancialBudgetRecord>(),
  refunds: new Map<string, RefundRequestRecord>(),
  onboarding: new Map<string, OnboardingRecord>(),
  verificationReviews: new Map<string, VerificationReviewRecord>(),
  training: new Map<string, TrainingRecord>(),
  supportTickets: new Map<string, SupportTicketRecord>(),
  operationalExceptions: new Map<string, OperationalExceptionRecord>(),
  leads: new Map<string, LeadRecord>(),
  campaigns: new Map<string, CampaignRecord>(),
  healthChecks: new Map<string, SystemHealthCheckRecord>(),
  backups: new Map<string, BackupRecord>(),
  techIssues: new Map<string, TechIssueRecord>(),
  serviceZones: new Map<string, ServiceZoneRecord>(),
  labs: new Map<string, Record<string, unknown>>(),
  inventoryItems: new Map<string, any>(),
  inventoryCategories: new Map<string, any>(),
  inventorySuppliers: new Map<string, any>(),
  supplierBarcodeMappings: new Map<string, any>(),
  stockInwards: new Map<string, any>(),
  stockBatches: new Map<string, any>(),
  centralWarehouses: new Map<string, any>(),
  warehouseStock: new Map<string, any>(),
  stockTransactions: [] as any[],
  stockAuditLogs: [] as any[],
  kitDefinitions: new Map<string, any>(),
  kitBomVersions: new Map<string, any>(),
  kitAssemblies: new Map<string, any>(),
  kitSerials: new Map<string, any>(),
  tubeSerials: new Map<string, any>(),
  kitIssues: new Map<string, any>(),
  kitTransfers: new Map<string, any>(),
  auditLogs: [] as AuditLogRecord[],
  loginHistory: [] as LoginHistoryRecord[],
  automationRuns: [] as AutomationRunRecord[],
  appErrorLogs: [] as AppErrorLogRecord[],
  billingConfig: { ...DEFAULT_COMMISSION_CONFIG } as BillingModelConfig,
  platformSettings: {
    broadcastRadiusKm: 3,
    pickupTimeoutMinutes: 15,
    dropSlaMinutes: 120,
    maxTempCelsius: 8,
    minTempCelsius: 2,
    autoEscalateHours: 2,
  } as Record<string, unknown>,
};

export function ensureDevOrgBootstrapped(rootEmailInput?: string): void {
  const rootEmail = (rootEmailInput || config.admin.email || 'lab.setu.admin@gmail.com')
    .trim()
    .toLowerCase();

  if (!DEV_DATA_STORE.usersDirectory.has(rootEmail)) {
    DEV_DATA_STORE.usersDirectory.set(rootEmail, {
      id: 'usr-admin-root',
      email: rootEmail,
      userCode: 'USR-ADM-1001',
      userCodeUpper: 'USR-ADM-1001',
      displayName: 'Vikas (Super Admin & Product & Technology Head)',
      role: UserRole.ADMIN,
      adminSubRole: 'SUPER_ADMIN',
      isSuperAdmin: true,
      founderRoles: ['SUPER_ADMIN', 'PRODUCT_TECHNOLOGY_HEAD'],
      primaryDepartmentId: 'PRODUCT_TECHNOLOGY',
      departmentIds: [
        'PRODUCT_TECHNOLOGY',
        'FINANCE_BUSINESS',
        'OPERATIONS_PARTNERSHIPS',
        'MARKETING_GROWTH',
      ],
      permissions: ALL_PERMISSION_CODES,
      isActive: true,
      createdByAdmin: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (DEV_DATA_STORE.departments.size === 0) {
    for (const dept of DEFAULT_DEPARTMENTS) {
      DEV_DATA_STORE.departments.set(dept.id, {
        ...dept,
        ...(dept.id === 'PRODUCT_TECHNOLOGY' ? { headEmail: rootEmail } : {}),
      });
    }
  }

  if (DEV_DATA_STORE.designations.size === 0) {
    for (const des of DEFAULT_DESIGNATIONS) {
      DEV_DATA_STORE.designations.set(des.id, { ...des });
    }
  }

  if (DEV_DATA_STORE.founderSeats.size === 0) {
    for (const seat of buildDefaultFounderSeats(rootEmail)) {
      DEV_DATA_STORE.founderSeats.set(seat.seatKey, { ...seat });
    }
  }

  if (DEV_DATA_STORE.subscriptionPlans.size === 0) {
    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
      DEV_DATA_STORE.subscriptionPlans.set(plan.id, { ...plan });
    }
  }

  if (DEV_DATA_STORE.serviceZones.size === 0) {
    for (const zone of DEFAULT_STARTER_SERVICE_ZONES) {
      DEV_DATA_STORE.serviceZones.set(zone.id, { ...zone });
    }
  }

  DEV_DATA_STORE.bootstrapped = true;
}

// Immediately initialize zero-dummy-employee baseline for dev mode
ensureDevOrgBootstrapped();

