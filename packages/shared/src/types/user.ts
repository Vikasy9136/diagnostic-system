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
 * Custom claims embedded in the Firebase Auth ID Token
 */
export interface UserCustomClaims {
  role: UserRole;
  labId?: string; // Associated Small Lab or Large Lab ID (if applicable)
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
  labId?: string;
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
  phoneNumber?: string;
  labId?: string;
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
