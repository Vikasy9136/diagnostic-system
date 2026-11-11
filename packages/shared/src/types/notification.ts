import { UserRole } from './user.js';

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
  createdAt: string; // ISO 8601 timestamp
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
