process.env.FORCE_FIREBASE_MOCK = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCentralizedBookingFinancialsPaise, roundPctPaise } from '@diagnostic/shared';
import {
  calculateAuthoritativeBookingSnapshot,
  getAdminFinancialLedgerSummary,
  getPlatformPricingConfig,
  getPlatformPricingHistory,
  recordBookingFinancialLedger,
  recordBookingRefundOrCancellationLedger,
  resetPlatformPricingTestStores,
  updatePlatformPricingConfig,
} from '../services/platformPricing.service';
import {
  creditBookingEarningAtomically,
  getWithdrawalConfig,
  resetInMemoryWalletStores,
} from '../services/wallet.service';

test('Phase 11 Illustrative Financial Model: ₹500 B2B, ₹400 Large Lab, 6% Included Small Lab Fee, ₹150 Phlebo Gross, 10% Phlebo Fee', async () => {
  resetPlatformPricingTestStores();
  resetInMemoryWalletStores();

  // 1-5. Admin configures percentages & Phlebo gross visit payout
  const cfg = await updatePlatformPricingConfig({
    patch: {
      defaultLargeLabMarginPct: 20,
      largeLabSideFeePct: 0,
      smallLabDefaultFeePct: 6,
      phleboBaseVisitPayoutPaise: 15000, // ₹150
      phleboPlatformFeePct: 10,
      phleboCostFundingModel: 'SEPARATELY_BILLED',
      taxPct: 0,
      gatewayChargePct: 0,
    },
    actorUid: 'ADM-1',
    actorEmail: 'admin@labsetu.in',
    summary: 'Initial Phase 11 benchmark pricing',
  });
  assert.equal(cfg.pricingVersion, 'v1.0.1');

  // Verify WithdrawalConfig synced with Phlebo platformFeePct = 10
  const wdCfg = await getWithdrawalConfig();
  assert.equal(wdCfg.platformFeePct, 10);

  // 6-10. Calculate booking snapshot (CBC: B2B ₹500, Large Lab negotiated ₹400)
  const snapshot = await calculateAuthoritativeBookingSnapshot({
    smallLabB2bPricePaise: 50000, // ₹500
    largeLabNegotiatedPricePaise: 40000, // ₹400
    testCode: 'CBC',
    smallLabId: 'LAB-SM-01',
  });

  assert.equal(snapshot.smallLabB2bPricePaise, 50000);
  assert.equal(snapshot.largeLabNegotiatedPricePaise, 40000);
  assert.equal(snapshot.largeLabNetPayablePaise, 40000);
  assert.equal(snapshot.largeLabPriceDifferenceMarginPaise, 10000); // ₹100
  assert.equal(snapshot.smallLabIncludedFeePct, 6);
  assert.equal(snapshot.smallLabIncludedFeePaise, 3000); // ₹30 included in B2B price
  assert.equal(snapshot.smallLabFeeLabel, 'Included in B2B Price');
  assert.equal(snapshot.phleboGrossPayoutPaise, 15000); // ₹150
  assert.equal(snapshot.phleboPlatformFeePct, 10);
  assert.equal(snapshot.phleboPlatformFeePaise, 1500); // ₹15
  assert.equal(snapshot.phleboNetEarningPaise, 13500); // ₹135
  // Final Small Lab payable (B2B ₹500 + Separately billed Phlebo ₹150, NO extra ₹30!)
  assert.equal(snapshot.finalSmallLabPayablePaise, 65000);
  // Gross Platform Revenue = ₹100 (Large Lab spread) + ₹15 (Phlebo fee) = ₹115 (NO double counting ₹30!)
  assert.equal(snapshot.grossPlatformRevenuePaise, 11500);
  assert.equal(snapshot.reconciliationBalanced, true);

  // 11-14. Record ledger & credit Phlebo wallet atomically
  await recordBookingFinancialLedger({
    orderId: 'BK-FIN-100',
    orderNumber: 'BK-FIN-100',
    smallLabId: 'LAB-SM-01',
    largeLabId: 'LAB-LG-01',
    phleboId: 'PHL-01',
    testCode: 'CBC',
    snapshot,
  });

  const walletCredit = await creditBookingEarningAtomically({
    phleboId: 'PHL-01',
    phleboName: 'Ramesh',
    bookingId: 'BK-FIN-100',
    orderNumber: 'BK-FIN-100',
    grossEarningInr: snapshot.phleboGrossPayoutPaise / 100,
    handoverConfirmed: true,
    otpOrLabConfirmed: true,
  });
  assert.equal(walletCredit.credited, true);
  assert.equal(walletCredit.transaction.grossEarningPaise, 15000);
  assert.equal(walletCredit.transaction.platformFeePaise, 1500);
  assert.equal(walletCredit.transaction.netEarningPaise, 13500);
  assert.equal(walletCredit.wallet.availableBalancePaise, 13500);

  // Duplicate handover / credit must be prevented
  const dupCredit = await creditBookingEarningAtomically({
    phleboId: 'PHL-01',
    phleboName: 'Ramesh',
    bookingId: 'BK-FIN-100',
    orderNumber: 'BK-FIN-100',
    grossEarningInr: snapshot.phleboGrossPayoutPaise / 100,
    handoverConfirmed: true,
    otpOrLabConfirmed: true,
  });
  assert.equal(dupCredit.duplicatePrevented, true);
  assert.equal(dupCredit.wallet.availableBalancePaise, 13500);

  // 15-17. Admin ledger summary & reconciliation
  const summary = await getAdminFinancialLedgerSummary({ orderId: 'BK-FIN-100' });
  assert.equal(summary.totals.largeLabProcessingCostPaise, 40000);
  assert.equal(summary.totals.largeLabPriceDifferenceMarginPaise, 10000);
  assert.equal(summary.totals.smallLabIncludedPlatformFeePaise, 3000);
  assert.equal(summary.totals.phleboPlatformFeePaise, 1500);
  assert.equal(summary.totals.phleboNetEarningPaise, 13500);
  assert.equal(summary.totals.totalGrossPlatformRevenuePaise, 11500);
  assert.equal(summary.totals.netPlatformRevenuePaise, 11500);
});

test('Financial Edge Cases: Pricing Changes Do Not Affect Old Bookings, Rounding, Taxes, Gateway, Refunds, INCLUDED_IN_B2B', async () => {
  resetPlatformPricingTestStores();

  const v1Snapshot = await calculateAuthoritativeBookingSnapshot({
    smallLabB2bPricePaise: 50000,
    largeLabNegotiatedPricePaise: 40000,
  });
  assert.equal(v1Snapshot.pricingVersion, 'v1.0.0');

  // Admin changes percentages & enables tax (18%) + gateway (2%) + INCLUDED_IN_B2B Phlebo model
  await updatePlatformPricingConfig({
    patch: {
      smallLabDefaultFeePct: 8,
      phleboPlatformFeePct: 12,
      phleboCostFundingModel: 'INCLUDED_IN_B2B',
      phleboBaseVisitPayoutPaise: 5000, // ₹50 funded from spread
      taxPct: 18,
      gatewayChargePct: 2,
    },
    actorUid: 'ADM-1',
    actorEmail: 'admin@labsetu.in',
  });

  // Old snapshot remains unchanged!
  assert.equal(v1Snapshot.smallLabIncludedFeePct, 6);
  assert.equal(v1Snapshot.pricingVersion, 'v1.0.0');

  const hist = await getPlatformPricingHistory();
  assert.equal(hist.length, 1);

  const v2Snapshot = await calculateAuthoritativeBookingSnapshot({
    smallLabB2bPricePaise: 50000,
    largeLabNegotiatedPricePaise: 40000,
  });
  assert.equal(v2Snapshot.pricingVersion, 'v1.0.1');
  assert.equal(v2Snapshot.reconciliationBalanced, true);
  assert.equal(v2Snapshot.taxPaise, 9000); // 18% of ₹500
  assert.equal(v2Snapshot.finalSmallLabPayablePaise, 59000); // ₹590 (B2B + tax, no extra fee)

  // Integer paise rounding check (e.g., 7.5% of ₹333.33 = 33333 paise)
  assert.equal(roundPctPaise(33333, 7.5), 2500);

  // Refund ledger entry reduces Net Platform Revenue cleanly
  await recordBookingFinancialLedger({
    orderId: 'BK-REF-1',
    orderNumber: 'BK-REF-1',
    smallLabId: 'SM-1',
    largeLabId: 'LG-1',
    snapshot: v2Snapshot,
  });
  await recordBookingRefundOrCancellationLedger({
    orderId: 'BK-REF-1',
    orderNumber: 'BK-REF-1',
    smallLabId: 'SM-1',
    largeLabId: 'LG-1',
    refundAmountPaise: 2000,
    pricingVersion: v2Snapshot.pricingVersion,
    reason: 'Partial test cancellation',
  });

  const ledger = await getAdminFinancialLedgerSummary({ orderId: 'BK-REF-1' });
  assert.equal(ledger.totals.taxesPaise, 9000);
  assert.equal(ledger.totals.refundsAndAdjustmentsPaise, 2000);
  assert.equal(ledger.totals.gatewayExpensesPaise, v2Snapshot.gatewayChargePaise);
});
