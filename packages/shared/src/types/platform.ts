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
  signedAgreementUrl?: string;
  signerName?: string;
  signedAt?: string;
  onboardedByEmail?: string;
  onboardedByName?: string;
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
  dlNumber?: string;
  vehicleNumber?: string;
  vehicleType?: 'BIKE' | 'SCOOTER' | 'EV_BIKE' | 'BICYCLE' | 'OTHER';
  aadhaarNumber?: string;
  panNumber?: string;
  dlDocumentUrl?: string;
  rcDocumentUrl?: string;
  aadhaarDocumentUrl?: string;
  panDocumentUrl?: string;
  signedAgreementUrl?: string;
  signerName?: string;
  signedAt?: string;
  onboardedByEmail?: string;
  onboardedByName?: string;
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
  rateModel?: 'FIXED' | 'COMMISSION_PCT' | 'CUSTOM' | string;
  smallLabPayableInr?: number;
  largeLabRateInr?: number;
  routeMaxKm?: number;
  urgency?: 'Routine' | 'Priority' | 'Express' | string;
  status?: 'ACTIVE' | 'PAUSED';
  notes?: string;
  updatedAt?: string;
}

export type PlatformBillingMode =
  | 'INSTANT_30M_PAYOUT'
  | 'SUBSCRIPTION_AND_PLATFORM_FEES'
  | 'FULL_B2B_SPLIT';

export interface CommissionConfig {
  commissionPct: number;
  phleboFeePct?: number; // Fee % deducted from Phlebo courier payout (e.g. 5%)
  smallLabFeePct?: number; // Fee % deducted from Small Lab share (e.g. 5%)
  largeLabFeePct?: number; // Fee % deducted from Large Lab share (e.g. 5%)
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
  defaultBroadcastRadiusKm?: number; // Live rider broadcast min km (e.g. 3 km)
  broadcastRadiusMaxKm?: number; // Live rider broadcast max km (e.g. 15 km)
  largeLabAgreements?: Record<string, LargeLabB2bAgreement>;
  updatedBy?: string;
  updatedAt: string;
}

export type AgreementRoleTarget = 'PHLEBOTOMIST' | 'SMALL_LAB' | 'LARGE_LAB';

export interface RoleAgreementTemplate {
  id: string;
  roleTarget: AgreementRoleTarget;
  title: string;
  version: string;
  description: string;
  templateFileUrl: string;
  fileName: string;
  fileSizeBytes?: number;
  isActive: boolean;
  requiredFields?: string[];
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
}

export interface AreaExpansionRequest {
  id: string;
  proposedZoneName: string;
  city: string;
  state: string;
  pincodes: string[];
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  targetLabsCount?: number;
  potentialMonthlyVolume?: number;
  justification: string;
  submittedByEmail: string;
  submittedByName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedZoneId?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
  createdAt: string;
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

export interface PlatformFeaturesConfig {
  enableBarcodeScanner: boolean; // default false
  enableFloatingIcon: boolean; // default true
  enableCashCollection: boolean; // default true
  enableDirectLabPayment: boolean; // default true
  enableInstantPayout: boolean; // default true
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_PLATFORM_FEATURES: PlatformFeaturesConfig = {
  enableBarcodeScanner: false,
  enableFloatingIcon: true,
  enableCashCollection: true,
  enableDirectLabPayment: true,
  enableInstantPayout: true,
};

export interface SopStepItem {
  title: string;
  description: string;
  warning?: string;
  tip?: string;
  tag?: string;
  tagColor?: string;
}

export interface PlatformSopDocument {
  id: string;
  category: 'draw' | 'cold' | 'photo' | 'safety' | 'general';
  number: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  icon?: string;
  steps: SopStepItem[];
  isActive: boolean;
  orderIndex: number;
  targetRoles: Array<'SMALL_LAB' | 'LARGE_LAB' | 'PHLEBOTOMIST' | 'ADMIN' | 'ALL'>;
  updatedAt: string;
  updatedBy?: string;
}

export interface PlatformFaqDocument {
  id: string;
  category: 'General' | 'Dispatch' | 'Cold-Chain' | 'Payments' | 'Payouts' | 'Supplies';
  question: string;
  answer: string;
  orderIndex: number;
  isActive: boolean;
  targetRoles: Array<'SMALL_LAB' | 'LARGE_LAB' | 'PHLEBOTOMIST' | 'ADMIN' | 'ALL'>;
  updatedAt: string;
  updatedBy?: string;
}

export interface PaymentSlipData {
  receiptNumber: string;
  paymentId: string;
  orderId: string;
  orderNumber: string;
  paidAt: string;
  paymentMethod: string;
  amountInr: number;
  payerName: string;
  payerRole: string;
  payerId?: string;
  payerPhone?: string;
  payerAddress?: string;
  receiverName: string;
  receiverRole: string;
  receiverId?: string;
  receiverAddress?: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientId?: string;
  items: Array<{
    code: string;
    name: string;
    specimenType?: string;
    rateInr: number;
  }>;
  logisticsFeeInr?: number;
  subtotalInr: number;
  totalAmountInr: number;
  status: 'PAID';
  notes?: string;
  feeBreakdown?: {
    phleboGrossInr: number;
    phleboFeePct: number;
    phleboFeeDeductionInr: number;
    phleboNetPayoutInr: number;
    smallLabGrossInr: number;
    smallLabFeePct: number;
    smallLabFeeDeductionInr: number;
    smallLabNetShareInr: number;
    adminPlatformFeeInr: number;
    adminFeePct: number;
    largeLabPayoutInr?: number;
  };
}

export const DEFAULT_PLATFORM_SOPS: PlatformSopDocument[] = [
  {
    id: 'sop-draw',
    category: 'draw',
    number: 'SOP 01',
    title: 'CLSI Correct Order of Draw (Blood Tube Sequence)',
    subtitle: 'Standard Sequence to prevent anticoagulant additive cross-contamination',
    badge: 'MANDATORY NABL',
    badgeColor: '#DC2626',
    icon: 'test-tube',
    isActive: true,
    orderIndex: 1,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
    steps: [
      {
        title: '1. Yellow Top / Sterile Blood Culture',
        description: 'First to draw to preserve sterile vacuum. Invert gently 8-10 times.',
        tag: 'Invert 8-10x',
        tagColor: '#CA8A04',
      },
      {
        title: '2. Light Blue Top (Sodium Citrate 3.2%)',
        description: 'Coagulation panels (PT/INR, APTT). Fill strictly to mark (9:1 ratio).',
        warning: 'CRITICAL: Underfilled or overfilled tubes will be automatically rejected by testing lab.',
        tag: 'Invert 3-4x',
        tagColor: '#2563EB',
      },
      {
        title: '3. Gold / Red Top (SST Clot Activator & Gel)',
        description: 'Biochemistry, Serology, Hormones, LFT, KFT. Invert 5 times.',
        tip: 'Allow tube to clot upright for 30 minutes before placing into chiller box.',
        tag: 'Invert 5x',
        tagColor: '#D97706',
      },
      {
        title: '4. Purple / Lavender Top (K2/K3 EDTA)',
        description: 'Complete Blood Count (CBC), ESR, HbA1c. Invert 8 to 10 times thoroughly.',
        warning: 'Never shake aggressively; vigorous shaking causes in-transit hemolysis.',
        tag: 'Invert 8-10x',
        tagColor: '#9333EA',
      },
      {
        title: '5. Grey Top (Sodium Fluoride / Potassium Oxalate)',
        description: 'Fasting Blood Sugar (FBS), PPBS, Glucose. Invert 8 to 10 times.',
        tag: 'Invert 8-10x',
        tagColor: '#64748B',
      },
    ],
  },
  {
    id: 'sop-cold',
    category: 'cold',
    number: 'SOP 02',
    title: 'Cold-Chain & Chiller Box Temperature SOP',
    subtitle: 'Preserve specimen integrity between +2°C and +8°C at all transit moments',
    badge: 'COLD-CHAIN COMPLIANCE',
    badgeColor: '#0284C7',
    icon: 'snowflake',
    isActive: true,
    orderIndex: 2,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
    steps: [
      {
        title: 'Pre-Conditioning Gel Ice Packs',
        description: 'Gel ice packs must be frozen at -20°C for 24 hours and sweating for 5 mins before bag loading.',
        tag: '+2°C to +8°C',
        tagColor: '#0284C7',
      },
      {
        title: 'Insulated Transit Separation Barrier',
        description: 'Never place blood vacutainers in direct contact with frozen ice bricks. Use insulated bubble-wrap divider.',
        warning: 'Direct contact with ice brick freezes whole blood and destroys red blood cells (hemolysis).',
      },
      {
        title: 'Digital Temperature Data Logger Verification',
        description: 'Verify digital thermometer display upon pickup and before lab handover.',
        tip: 'If box temperature exceeds 8°C, notify Central Dispatch immediately via Emergency SOS.',
      },
    ],
  },
  {
    id: 'sop-handover',
    category: 'safety',
    number: 'SOP 03',
    title: 'Digital Chain of Custody & OTP Handover Protocol',
    subtitle: 'Step-by-step verified sample intake and phlebotomist handover',
    badge: 'SECURITY AUDIT',
    badgeColor: '#059669',
    icon: 'shield-check',
    isActive: true,
    orderIndex: 3,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
    steps: [
      {
        title: '1. Barcode Scanning at Referring Center',
        description: 'Referring clinic scans printed vacutainer barcodes and attaches self-QC confirmation.',
      },
      {
        title: '2. Rider Identity Verification & OTP Matching',
        description: 'Rider displays digital LabSetu ID and enters the 5-digit Handover Receiving OTP.',
      },
      {
        title: '3. Testing Hub Accessioning & Acceptance',
        description: 'Receiving lab technician checks physical integrity, verifies seal, and accepts batch.',
      },
    ],
  },
];

export const DEFAULT_PLATFORM_FAQS: PlatformFaqDocument[] = [
  {
    id: 'faq-1',
    category: 'Dispatch',
    question: 'What if patient is unreachable or clinic address is incorrect?',
    answer: 'Attempt at least 2 phone calls with a 3-minute gap. If still unreachable, tap "Report Issue" in order details and select "Customer Unreachable". Central Dispatch will verify the alternative contact number or re-route your delivery.',
    orderIndex: 1,
    isActive: true,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
  {
    id: 'faq-2',
    category: 'Cold-Chain',
    question: 'What if sample tube breaks or chiller temperature rises above 8°C?',
    answer: 'Immediately pull the emergency SOS banner or call Dispatch. Never deliver a hemolyzed, leaked, or warm sample to the Reference Lab. Central Supply will arrange an immediate recollection kit for the patient.',
    orderIndex: 2,
    isActive: true,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
  {
    id: 'faq-3',
    category: 'Payments',
    question: 'How do Online Payments, Razorpay, and Lab Invoicing work?',
    answer: 'Small Labs can pay immediately via Razorpay UPI / Cards / Net Banking upon booking, or choose Lab Invoicing for consolidated weekly/monthly settlements. When payment completes, an authorized GST payment receipt is instantly generated and archived.',
    orderIndex: 3,
    isActive: true,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
  {
    id: 'faq-4',
    category: 'Payouts',
    question: 'When will the 30-minute instant courier payout be released?',
    answer: 'As soon as the 5-digit Handover OTP is accepted at the Reference Lab desk and the lab accepts the batch, the 30-minute instant payout countdown activates. Funds are dispatched directly to the registered UPI ID or Bank account.',
    orderIndex: 4,
    isActive: true,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
  {
    id: 'faq-5',
    category: 'Supplies',
    question: 'How do I replenish my collection vacutainers and biohazard bags?',
    answer: 'Navigate to "My Collection Kits & Supplies" screen and tap "Request Kit Restock". Central Supply prepares sealed kits (1 Collection = 1 Kit) and dispatches them during your morning shift check-in.',
    orderIndex: 5,
    isActive: true,
    targetRoles: ['ALL'],
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
];


