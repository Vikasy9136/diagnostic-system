import { SpecimenItem, SpecimenQualityStatus } from './specimen.js';
import { CustodyEvent } from './custody.js';

/**
 * Status lifecycle of a diagnostic pickup order
 */
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

/**
 * Order urgency priority
 */
export enum OrderPriority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  STAT_CRITICAL = 'STAT_CRITICAL',
}

/**
 * De-identified / Synthetic Patient Data structure for development
 */
export interface PatientMetadata {
  id: string;
  pseudonym: string; // e.g. "PT-9482"
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone?: string;
  alternatePhone?: string;
  clinicalNote?: string;
}

export type DropDestinationType = 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS';

export interface LiveGeoCoordinate {
  latitude: number;
  longitude: number;
  heading?: number;
  accuracyMeters?: number;
  speedKmph?: number;
  updatedAt: string;
}

/**
 * Main Diagnostic Sample Pickup Order
 */
export interface PickupOrder {
  id: string;
  orderNumber: string; // e.g. "ORD-202611-0001"
  smallLabId: string;
  smallLabName: string;
  createdBy?: string;
  smallLabEmail?: string;
  targetLabId: string;
  targetLabName: string;
  targetParentLabId?: string;
  dropType?: DropDestinationType;
  phlebotomistId?: string;
  phlebotomistName?: string;
  status: OrderStatus;
  priority: OrderPriority;
  patient: PatientMetadata;
  specimens: SpecimenItem[];
  custodyHistory: CustodyEvent[];
  pickupLocation: {
    address: string;
    pincode?: string;
    latitude: number;
    longitude: number;
    contactPhone?: string;
  };
  deliveryLocation: {
    address: string;
    pincode?: string;
    latitude: number;
    longitude: number;
    contactName?: string;
    contactPhone?: string;
  };
  scheduledPickupAt: string;
  actualPickupAt?: string;
  actualDeliveredAt?: string;
  reportDocumentUrl?: string;
  reportId?: string;
  totalAmountInr?: number;
  courierFeeInr?: number;
  largeLabB2bAmountInr?: number;
  platformFeeInr?: number;
  matchedPackageNames?: string[];
  packageSavingsInr?: number;
  distanceKm?: number;
  broadcastRadiusKm?: number;
  serviceZoneId?: string;
  serviceZoneName?: string;
  sampleCollectionPhotoUrl?: string;
  samplePhotoUrl?: string;
  phleboSelfieUrl?: string;
  selfiePhotoUrl?: string;
  phleboLiveLocation?: LiveGeoCoordinate;
  paymentStatus?: 'UNPAID' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PAID_TO_LAB';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkId?: string;
  paidAt?: string;
  paymentMethod?: string;
  collectedByRole?: 'SMALL_LAB' | 'PHLEBOTOMIST' | 'ADMIN' | 'PATIENT_DIRECT_LAB';
  completedAt?: string;
  deliveredAt?: string;
  actualDropAt?: string;
  payoutDueAt?: string;
  payoutWindowMinutes?: number;
  instantPayoutEligible?: boolean;
  instantPayoutAutoTriggered?: boolean;
  handoverOtp?: string;
  arrivalTemperatureCelsius?: number;
  qualityStatus?: SpecimenQualityStatus;
  department?: string;
  baseCourierFeeInr?: number;
  surgeIncentiveInr?: number;
  searchStatus?: 'SEARCHING' | 'NO_PHLEBO_FOUND' | 'ASSIGNED' | 'EXPIRED';
  broadcastExpiresAt?: string;
  searchRetryCount?: number;
  declinedPhleboIds?: string[];
  cancellationReason?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

