import {
  CommissionConfig,
  DiagnosticDepartment,
  DiagnosticTestItem,
  DropDestinationType,
  LabFacility,
  OrderPriority,
  ServiceZoneRecord,
  SpecimenItem,
  SpecimenType,
  StorageTemperature,
  TubeType,
} from '../types/index.js';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocalityPreset {
  label: string;
  city: string;
  latitude: number;
  longitude: number;
}

export const LOCALITY_GPS_PRESETS: LocalityPreset[] = [
  { label: 'Andheri West, Mumbai', city: 'Mumbai', latitude: 19.1363, longitude: 72.8277 },
  { label: 'Powai / Vikhroli, Mumbai', city: 'Mumbai', latitude: 19.1197, longitude: 72.9051 },
  { label: 'Dadar / Parel, Mumbai', city: 'Mumbai', latitude: 19.0178, longitude: 72.8478 },
  { label: 'Bandra / Kurla BKC, Mumbai', city: 'Mumbai', latitude: 19.0653, longitude: 72.8682 },
  { label: 'Thane West', city: 'Thane', latitude: 19.2183, longitude: 72.9781 },
  { label: 'Vashi, Navi Mumbai', city: 'Navi Mumbai', latitude: 19.0745, longitude: 72.9978 },
  { label: 'Shivajinagar, Pune', city: 'Pune', latitude: 18.5308, longitude: 73.8475 },
  { label: 'Connaught Place, New Delhi', city: 'New Delhi', latitude: 28.6315, longitude: 77.2167 },
  { label: 'Indiranagar, Bengaluru', city: 'Bengaluru', latitude: 12.9784, longitude: 77.6408 },
];

export const TUBE_METADATA: Record<
  TubeType,
  {
    label: string;
    shortTag: string;
    capColorName: string;
    colorHex: string;
    bgHex: string;
    additive: string;
    commonTests: string[];
  }
> = {
  [TubeType.EDTA_LAVENDER]: {
    label: 'EDTA (Lavender / Purple Cap)',
    shortTag: 'EDTA',
    capColorName: 'Purple Cap',
    colorHex: '#7C3AED',
    bgHex: '#F5F3FF',
    additive: 'K2/K3 EDTA Whole Blood',
    commonTests: ['CBC', 'HB', 'ESR', 'HBA1C', 'PLATELET', 'PS', 'MALARIA'],
  },
  [TubeType.SERUM_RED_GOLD]: {
    label: 'Serum SST (Red / Gold Cap)',
    shortTag: 'SST',
    capColorName: 'Red / Yellow Cap',
    colorHex: '#DC2626',
    bgHex: '#FEF2F2',
    additive: 'Clot Activator / Gel Separator',
    commonTests: ['LFT', 'KFT', 'RFT', 'LIPID', 'TSH', 'T3', 'T4', 'VITD', 'B12', 'CRP', 'WIDAL'],
  },
  [TubeType.SODIUM_FLUORIDE_GREY]: {
    label: 'Sodium Fluoride (Grey Cap)',
    shortTag: 'FLU',
    capColorName: 'Grey Cap',
    colorHex: '#475569',
    bgHex: '#F1F5F9',
    additive: 'Fluoride Oxalate (Glucose)',
    commonTests: ['FBS', 'PPBS', 'RBS', 'GLUCOSE', 'GTT', 'LACTATE'],
  },
  [TubeType.SODIUM_CITRATE_BLUE]: {
    label: 'Sodium Citrate (Light Blue Cap)',
    shortTag: 'CIT',
    capColorName: 'Light Blue Cap',
    colorHex: '#2563EB',
    bgHex: '#EFF6FF',
    additive: '3.2% Buffered Sodium Citrate',
    commonTests: ['PT', 'INR', 'APTT', 'DDIMER', 'COAG', 'FIBRINOGEN'],
  },
  [TubeType.HEPARIN_GREEN]: {
    label: 'Lithium Heparin (Green Cap)',
    shortTag: 'HEP',
    capColorName: 'Green Cap',
    colorHex: '#059669',
    bgHex: '#ECFDF5',
    additive: 'Sodium / Lithium Heparin',
    commonTests: ['AMMONIA', 'ELECTROLYTES', 'ABG', 'CHROMOSOME', 'KARYOTYPE'],
  },
  [TubeType.URINE_CONTAINER]: {
    label: 'Sterile Urine / Stool Container',
    shortTag: 'URN',
    capColorName: 'Yellow / White Container',
    colorHex: '#D97706',
    bgHex: '#FFFBEB',
    additive: 'Sterile Leak-Proof Cup',
    commonTests: ['URINE', 'RME', 'URE', 'MICROALBUMIN', 'UCULTURE', 'STOOL'],
  },
  [TubeType.VIRAL_TRANSPORT_MEDIA]: {
    label: 'Viral Transport Media / Swab (VTM)',
    shortTag: 'VTM',
    capColorName: 'Pink / VTM Swab',
    colorHex: '#DB2777',
    bgHex: '#FDF2F8',
    additive: 'Viral / Molecular Transport Medium',
    commonTests: ['RTPCR', 'COVID', 'H1N1', 'INFLUENZA', 'SWAB', 'HPV'],
  },
};

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle Haversine distance in kilometers rounded to 2 decimal places.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return 0;
  }
  const R = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLng = degToRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function inferRequiredTubeForTestCode(
  testCode?: string,
  fallbackTube?: TubeType
): TubeType {
  const code = (testCode || '').trim().toUpperCase();
  if (!code) return fallbackTube || TubeType.SERUM_RED_GOLD;

  for (const [tube, meta] of Object.entries(TUBE_METADATA) as [
    TubeType,
    (typeof TUBE_METADATA)[TubeType]
  ][]) {
    if (meta.commonTests.some((kw) => code === kw || code.includes(kw))) {
      return tube;
    }
  }
  return fallbackTube || TubeType.SERUM_RED_GOLD;
}

export interface InferredCatalogDefaults {
  department: DiagnosticDepartment;
  specimenType: SpecimenType;
  tubeType: TubeType;
  temperatureRequirement: StorageTemperature;
  suggestedName?: string;
}

const KNOWN_CATALOG_NAMES: Record<string, string> = {
  CBC: 'Complete Blood Count (CBC)',
  HB: 'Hemoglobin (Hb)',
  ESR: 'Erythrocyte Sedimentation Rate (ESR)',
  HBA1C: 'Glycosylated Hemoglobin (HbA1c)',
  LFT: 'Liver Function Test (LFT)',
  KFT: 'Kidney Function Test (KFT)',
  RFT: 'Renal Function Test (RFT)',
  LIPID: 'Lipid Profile',
  TSH: 'Thyroid Stimulating Hormone (TSH)',
  TFT: 'Thyroid Function Test (T3, T4, TSH)',
  FBS: 'Fasting Blood Sugar (FBS)',
  PPBS: 'Post-Prandial Blood Sugar (PPBS)',
  RBS: 'Random Blood Sugar (RBS)',
  PT: 'Prothrombin Time (PT)',
  INR: 'Prothrombin Time / INR',
  APTT: 'Activated Partial Thromboplastin Time (aPTT)',
  CRP: 'C-Reactive Protein (CRP)',
  VITD: 'Vitamin D (25-OH)',
  B12: 'Vitamin B12',
  URINE: 'Urine Routine & Microscopy',
  RTPCR: 'RT-PCR Viral Molecular Panel',
};

export function inferCatalogDefaultsForCode(rawCode?: string): InferredCatalogDefaults {
  const code = String(rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

  const tubeType = inferRequiredTubeForTestCode(code, TubeType.SERUM_RED_GOLD);

  let specimenType: SpecimenType = SpecimenType.SERUM;
  if (tubeType === TubeType.URINE_CONTAINER) {
    specimenType = code.includes('STOOL') ? SpecimenType.OTHER : SpecimenType.URINE;
  } else if (tubeType === TubeType.VIRAL_TRANSPORT_MEDIA) {
    specimenType = SpecimenType.SWAB;
  } else if (
    tubeType === TubeType.SODIUM_FLUORIDE_GREY ||
    tubeType === TubeType.SODIUM_CITRATE_BLUE ||
    tubeType === TubeType.HEPARIN_GREEN
  ) {
    specimenType = SpecimenType.PLASMA;
  } else if (tubeType === TubeType.EDTA_LAVENDER) {
    specimenType = SpecimenType.BLOOD;
  } else {
    specimenType = SpecimenType.SERUM;
  }

  let department: DiagnosticDepartment = 'Biochemistry';
  if (
    /^(CBC|HB(?=$|[_-])|ESR|PLATELET|PS(?=$|[_-])|PT(?=$|[_-])|INR|APTT|DDIMER|COAG|FIBRINOGEN)/.test(
      code
    )
  ) {
    department = 'Hematology';
  } else if (/^(TSH|T3|T4|TFT|VITD|B12|CRP|WIDAL|DENGUE|MALARIA|HIV|HBSAG)/.test(code)) {
    department = 'Immunology';
  } else if (/^(RTPCR|COVID|HPV|H1N1|CHROMOSOME|KARYOTYPE)/.test(code)) {
    department = 'Molecular';
  } else if (/(CULTURE|SENSITIVITY)/.test(code)) {
    department = 'Microbiology';
  } else if (/^(EXEC|WELL|MASTER|PKG|HEALTH|ANNUAL|FULLBODY)/.test(code)) {
    department = 'Preventive Health';
  } else if (/^(HISTO|BIOPSY|CYTO|PAP)/.test(code)) {
    department = 'Pathology';
  }

  const temperatureRequirement: StorageTemperature =
    /^(AMMONIA|LACTATE|INSULIN|FROZEN)/.test(code)
      ? StorageTemperature.FROZEN
      : StorageTemperature.REFRIGERATED;

  const exactMatchKey = Object.keys(KNOWN_CATALOG_NAMES).find(
    (k) => code === k || (k.length >= 3 && code.startsWith(k))
  );

  return {
    department,
    specimenType,
    tubeType,
    temperatureRequirement,
    suggestedName: exactMatchKey ? KNOWN_CATALOG_NAMES[exactMatchKey] : undefined,
  };
}

export function extractTubeTagFromBarcode(barcode: string): TubeType | null {
  const upper = (barcode || '').trim().toUpperCase();
  if (!upper) return null;

  if (/(^|[-_])(EDTA|LAVENDER|PURPLE)([-_]|$)/.test(upper)) {
    return TubeType.EDTA_LAVENDER;
  }
  if (/(^|[-_])(SST|SERUM|RED|GOLD)([-_]|$)/.test(upper)) {
    return TubeType.SERUM_RED_GOLD;
  }
  if (/(^|[-_])(FLU|FLUORIDE|GREY|GRAY)([-_]|$)/.test(upper)) {
    return TubeType.SODIUM_FLUORIDE_GREY;
  }
  if (/(^|[-_])(CIT|CITRATE|BLUE)([-_]|$)/.test(upper)) {
    return TubeType.SODIUM_CITRATE_BLUE;
  }
  if (/(^|[-_])(HEP|HEPARIN|GREEN)([-_]|$)/.test(upper)) {
    return TubeType.HEPARIN_GREEN;
  }
  if (/(^|[-_])(URN|URINE|STOOL|CUP)([-_]|$)/.test(upper)) {
    return TubeType.URINE_CONTAINER;
  }
  if (/(^|[-_])(VTM|SWAB|RTPCR)([-_]|$)/.test(upper)) {
    return TubeType.VIRAL_TRANSPORT_MEDIA;
  }

  for (const [tube, meta] of Object.entries(TUBE_METADATA) as [
    TubeType,
    (typeof TUBE_METADATA)[TubeType]
  ][]) {
    if (
      meta.commonTests.some((kw) => {
        const rx = new RegExp(`(^|[-_])${kw}([-_]|$)`);
        return rx.test(upper);
      })
    ) {
      return tube;
    }
  }
  return null;
}

export interface TubeValidationResult {
  valid: boolean;
  status: 'VERIFIED' | 'MISMATCH' | 'PENDING';
  expectedTube: TubeType;
  detectedTube: TubeType;
  message: string;
}

/**
 * Verifies scanned specimen barcode and physical tube cap against test requirements
 * and checks across sibling tubes in the same order for tube-type conflicts.
 */
export function validateTubeBarcodeScan(params: {
  scannedBarcode: string;
  expectedSpecimen: Pick<SpecimenItem, 'id' | 'barcode' | 'testCode' | 'testName' | 'tubeType'>;
  selectedTubeUsed?: TubeType;
  siblingSpecimens?: Array<
    Pick<SpecimenItem, 'id' | 'testCode' | 'tubeType' | 'scannedBarcode' | 'scannedTubeType'>
  >;
}): TubeValidationResult {
  const clean = params.scannedBarcode.trim();
  const expectedTube =
    params.expectedSpecimen.tubeType ||
    inferRequiredTubeForTestCode(params.expectedSpecimen.testCode);
  const expectedMeta = TUBE_METADATA[expectedTube];

  if (clean.length < 4) {
    return {
      valid: false,
      status: 'PENDING',
      expectedTube,
      detectedTube: params.selectedTubeUsed || expectedTube,
      message: `Scan or enter a valid barcode (min 4 chars) for ${params.expectedSpecimen.testCode} (${expectedMeta.capColorName}).`,
    };
  }

  const tagFromBarcode = extractTubeTagFromBarcode(clean);
  const effectiveTube = params.selectedTubeUsed || tagFromBarcode || expectedTube;

  if (tagFromBarcode && tagFromBarcode !== expectedTube) {
    const barcodeMeta = TUBE_METADATA[tagFromBarcode];
    return {
      valid: false,
      status: 'MISMATCH',
      expectedTube,
      detectedTube: tagFromBarcode,
      message: `Tube mismatch! ${params.expectedSpecimen.testCode} requires ${expectedMeta.label}, but barcode "${clean}" maps to ${barcodeMeta.label}.`,
    };
  }

  if (effectiveTube !== expectedTube) {
    const usedMeta = TUBE_METADATA[effectiveTube];
    return {
      valid: false,
      status: 'MISMATCH',
      expectedTube,
      detectedTube: effectiveTube,
      message: `Wrong tube selected for ${params.expectedSpecimen.testCode}! Expected ${expectedMeta.label}, got ${usedMeta.label}.`,
    };
  }

  const normalizedUpper = clean.toUpperCase();
  const conflictingSibling = (params.siblingSpecimens || []).find((sib) => {
    if (sib.id === params.expectedSpecimen.id) return false;
    const sibCode = (sib.scannedBarcode || '').trim().toUpperCase();
    if (!sibCode || sibCode !== normalizedUpper) return false;
    return sib.tubeType !== expectedTube;
  });

  if (conflictingSibling) {
    return {
      valid: false,
      status: 'MISMATCH',
      expectedTube,
      detectedTube: effectiveTube,
      message: `Duplicate barcode conflict: "${clean}" is already scanned for ${conflictingSibling.testCode} (${TUBE_METADATA[conflictingSibling.tubeType].label}), which uses a different tube cap.`,
    };
  }

  return {
    valid: true,
    status: 'VERIFIED',
    expectedTube,
    detectedTube: effectiveTube,
    message: `Matched ${expectedMeta.label} (${expectedMeta.shortTag}) for ${params.expectedSpecimen.testCode}.`,
  };
}

export interface OrderPricingSplitInput {
  smallLabTestTotalInr: number;
  largeLabB2bTotalInr?: number;
  commissionConfig: CommissionConfig;
  targetLabId?: string;
  priority: OrderPriority;
  distanceKm?: number;
  dropType?: DropDestinationType;
}

export interface OrderPricingSplitResult {
  smallLabTestTotalInr: number;
  courierFeeInr: number;
  baseCourierInr: number;
  extraDistanceKm: number;
  distanceFeeInr: number;
  statSurchargeInr: number;
  grossAmountInr: number;
  platformFeeInr: number;
  labPayoutInr: number;
  phleboPayoutInr: number;
  appliedCommissionPct: number;
}

/**
 * Computes transparent B2B split:
 * Small Lab Payable = Test Tariff + Distance-Adjusted Courier Fee (+ STAT surcharge)
 * Phlebo Payout = Courier Fee
 * Large Lab Payout = Negotiated B2B Share (or Test Tariff minus Agreed Commission%)
 * LabSetu Platform Fee = Gross - Large Lab Payout - Phlebo Payout
 */
export function computeOrderPricingSplit(
  input: OrderPricingSplitInput
): OrderPricingSplitResult {
  const dropType = input.dropType || 'LARGE_LAB';
  const baseFee =
    dropType === 'LARGE_LAB'
      ? Math.max(0, input.commissionConfig.courierBaseFeeInr || 250)
      : Math.max(
          0,
          input.commissionConfig.customDropBaseFeeInr ??
            Math.round((input.commissionConfig.courierBaseFeeInr || 250) * 0.8)
        );

  const includedKm = Math.max(0, input.commissionConfig.includedBaseKm ?? 5);
  const perKmFee = Math.max(0, input.commissionConfig.perKmFeeInr ?? 20);
  const rawKm = Math.max(0, input.distanceKm ?? 0);
  const extraDistanceKm = Math.max(0, Math.round((rawKm - includedKm) * 100) / 100);
  const distanceFeeInr = Math.round(extraDistanceKm * perKmFee);
  const statSurchargeInr =
    input.priority === OrderPriority.STAT_CRITICAL
      ? Math.max(0, input.commissionConfig.statSurchargeInr || 0)
      : 0;

  const courierFeeInr = baseFee + distanceFeeInr + statSurchargeInr;
  const smallLabTestTotalInr = Math.max(0, Math.round(input.smallLabTestTotalInr || 0));
  const grossAmountInr = smallLabTestTotalInr + courierFeeInr;

  const agreement = input.targetLabId
    ? input.commissionConfig.largeLabAgreements?.[input.targetLabId]
    : undefined;
  const appliedCommissionPct =
    agreement?.agreedCommissionPct ?? input.commissionConfig.commissionPct ?? 15;

  if (dropType !== 'LARGE_LAB') {
    const platformFeeInr = Math.round(
      (grossAmountInr * Math.min(30, Math.max(0, appliedCommissionPct))) / 100
    );
    const phleboPayoutInr = Math.max(0, grossAmountInr - platformFeeInr);
    return {
      smallLabTestTotalInr,
      courierFeeInr,
      baseCourierInr: baseFee,
      extraDistanceKm,
      distanceFeeInr,
      statSurchargeInr,
      grossAmountInr,
      platformFeeInr,
      labPayoutInr: 0,
      phleboPayoutInr,
      appliedCommissionPct,
    };
  }

  let labPayoutInr: number;
  let platformFeeInr: number;

  if (
    typeof input.largeLabB2bTotalInr === 'number' &&
    input.largeLabB2bTotalInr >= 0 &&
    input.largeLabB2bTotalInr < smallLabTestTotalInr
  ) {
    labPayoutInr = Math.round(input.largeLabB2bTotalInr);
    platformFeeInr = Math.max(0, smallLabTestTotalInr - labPayoutInr);
  } else {
    platformFeeInr = Math.round((smallLabTestTotalInr * appliedCommissionPct) / 100);
    labPayoutInr = Math.max(0, smallLabTestTotalInr - platformFeeInr);
  }

  return {
    smallLabTestTotalInr,
    courierFeeInr,
    baseCourierInr: baseFee,
    extraDistanceKm,
    distanceFeeInr,
    statSurchargeInr,
    grossAmountInr,
    platformFeeInr,
    labPayoutInr,
    phleboPayoutInr: courierFeeInr,
    appliedCommissionPct,
  };
}

export interface LargeLabCenterDistanceOption {
  lab: LabFacility;
  distanceKm: number;
  estimatedEtaMins: number;
}

export interface MatchedPackageSummary {
  catalogItemId: string;
  code: string;
  name: string;
  priceInr: number;
  largeLabB2bRateInr: number;
  coveredRequestedCodes: string[];
  allIncludedCodes: string[];
  savingsInr: number;
}

export interface LargeLabComparisonQuote {
  orgLabId: string;
  orgLabName: string;
  nablNumber?: string;
  centers: LargeLabCenterDistanceOption[];
  nearestCenter: LabFacility;
  nearestDistanceKm: number;
  requestedCodes: string[];
  coveredCodes: string[];
  missingCodes: string[];
  coverageRatio: number;
  matchedPackages: MatchedPackageSummary[];
  matchedIndividualTests: DiagnosticTestItem[];
  individualBaselineInr: number;
  smallLabTestTotalInr: number;
  largeLabB2bTotalInr: number;
  packageSavingsInr: number;
  pricingSplit: OrderPricingSplitResult;
  totalPayableInr: number;
}

function getEffectiveSmallLabPrice(
  item: DiagnosticTestItem,
  agreement?: { b2bMarkupPct?: number }
): number {
  if (typeof item.b2bPriceInr === 'number' && item.b2bPriceInr > 0) {
    return Math.round(item.b2bPriceInr);
  }
  const baseB2b = item.largeLabB2bRateInr || 0;
  const markup = agreement?.b2bMarkupPct ?? 0;
  return Math.round(baseB2b * (1 + markup / 100));
}

function getEffectiveLargeLabRate(
  item: DiagnosticTestItem,
  commissionPct: number
): number {
  if (typeof item.largeLabB2bRateInr === 'number' && item.largeLabB2bRateInr >= 0) {
    return Math.round(item.largeLabB2bRateInr);
  }
  const smallPrice = item.b2bPriceInr || 0;
  return Math.max(0, Math.round(smallPrice * (1 - commissionPct / 100)));
}

/**
 * Evaluates every verified Large Lab organization for the user's selected test codes:
 * 1. Matches org-specific tests and combo packages (auto-detecting package savings).
 * 2. Ranks nearest collection center / hub via Haversine distance.
 * 3. Sorts full-coverage quotes first, then strictly LOWEST total price FIRST.
 */
export function evaluateLargeLabQuotesForSelection(params: {
  requestedTestCodes: string[];
  catalog: DiagnosticTestItem[];
  labs: LabFacility[];
  commissionConfig: CommissionConfig;
  priority: OrderPriority;
  pickupCoords: GeoPoint;
}): LargeLabComparisonQuote[] {
  const uniqueRequested = Array.from(
    new Set(
      params.requestedTestCodes
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (uniqueRequested.length === 0) return [];

  const verifiedLargeCenters = params.labs.filter(
    (l) => l.type === 'LARGE_LAB' && l.verificationStatus === 'VERIFIED'
  );
  if (verifiedLargeCenters.length === 0) return [];

  // Group centers by Parent HQ Org ID
  const orgCentersMap = new Map<string, LabFacility[]>();
  const labLookup = new Map(verifiedLargeCenters.map((l) => [l.id, l]));

  for (const center of verifiedLargeCenters) {
    const orgId = center.parentLabId?.trim() || center.id;
    const list = orgCentersMap.get(orgId) || [];
    list.push(center);
    orgCentersMap.set(orgId, list);
  }

  const activeCatalog = params.catalog.filter((c) => c.isActive !== false);
  const quotes: LargeLabComparisonQuote[] = [];

  for (const [orgId, orgCenters] of orgCentersMap.entries()) {
    const centerIds = new Set(orgCenters.map((c) => c.id));
    centerIds.add(orgId);

    const hqLab =
      orgCenters.find((c) => c.centerType === 'MAIN_HUB') ||
      orgCenters.find((c) => c.id === orgId) ||
      labLookup.get(orgId) ||
      orgCenters[0];

    const agreement = params.commissionConfig.largeLabAgreements?.[orgId];
    const effectiveCommPct =
      agreement?.agreedCommissionPct ?? params.commissionConfig.commissionPct ?? 15;

    // Org-specific items take precedence; fall back to unowned global items
    const orgItems = activeCatalog.filter(
      (item) =>
        (item.ownerOrgId && item.ownerOrgId === orgId) ||
        (item.labId && centerIds.has(item.labId))
    );
    const globalItems = activeCatalog.filter(
      (item) => !item.ownerOrgId && !item.labId
    );

    const singleTestsByCode = new Map<string, DiagnosticTestItem>();
    for (const item of globalItems) {
      if ((item.itemType || 'TEST') === 'TEST') {
        singleTestsByCode.set(item.code.toUpperCase(), item);
      }
    }
    for (const item of orgItems) {
      if ((item.itemType || 'TEST') === 'TEST') {
        singleTestsByCode.set(item.code.toUpperCase(), item);
      }
    }

    const packagesMap = new Map<string, DiagnosticTestItem>();
    for (const item of [...globalItems, ...orgItems]) {
      if (item.itemType === 'PACKAGE' && Array.isArray(item.includedTestCodes) && item.includedTestCodes.length > 0) {
        packagesMap.set(item.code.toUpperCase(), item);
      }
    }
    const availablePackages = Array.from(packagesMap.values());

    // Baseline cost if buying requested tests individually from this org
    let individualBaselineInr = 0;
    let baselineHasAllIndividual = true;
    for (const code of uniqueRequested) {
      const single = singleTestsByCode.get(code);
      if (single) {
        individualBaselineInr += getEffectiveSmallLabPrice(single, agreement);
      } else {
        baselineHasAllIndividual = false;
      }
    }

    // Evaluate package candidates (single package OR pair of packages) + remaining single tests
    interface CandidatePlan {
      pkgs: DiagnosticTestItem[];
      singles: DiagnosticTestItem[];
      covered: Set<string>;
      testTotalInr: number;
      largeLabB2bInr: number;
    }

    const buildPlan = (chosenPkgs: DiagnosticTestItem[]): CandidatePlan => {
      const covered = new Set<string>();
      let testTotalInr = 0;
      let largeLabB2bInr = 0;

      for (const pkg of chosenPkgs) {
        testTotalInr += getEffectiveSmallLabPrice(pkg, agreement);
        largeLabB2bInr += getEffectiveLargeLabRate(pkg, effectiveCommPct);
        for (const c of pkg.includedTestCodes || []) {
          const upper = c.trim().toUpperCase();
          if (uniqueRequested.includes(upper)) covered.add(upper);
        }
      }

      const singles: DiagnosticTestItem[] = [];
      for (const code of uniqueRequested) {
        if (covered.has(code)) continue;
        const single = singleTestsByCode.get(code);
        if (single) {
          singles.push(single);
          covered.add(code);
          testTotalInr += getEffectiveSmallLabPrice(single, agreement);
          largeLabB2bInr += getEffectiveLargeLabRate(single, effectiveCommPct);
        }
      }

      return { pkgs: chosenPkgs, singles, covered, testTotalInr, largeLabB2bInr };
    };

    const candidates: CandidatePlan[] = [buildPlan([])];
    const relevantPackages = availablePackages.filter((pkg) => {
      const inc = (pkg.includedTestCodes || []).map((x) => x.trim().toUpperCase());
      const overlapCount = uniqueRequested.filter((r) => inc.includes(r)).length;
      return overlapCount >= 2 || (uniqueRequested.length === 1 && overlapCount === 1);
    });

    for (let i = 0; i < relevantPackages.length; i += 1) {
      candidates.push(buildPlan([relevantPackages[i]]));
      for (let j = i + 1; j < relevantPackages.length && i < 12 && j < 12; j += 1) {
        candidates.push(buildPlan([relevantPackages[i], relevantPackages[j]]));
      }
    }

    // Best plan = max covered count first, then strictly lowest small-lab test price, then prefer fewer items (packages)
    candidates.sort((a, b) => {
      if (b.covered.size !== a.covered.size) return b.covered.size - a.covered.size;
      if (a.testTotalInr !== b.testTotalInr) return a.testTotalInr - b.testTotalInr;
      return b.pkgs.length - a.pkgs.length;
    });

    const best = candidates[0];
    if (!best || best.covered.size === 0) continue;

    const matchedPackages: MatchedPackageSummary[] = best.pkgs.map((pkg) => {
      const incUpper = (pkg.includedTestCodes || []).map((c) => c.trim().toUpperCase());
      const coveredReq = uniqueRequested.filter((r) => incUpper.includes(r));
      const pkgPrice = getEffectiveSmallLabPrice(pkg, agreement);
      const individualEquiv = coveredReq.reduce((sum, code) => {
        const s = singleTestsByCode.get(code);
        return sum + (s ? getEffectiveSmallLabPrice(s, agreement) : 0);
      }, 0);
      return {
        catalogItemId: pkg.id,
        code: pkg.code,
        name: pkg.name,
        priceInr: pkgPrice,
        largeLabB2bRateInr: getEffectiveLargeLabRate(pkg, effectiveCommPct),
        coveredRequestedCodes: coveredReq,
        allIncludedCodes: incUpper,
        savingsInr: Math.max(0, individualEquiv - pkgPrice),
      };
    });

    const packageSavingsInr = baselineHasAllIndividual
      ? Math.max(0, individualBaselineInr - best.testTotalInr)
      : matchedPackages.reduce((s, p) => s + p.savingsInr, 0);

    // Distance calculation from pickup point to each center in this org
    const centerOptions: LargeLabCenterDistanceOption[] = orgCenters
      .map((lab) => {
        const hasCoords =
          typeof lab.latitude === 'number' &&
          typeof lab.longitude === 'number' &&
          Number.isFinite(lab.latitude) &&
          Number.isFinite(lab.longitude);
        const distanceKm = hasCoords
          ? calculateHaversineDistanceKm(
              params.pickupCoords.latitude,
              params.pickupCoords.longitude,
              lab.latitude!,
              lab.longitude!
            )
          : lab.centerType === 'MAIN_HUB'
          ? 3.8
          : 2.5;
        const estimatedEtaMins = Math.max(12, Math.round(distanceKm * 4 + 10));
        return { lab, distanceKm, estimatedEtaMins };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearest = centerOptions[0];
    const pricingSplit = computeOrderPricingSplit({
      smallLabTestTotalInr: best.testTotalInr,
      largeLabB2bTotalInr: best.largeLabB2bInr,
      commissionConfig: params.commissionConfig,
      targetLabId: orgId,
      priority: params.priority,
      distanceKm: nearest.distanceKm,
      dropType: 'LARGE_LAB',
    });

    const coveredList = uniqueRequested.filter((c) => best.covered.has(c));
    const missingList = uniqueRequested.filter((c) => !best.covered.has(c));

    quotes.push({
      orgLabId: orgId,
      orgLabName: hqLab.parentLabName || hqLab.name,
      nablNumber: hqLab.nablNumber,
      centers: centerOptions,
      nearestCenter: nearest.lab,
      nearestDistanceKm: nearest.distanceKm,
      requestedCodes: uniqueRequested,
      coveredCodes: coveredList,
      missingCodes: missingList,
      coverageRatio: coveredList.length / uniqueRequested.length,
      matchedPackages,
      matchedIndividualTests: best.singles,
      individualBaselineInr: baselineHasAllIndividual ? individualBaselineInr : best.testTotalInr,
      smallLabTestTotalInr: best.testTotalInr,
      largeLabB2bTotalInr: best.largeLabB2bInr,
      packageSavingsInr,
      pricingSplit,
      totalPayableInr: pricingSplit.grossAmountInr,
    });
  }

  // Sort strictly: 1) Full/Highest Test Coverage, 2) LOWEST Total Payable Price First, 3) Nearest Center
  quotes.sort((a, b) => {
    const aFull = a.missingCodes.length === 0 ? 1 : 0;
    const bFull = b.missingCodes.length === 0 ? 1 : 0;
    if (bFull !== aFull) return bFull - aFull;
    if (Math.abs(b.coverageRatio - a.coverageRatio) > 0.001) {
      return b.coverageRatio - a.coverageRatio;
    }
    if (a.totalPayableInr !== b.totalPayableInr) {
      return a.totalPayableInr - b.totalPayableInr;
    }
    return a.nearestDistanceKm - b.nearestDistanceKm;
  });

  return quotes;
}

export interface ServiceCoverageEvaluation {
  covered: boolean;
  matchedZone: ServiceZoneRecord | null;
  nearestZone: ServiceZoneRecord | null;
  distanceToNearestKm: number;
  activeZoneCount: number;
  message: string;
}

/**
 * Evaluates whether a pickup/facility point falls inside an active LabSetu expansion zone.
 */
export function evaluatePointServiceCoverage(
  zones: ServiceZoneRecord[],
  latitude?: number,
  longitude?: number,
  pincode?: string,
  city?: string
): ServiceCoverageEvaluation {
  if (!Array.isArray(zones) || zones.length === 0) {
    return {
      covered: true,
      matchedZone: null,
      nearestZone: null,
      distanceToNearestKm: 0,
      activeZoneCount: 0,
      message: 'No service zones configured; all coordinates allowed.',
    };
  }

  const activeZones = zones.filter((z) => z.isActive !== false && z.launchPhase !== 'PAUSED');
  if (activeZones.length === 0) {
    return {
      covered: false,
      matchedZone: null,
      nearestZone: zones[0] || null,
      distanceToNearestKm: 0,
      activeZoneCount: 0,
      message: 'All service zones are currently paused. Enable at least one operational area in Control Tower.',
    };
  }

  const cleanPin = String(pincode || '')
    .trim()
    .replace(/\D/g, '')
    .slice(0, 6);
  const cleanCity = String(city || '').trim().toLowerCase();
  const hasCoords =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    (Math.abs(latitude) > 0.01 || Math.abs(longitude) > 0.01);

  // 1. Direct Area Expansion Pincode Match (City prioritized if provided)
  if (cleanPin.length === 6) {
    const pinMatches = activeZones.filter(
      (z) => Array.isArray(z.pincodes) && z.pincodes.includes(cleanPin)
    );
    if (pinMatches.length > 0) {
      let bestPinZone = pinMatches[0];
      if (cleanCity) {
        const cityMatch = pinMatches.find((z) => (z.city || '').toLowerCase().includes(cleanCity));
        if (cityMatch) bestPinZone = cityMatch;
      }
      const dist = hasCoords
        ? calculateHaversineDistanceKm(latitude!, longitude!, bestPinZone.centerLatitude, bestPinZone.centerLongitude)
        : 0;
      return {
        covered: true,
        matchedZone: bestPinZone,
        nearestZone: bestPinZone,
        distanceToNearestKm: dist,
        activeZoneCount: activeZones.length,
        message: `Covered under active area expansion: ${bestPinZone.city} — ${bestPinZone.name} (Pincode ${cleanPin} Verified).`,
      };
    }
  }

  // 2. Proximity GPS Radius Match
  let matchedZone: ServiceZoneRecord | null = null;
  let nearestZone: ServiceZoneRecord | null = null;
  let nearestDistanceKm = Number.POSITIVE_INFINITY;

  for (const zone of activeZones) {
    const dist = hasCoords
      ? calculateHaversineDistanceKm(latitude!, longitude!, zone.centerLatitude, zone.centerLongitude)
      : 0;

    if (dist < nearestDistanceKm) {
      nearestDistanceKm = dist;
      nearestZone = zone;
    }

    const radiusKm = Math.max(0.5, zone.radiusKm || 5);
    const inRadius = hasCoords && dist <= radiusKm;

    if (inRadius) {
      if (!matchedZone || dist < calculateHaversineDistanceKm(latitude || 0, longitude || 0, matchedZone.centerLatitude, matchedZone.centerLongitude)) {
        matchedZone = zone;
      }
    }
  }

  const safeDistance = Number.isFinite(nearestDistanceKm)
    ? Math.round(nearestDistanceKm * 100) / 100
    : 0;

  if (matchedZone) {
    return {
      covered: true,
      matchedZone,
      nearestZone: matchedZone,
      distanceToNearestKm: hasCoords
        ? calculateHaversineDistanceKm(latitude!, longitude!, matchedZone.centerLatitude, matchedZone.centerLongitude)
        : 0,
      activeZoneCount: activeZones.length,
      message: `Covered under active zone: ${matchedZone.city} — ${matchedZone.name} (${matchedZone.zoneCode} • within ${matchedZone.radiusKm} km radius).`,
    };
  }

  return {
    covered: false,
    matchedZone: null,
    nearestZone,
    distanceToNearestKm: safeDistance,
    activeZoneCount: activeZones.length,
    message: nearestZone
      ? cleanPin.length === 6
        ? `Pincode ${cleanPin} (${city || nearestZone.city}) is not yet enrolled in active service zones. Nearest area is "${nearestZone.name}" (${safeDistance} km away). Add this pincode in Admin Control Tower to expand coverage.`
        : `Selected location is ${safeDistance} km from nearest active zone "${nearestZone.name}" (${nearestZone.radiusKm} km radius). Expand service zone or pick an address inside active pockets.`
      : 'Selected location is outside currently active service zones.',
  };
}

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

export interface Code128Bar {
  x: number;
  width: number;
}

export interface Code128Result {
  totalWidth: number;
  bars: Code128Bar[];
  text: string;
}

/**
 * Encodes text into Code 128 (Subset B) bar coordinate array for high-DPI SVG rendering
 * and thermal printer output (50mm x 25mm vacutainer stickers).
 */
export function generateCode128Bars(rawText: string): Code128Result {
  const text = (rawText || '').trim().replace(/[^\x20-\x7E]/g, '');
  const codes: number[] = [104]; // Start B
  let checkSum = 104;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    codes.push(code);
    checkSum += code * (i + 1);
  }
  codes.push(checkSum % 103);
  codes.push(106); // Stop

  const quietZone = 10;
  let currentX = quietZone;
  const bars: Code128Bar[] = [];

  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c] || CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      const w = Number(pattern[j]);
      if (j % 2 === 0) {
        bars.push({ x: currentX, width: w });
      }
      currentX += w;
    }
  }
  currentX += quietZone;

  return {
    totalWidth: currentX,
    bars,
    text,
  };
}

