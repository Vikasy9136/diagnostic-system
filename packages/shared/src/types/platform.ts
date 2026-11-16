import { SpecimenQualityStatus, SpecimenType, StorageTemperature, TubeType } from './specimen.js';
import type { InventoryMaterialCategory } from './inventory.js';

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

export interface LabDocumentRecord {
  id: string;
  type:
  | 'CLINICAL_ESTABLISHMENT_ACT'
  | 'TRADE_LICENSE'
  | 'POLLUTION_CONTROL_NOC'
  | 'NABL_CERT'
  | 'GST_CERTIFICATE'
  | 'PAN_CARD'
  | 'PATHOLOGIST_REG'
  | 'OWNER_ID_PROOF'
  | 'AADHAAR_CARD'
  | 'DRIVING_LICENSE'
  | 'DMLT_CERTIFICATE'
  | 'OTHER';
  title: string;
  url: string;
  fileName?: string;
  uploadedAt: string;
  verified?: boolean;
}

export interface LabFacility {
  id: string;
  userCode?: string;
  userCodeUpper?: string;
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
  serviceZoneId?: string;
  serviceZoneName?: string;
  phone?: string;
  email: string;
  nablNumber?: string;
  verified: boolean;
  verificationStatus: LabVerificationStatus;
  initialPasswordSet?: boolean;
  initialPasswordUpdatedAt?: string;
  cutoffWindow?: string;
  rating?: number;
  courierEtaMins?: number;
  payoutProfile?: PayoutProfile;
  exteriorPhotoUrl?: string;
  interiorPhotoUrl?: string;
  livePhotoUrl?: string;
  photos?: string[];
  documents?: LabDocumentRecord[];
  contactPersonName?: string;
  operatingHours?: string;
  pendingPlatformFeeDueInr?: number;
  unsettledCashSince?: string;
  serviceSuspended?: boolean;
  suspensionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type PhlebotomistShiftStatus = 'ONLINE' | 'BREAK' | 'OFFLINE';

export interface PhlebotomistProfile {
  id: string;
  userCode?: string;
  userCodeUpper?: string;
  name: string;
  phone: string;
  email: string;
  status: PhlebotomistShiftStatus;
  currentLocation: string;
  latitude?: number;
  longitude?: number;
  assignedZoneId?: string;
  assignedZoneCode?: string;
  assignedZoneName?: string;
  assignedCity?: string;
  batteryPct: number;
  chillerTempCelsius: number;
  coolerBoxId?: string;
  vehicleInfo?: string;
  rating: number;
  totalPickups: number;
  verified: boolean;
  verificationStatus?: LabVerificationStatus;
  livePhotoUrl?: string;
  exteriorPhotoUrl?: string;
  interiorPhotoUrl?: string;
  documents?: LabDocumentRecord[];
  payoutProfile?: PayoutProfile;
  pendingPlatformFeeDueInr?: number;
  unsettledCashSince?: string;
  serviceSuspended?: boolean;
  suspensionReason?: string;
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
  paymentStatus?: 'UNPAID' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PAID_TO_LAB';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkId?: string;
  paidAt?: string;
  paymentMethod?: string;
  collectedByRole?: 'SMALL_LAB' | 'PHLEBOTOMIST' | 'ADMIN' | 'PATIENT_DIRECT_LAB';
  labPayoutStatus?: 'PENDING' | 'PAID';
  phleboPayoutStatus?: 'PENDING' | 'PAID';
  labPayoutRef?: string;
  phleboPayoutRef?: string;
  labPaidAt?: string;
  phleboPaidAt?: string;
  payoutMode?: 'UPI' | 'IMPS' | 'NEFT' | 'RAZORPAYX';
  payoutNotes?: string;
  completedAt?: string;
  payoutDueAt?: string;
  payoutWindowMinutes?: number;
  instantPayoutEligible?: boolean;
  instantPayoutAutoTriggered?: boolean;
  cashPlatformFeePendingInr?: number;
  cashPlatformFeeStatus?: 'DUE' | 'SETTLED' | 'OFFSET_AGAINST_NEXT_PAYOUT';
  cashSettledDirectly?: boolean;
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
  grossAmountInr?: number;
  deductedPlatformFeeOffsetInr?: number;
  netPayoutInr?: number;
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

export type PlatformBillingMode =
  | 'INSTANT_30M_PAYOUT'
  | 'SUBSCRIPTION_AND_PLATFORM_FEES'
  | 'FULL_B2B_SPLIT';

export interface CommissionConfig {
  commissionPct: number;
  defaultMarginMode?: 'PCT_OF_GROSS' | 'MARKUP_ON_B2B';
  billingMode?: PlatformBillingMode;
  hideSubscriptionsUi?: boolean;
  enableSubscriptionsModule?: boolean;
  enablePatientPaymentSplitting?: boolean;
  enablePartnerLabPayouts?: boolean;
  instantPayoutEnabled?: boolean;
  instantPayoutWindowMinutes?: number;
  autoReleaseInstantPayouts?: boolean;
  platformServiceFeePct?: number;
  defaultSubscriptionGraceDays?: number;
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

// ---------------------------------------------------------------------------
// Kit & Vacutainer Central Inventory Architecture (Admin Central Supply Chain)
// Note: InventoryMaterialCategory is canonical in ./inventory.ts
// ---------------------------------------------------------------------------

export interface InventoryMaterialItem {
  id: string;
  name: string;
  category: InventoryMaterialCategory;
  tubeType?: TubeType;
  unit: 'PIECE' | 'ROLL' | 'BOX' | 'PACK';
  unitsPerPack: number;
  currentStock: number; // In individual units (e.g. 500 tubes, 2000 stickers)
  reorderThreshold: number;
  costPerUnitInr: number;
  vendorName: string;
  batchNumber: string;
  expiryDate: string;
  iconEmoji: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KitBomComponent {
  materialId: string;
  materialName: string;
  category: InventoryMaterialCategory;
  quantity: number;
  unit: string;
  tubeType?: TubeType;
}

export interface InventoryKitItem {
  id: string;
  kitCode: string; // e.g. KIT-HEM-CBC
  kitName: string; // e.g. Hematology CBC Specimen Kit
  category: string; // e.g. Hematology, Biochemistry, Metabolic
  description: string;
  targetTestCodes: string[];
  billOfMaterials: KitBomComponent[];
  currentAssembledStock: number;
  reorderThreshold: number;
  costPerKitInr: number;
  iconEmoji: string;
  colorBadge: string;
  createdAt: string;
  updatedAt: string;
}

export interface KitAllocationManifestItem {
  materialId: string;
  materialName: string;
  category: InventoryMaterialCategory;
  quantity: number;
  unit: string;
  iconEmoji?: string;
  tubeType?: TubeType;
}

export interface KitAllocationRecord {
  id: string;
  phlebotomistId: string;
  phlebotomistName: string;
  phlebotomistPhone?: string;
  kitId: string;
  kitCode: string;
  kitName: string;
  quantityAllocated: number;
  quantityConsumed: number;
  quantityOnHand: number;
  allocatedAt: string;
  status: 'DISPATCHED' | 'RECEIVED' | 'DEPLETED';
  dispatchedBy: string;
  notes?: string;
  itemsManifest?: KitAllocationManifestItem[];
}

export interface VendorPurchaseItem {
  materialId: string;
  materialName: string;
  category: InventoryMaterialCategory;
  quantity: number;
  unit: string;
  unitPriceInr: number;
  totalInr: number;
  batchNumber: string;
  expiryDate: string;
}

export interface VendorPurchaseRecord {
  id: string;
  poNumber: string;
  vendorName: string;
  vendorPhone?: string;
  vendorGstin?: string;
  invoiceNumber?: string;
  items: VendorPurchaseItem[];
  totalAmountInr: number;
  purchasedAt: string;
  status: 'ORDERED' | 'RECEIVED' | 'CANCELLED';
  receivedAt?: string;
  notes?: string;
}

export interface SupportContactsConfig {
  emergencyPhone: string;
  displayEmergencyPhone: string;
  dispatchMobile: string;
  displayDirectMobile: string;
  supportEmail: string;
  operatingHours: string;
  dispatchSla: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SUPPORT_CONTACTS: SupportContactsConfig = {
  emergencyPhone: '+9118008897388',
  displayEmergencyPhone: '1800-889-SETU (1800-889-7388)',
  dispatchMobile: '+919820012345',
  displayDirectMobile: '+91 98200 12345',
  supportEmail: 'support@labsetu.com',
  operatingHours: '6:00 AM – 11:00 PM (All 7 Days)',
  dispatchSla: '< 5 Mins Immediate Dispatch Response',
};


