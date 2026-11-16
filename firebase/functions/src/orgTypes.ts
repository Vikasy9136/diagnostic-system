export type CoreDepartmentId =
  | 'FINANCE_BUSINESS'
  | 'OPERATIONS_PARTNERSHIPS'
  | 'MARKETING_GROWTH'
  | 'PRODUCT_TECHNOLOGY';

export type FounderSeatKey = 'VIKAS' | 'ASHWANI' | 'AKASH' | 'VISHAL';

export type FounderRoleCode =
  | 'SUPER_ADMIN'
  | 'FINANCE_BUSINESS_HEAD'
  | 'OPERATIONS_PARTNERSHIPS_HEAD'
  | 'MARKETING_GROWTH_HEAD'
  | 'PRODUCT_TECHNOLOGY_HEAD';

export type PermissionCode =
  | 'FULL_PLATFORM_CONTROL'
  | 'VIEW_SUPER_ADMIN_DASHBOARD'
  | 'MANAGE_DEPARTMENTS'
  | 'MANAGE_DESIGNATIONS'
  | 'MANAGE_EMPLOYEES'
  | 'MANAGE_FOUNDER_SEATS'
  | 'APPROVE_SENSITIVE_ACTIONS'
  | 'VIEW_AUDIT_LOGS'
  | 'VIEW_LOGIN_HISTORY'
  | 'VIEW_FINANCE_DASHBOARD'
  | 'MANAGE_SUBSCRIPTIONS'
  | 'MANAGE_INVOICES'
  | 'VIEW_PAYMENT_RECORDS'
  | 'MANAGE_EXPENSES_BUDGETS'
  | 'MANAGE_RECONCILIATION'
  | 'APPROVE_REFUNDS'
  | 'CONFIGURE_COMMISSIONS_PAYOUTS'
  | 'VIEW_FINANCIAL_REPORTS'
  | 'VIEW_OPERATIONS_DASHBOARD'
  | 'MANAGE_BOOKINGS_DISPATCH'
  | 'MANAGE_PHLEBO_NETWORK'
  | 'MANAGE_LAB_PARTNERSHIPS'
  | 'MANAGE_ONBOARDING'
  | 'MANAGE_VERIFICATION'
  | 'VIEW_IDENTITY_DOCS'
  | 'MANAGE_TRAINING'
  | 'MANAGE_SUPPORT_TICKETS'
  | 'MANAGE_OPERATIONAL_QUALITY'
  | 'VIEW_MEDICAL_REPORTS'
  | 'VIEW_PATIENT_METADATA'
  | 'VIEW_MARKETING_DASHBOARD'
  | 'MANAGE_LEADS'
  | 'MANAGE_CAMPAIGNS'
  | 'VIEW_GROWTH_ANALYTICS'
  | 'MANAGE_FIELD_ACQUISITION'
  | 'VIEW_TECH_DASHBOARD'
  | 'MANAGE_SYSTEM_SECURITY'
  | 'VIEW_APP_ERROR_LOGS'
  | 'MANAGE_SYSTEM_HEALTH'
  | 'MANAGE_SOFTWARE_QA'
  | 'MANAGE_BACKUPS'
  | 'MANAGE_TECH_ISSUES'
  | 'MANAGE_TEST_CATALOG'
  | 'MANAGE_SETTINGS';

export interface PermissionDefinition {
  code: PermissionCode;
  label: string;
  group: 'ORGANISATION' | CoreDepartmentId;
  sensitive?: boolean;
  description: string;
}

export interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  shortName: string;
  description: string;
  headFounderKey?: FounderSeatKey;
  headUserId?: string;
  headName: string;
  headEmail?: string;
  reportsTo: 'SUPER_ADMIN';
  isActive: boolean;
  isCoreDepartment: boolean;
  defaultPermissions: PermissionCode[];
  responsibilities: string[];
  createdAt: string;
  updatedAt: string;
}

export type DesignationCategory =
  | 'HEAD'
  | 'EXECUTIVE'
  | 'ANALYST'
  | 'DEVELOPER'
  | 'QA'
  | 'DESIGN'
  | 'SUPPORT';

export interface DesignationRecord {
  id: string;
  departmentId: string;
  departmentName: string;
  title: string;
  slug: string;
  category: DesignationCategory;
  description: string;
  isSoftwareQa?: boolean;
  isOperationalQuality?: boolean;
  defaultResponsibilities: string[];
  defaultPermissions: PermissionCode[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FounderSeatStatus = 'ACTIVE' | 'AWAITING_EMAIL_ASSIGNMENT' | 'SUSPENDED';

export interface FounderSeatRecord {
  seatKey: FounderSeatKey;
  founderName: string;
  title: string;
  founderRoles: FounderRoleCode[];
  isSuperAdmin: boolean;
  primaryDepartmentId: CoreDepartmentId;
  departmentIds: CoreDepartmentId[];
  assignedEmail?: string;
  assignedUid?: string;
  seatStatus: FounderSeatStatus;
  reportsTo: 'ROOT_OWNER' | 'SUPER_ADMIN';
  responsibilities: string[];
  permissions: PermissionCode[];
  notes?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'OFFBOARDED';

export interface EmployeeRecord {
  id: string;
  employeeId: string;
  userCode?: string;
  userCodeUpper?: string;
  userId?: string;
  email: string;
  name: string;
  phoneNumber?: string;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationTitle: string;
  reportingManagerEmail?: string;
  reportingManagerName?: string;
  reportingManagerId?: string;
  responsibilities: string[];
  permissions: PermissionCode[];
  founderRoles?: FounderRoleCode[];
  isSuperAdmin?: boolean;
  isFounderSeat?: boolean;
  founderSeatKey?: FounderSeatKey;
  status: EmployeeStatus;
  isActive: boolean;
  canSignIn: boolean;
  joiningDate: string;
  assignedCity?: string;
  assignedZone?: string;
  lastLoginAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  actorDepartmentId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  departmentId?: string;
  severity: 'INFO' | 'SENSITIVE' | 'CRITICAL';
  summary: string;
  details?: Record<string, string | number | boolean | null | undefined>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface LoginHistoryRecord {
  id: string;
  uid: string;
  email: string;
  role: string;
  departmentId?: string;
  clientType: 'WEB' | 'MOBILE';
  authMethod: string;
  success: boolean;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export type AutomationStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RETRY_PENDING' | 'ESCALATED';

export interface AutomationRunRecord {
  id: string;
  jobKey: string;
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

