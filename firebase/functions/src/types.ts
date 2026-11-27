import {
  type CoreDepartmentId,
  type FounderRoleCode,
  type FounderSeatKey,
  type PermissionCode,
} from './orgTypes';

export * from './orgTypes';

export enum UserRole {
  ADMIN = 'ADMIN',
  SMALL_LAB = 'SMALL_LAB',
  LARGE_LAB = 'LARGE_LAB',
  PHLEBOTOMIST = 'PHLEBOTOMIST',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Platform Admin',
  [UserRole.SMALL_LAB]: 'Small Collection Lab',
  [UserRole.LARGE_LAB]: 'Large Reference Lab',
  [UserRole.PHLEBOTOMIST]: 'Field Phlebotomist',
};

export type AdminTeamRole =
  | 'SUPER_ADMIN'
  | 'FIELD_ONBOARDING_OFFICER'
  | 'FINANCE_B2B'
  | 'OPS_DISPATCH'
  | 'CATALOG_LABS'
  | 'FINANCE_BUSINESS_HEAD'
  | 'OPERATIONS_PARTNERSHIPS_HEAD'
  | 'MARKETING_GROWTH_HEAD'
  | 'PRODUCT_TECHNOLOGY_HEAD'
  | 'DEPARTMENT_EMPLOYEE'
  | 'MARKETING_EXECUTIVE';

export const ADMIN_SUB_ROLE_LABELS: Record<AdminTeamRole, string> = {
  SUPER_ADMIN: 'Super Admin (Full Control)',
  FIELD_ONBOARDING_OFFICER: 'Field Onboarding & Partner Officer',
  FINANCE_B2B: 'Finance & B2B Margin Team',
  OPS_DISPATCH: 'Operations & Courier Dispatch',
  CATALOG_LABS: 'Lab Onboarding & Catalog Team',
  FINANCE_BUSINESS_HEAD: 'Head — Finance & Business',
  OPERATIONS_PARTNERSHIPS_HEAD: 'Head — Operations & Partnerships',
  MARKETING_GROWTH_HEAD: 'Head — Marketing & Growth',
  PRODUCT_TECHNOLOGY_HEAD: 'Head — Product & Technology',
  DEPARTMENT_EMPLOYEE: 'Department Team Member',
  MARKETING_EXECUTIVE: 'Marketing & Field BD Executive',
};

export interface UserCustomClaims {
  role: UserRole;
  adminSubRole?: AdminTeamRole;
  isSuperAdmin?: boolean;
  founderRoles?: FounderRoleCode[];
  primaryDepartmentId?: CoreDepartmentId | string;
  departmentIds?: string[];
  designationId?: string;
  labId?: string;
  parentLabId?: string;
  phlebotomistId?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  userCode?: string;
  userCodeUpper?: string;
  displayName: string;
  phoneNumber?: string;
  role: UserRole;
  adminSubRole?: AdminTeamRole;
  isSuperAdmin?: boolean;
  revokedSuperAdmin?: boolean;
  founderRoles?: FounderRoleCode[];
  founderSeatKey?: FounderSeatKey;
  employeeId?: string;
  primaryDepartmentId?: CoreDepartmentId | string;
  departmentIds?: string[];
  designationId?: string;
  designationTitle?: string;
  reportingManagerEmail?: string;
  reportingManagerName?: string;
  responsibilities?: string[];
  permissions?: PermissionCode[];
  assignedCity?: string;
  assignedZone?: string;
  joiningDate?: string;
  lastLoginAt?: string;
  labId?: string;
  parentLabId?: string;
  phlebotomistId?: string;
  isActive: boolean;
  fcmTokens?: string[];
  createdByAdmin?: boolean;
  initialPasswordSet?: boolean;
  initialPasswordUpdatedAt?: string;
  initialPasswordUpdatedBy?: string;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateManagedUserPayload {
  email: string;
  userCode?: string;
  displayName: string;
  role: UserRole;
  adminSubRole?: AdminTeamRole;
  isSuperAdmin?: boolean;
  founderRoles?: FounderRoleCode[];
  founderSeatKey?: FounderSeatKey;
  employeeId?: string;
  primaryDepartmentId?: string;
  departmentIds?: string[];
  designationId?: string;
  designationTitle?: string;
  reportingManagerEmail?: string;
  reportingManagerName?: string;
  responsibilities?: string[];
  permissions?: PermissionCode[];
  assignedCity?: string;
  assignedZone?: string;
  joiningDate?: string;
  phoneNumber?: string;
  labId?: string;
  parentLabId?: string;
  phlebotomistId?: string;
  password?: string;
  isActive?: boolean;
}

export enum OrderStatus {
  CREATED = 'CREATED',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  ASSIGNED_TO_PHLEBO = 'ASSIGNED_TO_PHLEBO',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED_TO_LAB = 'DELIVERED_TO_LAB',
  UNDER_ANALYSIS = 'UNDER_ANALYSIS',
  REPORT_UPLOADED = 'REPORT_UPLOADED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum OrderPriority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  STAT_CRITICAL = 'STAT_CRITICAL',
}

export enum StorageTemperature {
  AMBIENT = 'AMBIENT',
  REFRIGERATED = 'REFRIGERATED',
  FROZEN = 'FROZEN',
}

export enum SpecimenQualityStatus {
  INTACT = 'INTACT',
  HEMOLYZED = 'HEMOLYZED',
  LIPEMIC = 'LIPEMIC',
  INSUFFICIENT_VOLUME = 'INSUFFICIENT_VOLUME',
  LEAKED = 'LEAKED',
  CLOTTED = 'CLOTTED',
  TEMPERATURE_EXCURSION = 'TEMPERATURE_EXCURSION',
}

export enum CustodyEventType {
  ORDER_CREATED = 'ORDER_CREATED',
  PACKED_BY_SMALL_LAB = 'PACKED_BY_SMALL_LAB',
  PICKED_UP_BY_PHLEBO = 'PICKED_UP_BY_PHLEBO',
  COLD_CHAIN_CHECK = 'COLD_CHAIN_CHECK',
  DELIVERED_TO_PARTNER_LAB = 'DELIVERED_TO_PARTNER_LAB',
  ACCESSIONED_BY_PARTNER_LAB = 'ACCESSIONED_BY_PARTNER_LAB',
  REJECTED_AT_LAB = 'REJECTED_AT_LAB',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  PUSH_FCM = 'PUSH_FCM',
}

export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum NotificationCategory {
  BOOKING_CREATED = 'BOOKING_CREATED',
  PICKUP_ASSIGNED = 'PICKUP_ASSIGNED',
  SAMPLE_COLLECTED = 'SAMPLE_COLLECTED',
  REPORT_UPLOADED = 'REPORT_UPLOADED',
  TEMPERATURE_ALERT = 'TEMPERATURE_ALERT',
  LAB_VERIFICATION = 'LAB_VERIFICATION',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYOUT_SETTLED = 'PAYOUT_SETTLED',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
}

export type EmailTemplateType =
  | 'OTP_LOGIN'
  | 'PASSWORD_RESET'
  | 'PDF_REPORT'
  | 'EMERGENCY_ALERT'
  | 'OPERATIONAL_NOTIFICATION'
  | 'PAYMENT_RECEIPT'
  | 'ACCOUNT_WELCOME';

export type EmailMetadataValue = string | number | boolean | undefined;

export interface PlatformNotification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  recipientUid?: string;
  recipientEmail?: string;
  recipientRole?: UserRole | 'ALL';
  orderId?: string;
  labId?: string;
  channels: NotificationChannel[];
  read: boolean;
  emailSent: boolean;
  emailStatus?: string;
  pushSent: boolean;
  createdAt: string;
}

export interface SendNotificationPayload {
  title: string;
  message: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  recipientEmail?: string;
  recipientUid?: string;
  recipientRole?: UserRole | 'ALL';
  orderId?: string;
  labId?: string;
  channels?: NotificationChannel[];
  templateType?: EmailTemplateType;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, EmailMetadataValue>;
}

export interface EmailDeliverySettings {
  adminEmail: string;
  enableBookingEmails: boolean;
  enableColdChainAlerts: boolean;
  enableReportReadyEmails: boolean;
  enableDailySummaryEmails: boolean;
  smtpConfigured?: boolean;
}

export const TEMPERATURE_LIMITS: Record<StorageTemperature, { min: number; max: number }> = {
  [StorageTemperature.AMBIENT]: { min: 15, max: 25 },
  [StorageTemperature.REFRIGERATED]: { min: 2, max: 8 },
  [StorageTemperature.FROZEN]: { min: -80, max: -15 },
};

export function isTemperatureCompliant(
  temperatureCelsius: number,
  requirement: StorageTemperature
): boolean {
  const limits = TEMPERATURE_LIMITS[requirement];
  if (!limits) return false;
  return temperatureCelsius >= limits.min && temperatureCelsius <= limits.max;
}

export function isValidSpecimenBarcode(barcode: string): boolean {
  if (!barcode || typeof barcode !== 'string') return false;
  return /^SMP-[A-Z0-9]{4,16}$/i.test(barcode.trim());
}

