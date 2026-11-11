import {
  CommissionConfig,
  DiagnosticTestItem,
  DropDestinationType,
  LabFacility,
  OrderPriority,
  SpecimenItem,
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

