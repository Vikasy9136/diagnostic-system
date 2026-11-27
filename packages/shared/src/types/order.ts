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
  SAMPLE_RECEIVED_AT_CENTRE = 'SAMPLE_RECEIVED_AT_CENTRE',
  SAMPLE_IN_LAB = 'SAMPLE_IN_LAB',
  UNDER_ANALYSIS = 'UNDER_ANALYSIS',
  PROCESSING_COMPLETED = 'PROCESSING_COMPLETED',
  REPORT_PENDING = 'REPORT_PENDING',
  REPORT_UPLOADED = 'REPORT_UPLOADED',
  REPORT_AVAILABLE_TO_SMALL_LAB = 'REPORT_AVAILABLE_TO_SMALL_LAB',
  COMPLETED = 'COMPLETED',
  INSUFFICIENT_SAMPLE = 'INSUFFICIENT_SAMPLE',
  RECOLLECTION_REQUIRED = 'RECOLLECTION_REQUIRED',
  ON_HOLD = 'ON_HOLD',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export type TestReportStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'READY_FOR_UPLOAD'
  | 'UPLOADED'
  | 'VERIFIED'
  | 'AVAILABLE_TO_SMALL_LAB';

export type UrgentPriorityLevel = 'URGENT' | 'CRITICAL';

export type UrgentRequestStatus =
  | 'NORMAL'
  | 'URGENT_REQUESTED'
  | 'URGENT_ACCEPTED'
  | 'URGENT_REJECTED'
  | 'URGENT_IN_PROGRESS'
  | 'URGENT_DELAYED'
  | 'URGENT_COMPLETED'
  | 'URGENT_CANCELLED';

export interface UrgentRequestHistoryEntry {
  action:
    | 'REQUESTED'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'CLARIFICATION_REQUESTED'
    | 'CLARIFICATION_SUBMITTED'
    | 'IN_PROGRESS'
    | 'DEADLINE_UPDATED'
    | 'DELAYED'
    | 'COMPLETED'
    | 'CANCELLED';
  previousStatus?: UrgentRequestStatus;
  newStatus: UrgentRequestStatus;
  actorUid: string;
  actorRole: string;
  actorName?: string;
  timestamp: string;
  remarks?: string;
  expectedCompletionAt?: string;
}

export interface UrgentReportRequestRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  testId: string;
  testCode: string;
  testName: string;
  department?: string;
  smallLabId: string;
  smallLabName: string;
  largeLabId: string;
  largeLabName: string;
  requestedPriority: UrgentPriorityLevel;
  reason: string;
  requestedDeadline: string;
  remarks?: string;
  status: UrgentRequestStatus;
  acceptedExpectedCompletionAt?: string;
  assignedTeamOrCentre?: string;
  rejectionReason?: string;
  clarificationQuestion?: string;
  clarificationResponse?: string;
  delayReason?: string;
  delayedDetectedAt?: string;
  respondedByUid?: string;
  respondedByName?: string;
  respondedAt?: string;
  completedAt?: string;
  history: UrgentRequestHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface BookingTestItem {
  testId: string;
  testCode: string;
  testName: string;
  packageId?: string;
  packageName?: string;
  sampleType?: string;
  priceInr: number;
  reportStatus: TestReportStatus;
  latestReportId?: string;
  reportType?: 'INDIVIDUAL' | 'COMBINED';
  urgentPriorityStatus?: UrgentRequestStatus;
  urgentRequestId?: string;
  urgentDeadline?: string;
  expectedCompletionAt?: string;
  updatedAt: string;
}

export interface ProcessingStatusHistoryEntry {
  previousStatus: OrderStatus | string;
  newStatus: OrderStatus | string;
  userId: string;
  userRole: string;
  timestamp: string;
  centreId?: string;
  remarks?: string;
}

export interface CollectionCentreRecord {
  id: string;
  largeLabId: string;
  name: string;
  address: string;
  city: string;
  district?: string;
  state?: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  centreType: 'COLLECTION_CENTRE' | 'PROCESSING_LAB' | 'BOTH';
  contactPersonName: string;
  contactDesignation?: string;
  contactPhone: string;
  alternatePhone?: string;
  operatingHours: string;
  isAvailable: boolean;
  canReceiveSamples: boolean;
  canProcessSamples: boolean;
  handoverInstructions?: string;
  createdAt: string;
  updatedAt: string;
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
  selectedCentreId?: string;
  selectedCentreName?: string;
  bookingTestItems?: BookingTestItem[];
  processingStatusHistory?: ProcessingStatusHistoryEntry[];
  handoverVerifiedAt?: string;
  handoverVerifiedBy?: string;
  handoverCentreId?: string;
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
  chatUnreadByPhlebo?: number;
  chatUnreadBySmallLab?: number;
  chatUnreadByLargeLab?: number;
  lastChatAt?: string;
  lastChatMessage?: string;
  lastChatSenderRole?: 'PHLEBOTOMIST' | 'SMALL_LAB' | 'LARGE_LAB';
  lastChatSenderName?: string;
  createdAt: string;
  updatedAt: string;
}

