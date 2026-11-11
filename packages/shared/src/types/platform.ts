import { SpecimenQualityStatus, SpecimenType, StorageTemperature, TubeType } from './specimen.js';

export type LabFacilityTier = 'SMALL_LAB' | 'LARGE_LAB';
export type LabVerificationStatus = 'VERIFIED' | 'PENDING' | 'REJECTED';

export interface PayoutProfile {
  accountHolderName?: string;
  upiId?: string;
  bankAccountLast4?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  preferredMethod?: 'UPI' | 'BANK_TRANSFER';
  updatedAt?: string;
}

export type LabCenterType = 'MAIN_HUB' | 'COLLECTION_CENTER';

export interface LabFacility {
  id: string;
  name: string;
  type: LabFacilityTier;
  centerType?: LabCenterType;
  parentLabId?: string;
  parentLabName?: string;
  city: string;
  address?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
  phone?: string;
  email: string;
  nablNumber?: string;
  verified: boolean;
  verificationStatus: LabVerificationStatus;
  cutoffWindow?: string;
  rating?: number;
  courierEtaMins?: number;
  payoutProfile?: PayoutProfile;
  createdAt: string;
  updatedAt: string;
}

export type PhlebotomistShiftStatus = 'ONLINE' | 'BREAK' | 'OFFLINE';

export interface PhlebotomistProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: PhlebotomistShiftStatus;
  currentLocation: string;
  latitude?: number;
  longitude?: number;
  batteryPct: number;
  chillerTempCelsius: number;
  coolerBoxId?: string;
  vehicleInfo?: string;
  rating: number;
  totalPickups: number;
  verified: boolean;
  payoutProfile?: PayoutProfile;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRecord {
  id: string;
  name: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone: string;
  email?: string;
  address?: string;
  smallLabId: string;
  totalOrders: number;
  lastVisitAt: string;
  createdAt: string;
  updatedAt: string;
}

export type DiagnosticDepartment =
  | 'Hematology'
  | 'Biochemistry'
  | 'Immunology'
  | 'Molecular'
  | 'Microbiology'
  | 'Pathology'
  | 'Preventive Health';

export type CatalogItemType = 'TEST' | 'PACKAGE';

export interface DiagnosticTestItem {
  id: string;
  code: string;
  name: string;
  itemType?: CatalogItemType;
  includedTestCodes?: string[];
  requiredTubeTypes?: TubeType[];
  description?: string;
  department: DiagnosticDepartment;
  specimenType: SpecimenType;
  tubeType: TubeType;
  temperatureRequirement: StorageTemperature;
  tatHours: number;
  b2bPriceInr: number; // Payable tariff charged to Small Collection Lab
  largeLabB2bRateInr?: number; // Negotiated base B2B settlement rate paid out to Large Reference Lab
  mrpInr: number;
  isActive: boolean;
  labId?: string;
  ownerOrgId?: string;
  labName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticReportRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  smallLabId: string;
  smallLabName: string;
  targetLabId: string;
  targetParentLabId?: string;
  targetLabName: string;
  testsSummary: string;
  pathologistName: string;
  fileName: string;
  downloadUrl: string;
  storagePath: string;
  qualityStatus?: SpecimenQualityStatus;
  turnaroundMinutes?: number;
  verifiedAt: string;
  createdAt: string;
}

export interface SettlementRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  smallLabId: string;
  smallLabName: string;
  targetLabId: string;
  targetParentLabId?: string;
  targetLabName: string;
  dropType?: 'LARGE_LAB' | 'SELF_DROP' | 'CUSTOM_ADDRESS';
  phlebotomistId?: string;
  phlebotomistName?: string;
  grossAmountInr: number;
  platformFeeInr: number;
  labPayoutInr: number;
  phleboPayoutInr: number;
  billingPeriod: string;
  paymentStatus?: 'UNPAID' | 'PAID' | 'FAILED' | 'REFUNDED';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkId?: string;
  paidAt?: string;
  paymentMethod?: string;
  collectedByRole?: 'SMALL_LAB' | 'PHLEBOTOMIST' | 'ADMIN';
  labPayoutStatus?: 'PENDING' | 'PAID';
  phleboPayoutStatus?: 'PENDING' | 'PAID';
  labPayoutRef?: string;
  phleboPayoutRef?: string;
  labPaidAt?: string;
  phleboPaidAt?: string;
  payoutMode?: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX';
  payoutNotes?: string;
  status: 'PENDING' | 'SETTLED';
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutRecord {
  id: string;
  settlementId: string;
  orderId: string;
  orderNumber: string;
  recipientRole: 'LARGE_LAB' | 'PHLEBOTOMIST';
  recipientId: string;
  recipientName: string;
  amountInr: number;
  mode: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX';
  referenceId: string;
  destinationSummary: string;
  gatewayPayoutId?: string;
  status: 'PROCESSED' | 'INITIATED' | 'FAILED';
  processedByEmail: string;
  notes?: string;
  createdAt: string;
}

export interface PlatformSlaConfig {
  temperatureRangeCelsius: { min: number; max: number };
  statPickupSlaMinutes: number;
  autoReassignDelayMinutes: number;
  projectId?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface LargeLabB2bAgreement {
  labId: string;
  labName?: string;
  agreedCommissionPct: number;
  b2bMarkupPct: number;
  minPayoutInr?: number;
  settlementCycle?: 'DAILY' | 'T_PLUS_2' | 'WEEKLY';
  notes?: string;
  updatedAt?: string;
}

export interface CommissionConfig {
  commissionPct: number;
  defaultMarginMode?: 'PCT_OF_GROSS' | 'MARKUP_ON_B2B';
  courierBaseFeeInr: number;
  includedBaseKm?: number;
  perKmFeeInr?: number;
  customDropBaseFeeInr?: number;
  statSurchargeInr: number;
  defaultBroadcastRadiusKm?: number; // 1 to 5 km live trigger radius
  largeLabAgreements?: Record<string, LargeLabB2bAgreement>;
  updatedBy?: string;
  updatedAt: string;
}

