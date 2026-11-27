import {
  type BookingPricingSnapshot,
  type PlatformPricingConfig,
} from '../types/platform.js';

export const DEFAULT_PLATFORM_PRICING_CONFIG: PlatformPricingConfig = {
  id: 'platformPricingConfig',
  pricingVersion: 'v1.0.0',
  effectiveDate: new Date().toISOString(),
  isActive: true,
  defaultLargeLabMarginPct: 20,
  largeLabMarginMode: 'PRICE_DIFFERENCE',
  largeLabSideFeePct: 0,
  smallLabDefaultFeePct: 6,
  smallLabTestFeePctOverrides: {},
  smallLabPackageFeePctOverrides: {},
  smallLabPartnerFeePctOverrides: {},
  smallLabFeeBase: 'B2B_SELLING_PRICE',
  phleboBaseVisitPayoutPaise: 15000, // ₹150.00
  phleboCollectionPayoutPaise: 0,
  phleboDeliveryPayoutPaise: 0,
  phleboAdditionalChargesPaise: 0,
  phleboPlatformFeePct: 10,
  phleboCostFundingModel: 'SEPARATELY_BILLED',
  taxPct: 0,
  gatewayChargePct: 0,
  updatedAt: new Date().toISOString(),
};

/**
 * Integer-paise percentage rounding (half-up).
 * Never uses floating point on currency totals.
 */
export function roundPctPaise(basePaise: number, pct: number): number {
  const safeBase = Math.max(0, Math.round(basePaise));
  const bps = Math.max(0, Math.round(pct * 100)); // basis points * 1 (e.g. 6% -> 600 bps)
  return Math.round((safeBase * bps) / 10000);
}

export interface CentralizedPricingCalculationInput {
  config: PlatformPricingConfig;
  smallLabB2bPricePaise: number;
  largeLabNegotiatedPricePaise?: number;
  phleboGrossPayoutOverridePaise?: number;
  testCode?: string;
  packageCode?: string;
  smallLabId?: string;
  discountPaise?: number;
}

/**
 * Authoritative integer-paise financial breakdown for a booking.
 * - Small Lab Fee is INCLUDED in B2B price (never added on top).
 * - Large Lab Margin = Small Lab B2B Price - Large Lab Negotiated Processing Price.
 * - No double counting between Large Lab Margin and Small Lab Included Fee:
 *   Small Lab Included Fee is tracked as an allocated sub-component of the commercial spread.
 * - Phlebo Fee = Phlebo Gross Payout * Phlebo Fee %, deducted once to produce Phlebo Net Earning.
 */
export function calculateCentralizedBookingFinancialsPaise(
  input: CentralizedPricingCalculationInput
): BookingPricingSnapshot {
  const cfg = input.config;
  const now = new Date().toISOString();

  const b2bPaise = Math.max(0, Math.round(input.smallLabB2bPricePaise));
  const negotiatedPaise =
    typeof input.largeLabNegotiatedPricePaise === 'number' && input.largeLabNegotiatedPricePaise >= 0
      ? Math.round(input.largeLabNegotiatedPricePaise)
      : Math.max(0, b2bPaise - roundPctPaise(b2bPaise, cfg.defaultLargeLabMarginPct));

  const largeLabPriceDifferenceMarginPaise = Math.max(0, b2bPaise - negotiatedPaise);
  const largeLabSideFeePct = Math.max(0, cfg.largeLabSideFeePct || 0);
  const largeLabSideFeePaise = roundPctPaise(negotiatedPaise, largeLabSideFeePct);
  const largeLabNetPayablePaise = Math.max(0, negotiatedPaise - largeLabSideFeePaise);

  // Resolve Small Lab fee % priority: Partner -> Package -> Test -> Default
  let smallLabIncludedFeePct = cfg.smallLabDefaultFeePct;
  if (input.testCode && typeof cfg.smallLabTestFeePctOverrides?.[input.testCode] === 'number') {
    smallLabIncludedFeePct = cfg.smallLabTestFeePctOverrides[input.testCode];
  }
  if (input.packageCode && typeof cfg.smallLabPackageFeePctOverrides?.[input.packageCode] === 'number') {
    smallLabIncludedFeePct = cfg.smallLabPackageFeePctOverrides[input.packageCode];
  }
  if (input.smallLabId && typeof cfg.smallLabPartnerFeePctOverrides?.[input.smallLabId] === 'number') {
    smallLabIncludedFeePct = cfg.smallLabPartnerFeePctOverrides[input.smallLabId];
  }
  smallLabIncludedFeePct = Math.max(0, Math.min(100, smallLabIncludedFeePct));
  const smallLabIncludedFeePaise = roundPctPaise(b2bPaise, smallLabIncludedFeePct);

  // Phlebo gross payout & percentage deduction
  const configuredPhleboGross =
    Math.max(0, Math.round(cfg.phleboBaseVisitPayoutPaise)) +
    Math.max(0, Math.round(cfg.phleboCollectionPayoutPaise)) +
    Math.max(0, Math.round(cfg.phleboDeliveryPayoutPaise)) +
    Math.max(0, Math.round(cfg.phleboAdditionalChargesPaise));

  const phleboGrossPayoutPaise =
    typeof input.phleboGrossPayoutOverridePaise === 'number' && input.phleboGrossPayoutOverridePaise >= 0
      ? Math.round(input.phleboGrossPayoutOverridePaise)
      : configuredPhleboGross;

  const phleboPlatformFeePct = Math.max(0, Math.min(100, cfg.phleboPlatformFeePct));
  const phleboPlatformFeePaise = roundPctPaise(phleboGrossPayoutPaise, phleboPlatformFeePct);
  const phleboNetEarningPaise = Math.max(0, phleboGrossPayoutPaise - phleboPlatformFeePaise);

  const discountPaise = Math.max(0, Math.round(input.discountPaise || 0));
  const preTaxSubTotalPaise =
    cfg.phleboCostFundingModel === 'SEPARATELY_BILLED'
      ? Math.max(0, b2bPaise + phleboGrossPayoutPaise - discountPaise)
      : Math.max(0, b2bPaise - discountPaise);

  const taxPct = Math.max(0, cfg.taxPct || 0);
  const taxPaise = roundPctPaise(preTaxSubTotalPaise, taxPct);
  const gatewayChargePct = Math.max(0, cfg.gatewayChargePct || 0);
  const gatewayChargePaise = roundPctPaise(preTaxSubTotalPaise + taxPaise, gatewayChargePct);

  // Small Lab payable never adds the included fee on top of B2B price
  const finalSmallLabPayablePaise = preTaxSubTotalPaise + taxPaise;

  // Balanced Platform Revenue (NO double counting between largeLabPriceDifferenceMarginPaise & smallLabIncludedFeePaise)
  // If Phlebo is SEPARATELY_BILLED:
  //   Collected (ex-tax) = B2B + PhleboGross - Discount
  //   Obligations = LargeLabNetPayable + PhleboNetEarning
  //   GrossPlatformRevenue = LargeLabPriceDiffMargin + LargeLabSideFee + PhleboPlatformFee - Discount
  // If Phlebo is INCLUDED_IN_B2B:
  //   Collected (ex-tax) = B2B - Discount
  //   Obligations = LargeLabNetPayable + PhleboNetEarning
  //   GrossPlatformRevenue = (LargeLabPriceDiffMargin + LargeLabSideFee) - PhleboNetEarning - Discount
  const grossSpreadRevenue =
    cfg.phleboCostFundingModel === 'SEPARATELY_BILLED'
      ? largeLabPriceDifferenceMarginPaise + largeLabSideFeePaise + phleboPlatformFeePaise - discountPaise
      : largeLabPriceDifferenceMarginPaise + largeLabSideFeePaise - phleboNetEarningPaise - discountPaise;

  const grossPlatformRevenuePaise = Math.max(0, grossSpreadRevenue);
  const netPlatformRevenuePaise = Math.max(0, grossPlatformRevenuePaise - gatewayChargePaise);

  // Reconciliation check: Collected (ex-tax) == LargeLabNetPayable + PhleboNetEarning + GrossSpreadRevenue (when >= 0)
  const expectedCollectedExTax =
    largeLabNetPayablePaise + phleboNetEarningPaise + grossSpreadRevenue;
  const reconciliationBalanced = expectedCollectedExTax === preTaxSubTotalPaise;

  return {
    pricingVersion: cfg.pricingVersion,
    effectiveDate: cfg.effectiveDate,
    calculatedAt: now,
    phleboCostFundingModel: cfg.phleboCostFundingModel,
    smallLabB2bPricePaise: b2bPaise,
    largeLabNegotiatedPricePaise: negotiatedPaise,
    largeLabPriceDifferenceMarginPaise,
    largeLabSideFeePct,
    largeLabSideFeePaise,
    largeLabNetPayablePaise,
    smallLabIncludedFeePct,
    smallLabIncludedFeePaise,
    smallLabFeeLabel: 'Included in B2B Price',
    phleboGrossPayoutPaise,
    phleboPlatformFeePct,
    phleboPlatformFeePaise,
    phleboNetEarningPaise,
    taxPct,
    taxPaise,
    gatewayChargePct,
    gatewayChargePaise,
    discountPaise,
    finalSmallLabPayablePaise,
    grossPlatformRevenuePaise,
    netPlatformRevenuePaise,
    reconciliationBalanced,
  };
}
