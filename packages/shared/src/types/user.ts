import {
  type CoreDepartmentId,
  type FounderRoleCode,
  type FounderSeatKey,
  type PermissionCode,
} from './org.js';
import { type LabVerificationStatus } from './platform.js';

/**
 * User roles in the diagnostic logistics platform
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  SMALL_LAB = 'SMALL_LAB',
  LARGE_LAB = 'LARGE_LAB',
  PHLEBOTOMIST = 'PHLEBOTOMIST',
}

/**
 * Supported authentication methods across LabSetu applications
 */
export enum AuthMethod {
  GOOGLE = 'GOOGLE',
  PASSWORD = 'PASSWORD',
  EMAIL_OTP = 'EMAIL_OTP',
}

/**
 * Legacy + Head Admin team roles (kept compatible with existing accounts and custom claims)
 */
export type AdminTeamRole =
  | 'SUPER_ADMIN'
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
  FINANCE_B2B: 'Finance & B2B Margin Team',
  OPS_DISPATCH: 'Dispatch & Cold-Chain Operations',
  CATALOG_LABS: 'Lab Network & Catalog Team',
  FINANCE_BUSINESS_HEAD: 'Head — Finance & Business',
  OPERATIONS_PARTNERSHIPS_HEAD: 'Head — Operations & Partnerships',
  MARKETING_GROWTH_HEAD: 'Head — Marketing & Growth',
  PRODUCT_TECHNOLOGY_HEAD: 'Head — Product & Technology',
  DEPARTMENT_EMPLOYEE: 'Department Team Member',
  MARKETING_EXECUTIVE: 'Marketing & Field BD Executive',
};

/**
 * Compact Custom Claims embedded in the Firebase Auth ID Token (always < 1000 bytes).
 * Full granular `permissions[]` are resolved server-side and in Firestore rules via `user_directory/{email}`.
 */
export interface UserCustomClaims {
  role: UserRole;
  adminSubRole?: AdminTeamRole;
  isSuperAdmin?: boolean;
  founderRoles?: FounderRoleCode[];
  primaryDepartmentId?: CoreDepartmentId | string;
  departmentIds?: string[];
  designationId?: string;
  labId?: string; // Associated Small Lab or Large Lab Center ID (if applicable)
  parentLabId?: string; // Root Large Lab HQ org ID when account belongs to a specific center
  phlebotomistId?: string; // Associated Phlebotomist profile ID
}

/**
 * Standard User Profile stored in `users/{userId}` and `user_directory/{email}`
 */
export interface UserProfile {
  id: string;
  email: string;
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
  userCode?: string;
  userCodeUpper?: string;
  joiningDate?: string;
  lastLoginAt?: string;
  labId?: string;
  parentLabId?: string;
  phlebotomistId?: string;
  isActive: boolean;
  fcmTokens?: string[];
  createdByAdmin?: boolean;
  verified?: boolean;
  verificationStatus?: LabVerificationStatus;
  initialPasswordSet?: boolean;
  initialPasswordUpdatedAt?: string;
  initialPasswordUpdatedBy?: string;
  mustChangePassword?: boolean;
  createdAt: string; // ISO 8601 timestamp string
  updatedAt: string;
}

/**
 * Payload used exclusively by authorised Admin/Super Admin to provision a role-assigned user
 */
export interface CreateManagedUserPayload {
  email: string;
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
  userCode?: string;
  userCodeUpper?: string;
  joiningDate?: string;
  phoneNumber?: string;
  labId?: string;
  parentLabId?: string;
  phlebotomistId?: string;
  password?: string;
  isActive?: boolean;
}

export interface EmailOtpSendPayload {
  email?: string;
  identifier?: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}

export interface EmailOtpVerifyPayload {
  email?: string;
  identifier?: string;
  otp: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Platform Admin',
  [UserRole.SMALL_LAB]: 'Partner Collection Centre',
  [UserRole.LARGE_LAB]: 'Central Reference Laboratory',
  [UserRole.PHLEBOTOMIST]: 'Field Phlebotomist',
};
