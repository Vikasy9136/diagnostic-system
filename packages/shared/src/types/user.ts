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
 * Custom claims embedded in the Firebase Auth ID Token
 */
export interface UserCustomClaims {
  role: UserRole;
  labId?: string; // Associated Small Lab or Large Lab ID (if applicable)
  phlebotomistId?: string; // Associated Phlebotomist profile ID
}

/**
 * Standard User Profile stored in Firestore (`users/{userId}`)
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: UserRole;
  labId?: string;
  isActive: boolean;
  createdAt: string; // ISO 8601 timestamp string
  updatedAt: string;
}

