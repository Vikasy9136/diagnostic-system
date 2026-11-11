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
 * Sub-roles for Platform Admin team members
 */
export type AdminTeamRole =
  | 'SUPER_ADMIN'
  | 'FINANCE_B2B'
  | 'OPS_DISPATCH'
  | 'CATALOG_LABS';

export const ADMIN_SUB_ROLE_LABELS: Record<AdminTeamRole, string> = {
  SUPER_ADMIN: 'Super Admin (Full Control)',
  FINANCE_B2B: 'Finance & B2B Commission Manager',
  OPS_DISPATCH: 'Dispatch & Cold-Chain Operations',
  CATALOG_LABS: 'Lab Network & Catalog Manager',
};

/**
 * Custom claims embedded in the Firebase Auth ID Token
 */
export interface UserCustomClaims {
  role: UserRole;
  adminSubRole?: AdminTeamRole;
  labId?: string; // Associated Small Lab or Large Lab Center ID (if applicable)
  parentLabId?: string; // Root Large Lab HQ org ID when account belongs to a specific center
  phlebotomistId?: string; // Associated Phlebotomist profile ID
}

/**
 * Standard User Profile stored in Firestore (`users/{userId}` and `user_directory/{email}`)
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: UserRole;
  adminSubRole?: AdminTeamRole;
  labId?: string;
  parentLabId?: string;
  phlebotomistId?: string;
  isActive: boolean;
  fcmTokens?: string[];
  createdByAdmin?: boolean;
  createdAt: string; // ISO 8601 timestamp string
  updatedAt: string;
}

/**
 * Payload used exclusively by Platform Admin to provision a new role-assigned user
 */
export interface CreateManagedUserPayload {
  email: string;
  displayName: string;
  role: UserRole;
  adminSubRole?: AdminTeamRole;
  phoneNumber?: string;
  labId?: string;
  parentLabId?: string;
  phlebotomistId?: string;
  password?: string;
  isActive?: boolean;
}

export interface EmailOtpSendPayload {
  email: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}

export interface EmailOtpVerifyPayload {
  email: string;
  otp: string;
  portalRole?: UserRole;
  clientType?: 'WEB' | 'MOBILE';
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Platform Admin',
  [UserRole.SMALL_LAB]: 'Small Collection Lab',
  [UserRole.LARGE_LAB]: 'Large Reference Lab',
  [UserRole.PHLEBOTOMIST]: 'Field Phlebotomist',
};
