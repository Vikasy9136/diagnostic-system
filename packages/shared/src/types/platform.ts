import { SpecimenQualityStatus, SpecimenType, StorageTemperature, TubeType } from './specimen.js';

export type LabFacilityTier = 'SMALL_LAB' | 'LARGE_LAB';
export type LabVerificationStatus = 'VERIFIED' | 'PENDING' | 'REJECTED';

export interface LabFacility {
  id: string;
  name: string;
  type: LabFacilityTier;
  city: string;
  address?: string;
  phone?: string;
  email: string;
  nablNumber?: string;
  verified: boolean;
  verificationStatus: LabVerificationStatus;
  cutoffWindow?: string;
  rating?: number;
  courierEtaMins?: number;
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
  | 'Pathology';

export interface DiagnosticTestItem {
  id: string;
  code: string;
  name: string;
  department: DiagnosticDepartment;
  specimenType: SpecimenType;
  tubeType: TubeType;
  temperatureRequirement: StorageTemperature;
  tatHours: number;
  b2bPriceInr: number;
  mrpInr: number;
  isActive: boolean;
  labId?: string;
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
  targetLabName: string;
  phlebotomistId?: string;
  phlebotomistName?: string;
  grossAmountInr: number;
  platformFeeInr: number;
  labPayoutInr: number;
  phleboPayoutInr: number;
  billingPeriod: string;
  status: 'PENDING' | 'SETTLED';
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSlaConfig {
  temperatureRangeCelsius: { min: number; max: number };
  statPickupSlaMinutes: number;
  autoReassignDelayMinutes: number;
  projectId?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface CommissionConfig {
  commissionPct: number;
  courierBaseFeeInr: number;
  statSurchargeInr: number;
  updatedBy?: string;
  updatedAt: string;
}

