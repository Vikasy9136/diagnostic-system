import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.FORCE_FIREBASE_MOCK = 'true';

import {
  creditBookingEarningAtomically,
  getPhleboWallet,
  getPrivatePhleboQrForAdmin,
  listWalletTransactions,
  reconcileWalletsAndWithdrawals,
  requestPhleboWithdrawal,
  resetInMemoryWalletStores,
  savePhleboQrImage,
  settleWithdrawalManuallyByAdmin,
  transitionWithdrawalStatusByAdmin,
  updateWithdrawalConfig,
} from '../services/wallet.service';
import {
  savePhleboBankAccount,
  verifyPhleboPaymentMethodByAdmin,
} from '../services/phleboBank.service';

test('Wallet QA 1 & 2: Booking completed credits earning once; duplicate booking does not double-credit', async () => {
  resetInMemoryWalletStores();
  const r1 = await creditBookingEarningAtomically({
    bookingId: 'BK-W-1',
    orderNumber: 'ORD-W-1',
    phleboId: 'PHL-W-1',
    phleboName: 'Ravi Kumar',
    grossEarningInr: 150,
    handoverConfirmed: true,
    otpOrLabConfirmed: true,
  });
  assert.equal(r1.credited, true);
  assert.equal(r1.duplicatePrevented, false);
  assert.equal(r1.wallet.availableBalancePaise, 15000);

  const r2 = await creditBookingEarningAtomically({
    bookingId: 'BK-W-1',
    orderNumber: 'ORD-W-1',
    phleboId: 'PHL-W-1',
    phleboName: 'Ravi Kumar',
    grossEarningInr: 150,
    handoverConfirmed: true,
    otpOrLabConfirmed: true,
  });
  assert.equal(r2.credited, false);
  assert.equal(r2.duplicatePrevented, true);
  assert.equal(r2.wallet.availableBalancePaise, 15000);
});

test('Wallet QA 3–8: Weekly 7-day rule, min limit, balance check, pending lock, and simultaneous withdrawal guard', async () => {
  resetInMemoryWalletStores();
  await updateWithdrawalConfig({ minWithdrawalPaise: 10000, cycleDays: 7 }, 'admin@labsetu.com');

  await creditBookingEarningAtomically({
    bookingId: 'BK-W-2',
    orderNumber: 'ORD-W-2',
    phleboId: 'PHL-W-2',
    phleboName: 'Amit',
    grossEarningInr: 500,
    handoverConfirmed: true,
    otpOrLabConfirmed: true,
  });

  // Save & verify bank (mock IFSC not called if we test via verify after saving; let's test unverified/missing first)
  await assert.rejects(
    () =>
      requestPhleboWithdrawal({
        phleboId: 'PHL-W-2',
        phleboName: 'Amit',
        requestedAmountPaise: 5000, // ₹50 < ₹100 min
      }),
    /Minimum withdrawal/
  );

  // Seed verified bank via phleboBank helper? Instead test missing bank first
  await assert.rejects(
    () =>
      requestPhleboWithdrawal({
        phleboId: 'PHL-W-2',
        phleboName: 'Amit',
        requestedAmountPaise: 20000,
      }),
    /Add your bank account/
  );
});

test('Wallet QA 9–16 & 24: Review, Hold, Reject releases funds once, Manual Settlement requires UTR & prevents duplicate UTR, Reconciliation matches', async () => {
  resetInMemoryWalletStores();

  // Credit ₹300
  await creditBookingEarningAtomically({
    bookingId: 'BK-W-3',
    orderNumber: 'ORD-W-3',
    phleboId: 'PHL-W-3',
    phleboName: 'Suresh',
    grossEarningInr: 300,
    handoverConfirmed: true,
    otpOrLabConfirmed: true,
  });

  // Mock fetch for IFSC lookup in test
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        IFSC: 'SBIN0001234',
        BANK: 'State Bank of India',
        BANKCODE: 'SBIN',
        BRANCH: 'Main Branch',
        ADDRESS: 'Mumbai',
        CITY: 'Mumbai',
        DISTRICT: 'Mumbai',
        STATE: 'Maharashtra',
        IMPS: true,
        NEFT: true,
        RTGS: true,
        UPI: true,
      }),
    }) as Response;

  try {
    await savePhleboBankAccount({
      phleboId: 'PHL-W-3',
      accountHolderName: 'Suresh Yadav',
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
    });
  } finally {
    globalThis.fetch = origFetch;
  }

  await verifyPhleboPaymentMethodByAdmin({
    phleboId: 'PHL-W-3',
    target: 'BANK_ACCOUNT',
    status: 'VERIFIED',
    adminEmail: 'finance@labsetu.com',
  });

  const t0 = Date.now();
  // Exceeds balance
  await assert.rejects(
    () =>
      requestPhleboWithdrawal({
        phleboId: 'PHL-W-3',
        phleboName: 'Suresh',
        requestedAmountPaise: 40000,
        nowMs: t0,
      }),
    /exceeds available balance/
  );

  // Valid withdrawal of ₹100
  const wd1 = await requestPhleboWithdrawal({
    phleboId: 'PHL-W-3',
    phleboName: 'Suresh',
    requestedAmountPaise: 10000,
    nowMs: t0,
  });
  assert.equal(wd1.request.status, 'PENDING_ADMIN_SETTLEMENT');
  assert.equal(wd1.wallet.availableBalancePaise, 20000);
  assert.equal(wd1.wallet.pendingWithdrawalPaise, 10000);

  // Second withdrawal while pending blocked
  await assert.rejects(
    () =>
      requestPhleboWithdrawal({
        phleboId: 'PHL-W-3',
        phleboName: 'Suresh',
        requestedAmountPaise: 10000,
        nowMs: t0 + 1000,
      }),
    /already have an active withdrawal/
  );

  // Admin review -> hold -> reject (releases reserved funds)
  const rev = await transitionWithdrawalStatusByAdmin({
    requestId: wd1.request.id,
    targetStatus: 'UNDER_REVIEW',
    adminUid: 'ADM-1',
    adminEmail: 'finance@labsetu.com',
  });
  assert.equal(rev.status, 'UNDER_REVIEW');

  const held = await transitionWithdrawalStatusByAdmin({
    requestId: wd1.request.id,
    targetStatus: 'ON_HOLD',
    reason: 'Checking bank passbook name',
    adminUid: 'ADM-1',
    adminEmail: 'finance@labsetu.com',
  });
  assert.equal(held.status, 'ON_HOLD');

  const rej = await transitionWithdrawalStatusByAdmin({
    requestId: wd1.request.id,
    targetStatus: 'REJECTED',
    reason: 'Name mismatch on bank account',
    adminUid: 'ADM-1',
    adminEmail: 'finance@labsetu.com',
  });
  assert.equal(rej.status, 'REJECTED');

  const wAfterReject = await getPhleboWallet('PHL-W-3');
  assert.equal(wAfterReject.availableBalancePaise, 30000);
  assert.equal(wAfterReject.pendingWithdrawalPaise, 0);

  // New withdrawal allowed under ALLOW_RETRY_IN_CYCLE policy
  const wd2 = await requestPhleboWithdrawal({
    phleboId: 'PHL-W-3',
    phleboName: 'Suresh',
    requestedAmountPaise: 20000,
    nowMs: t0 + 5000,
  });
  assert.equal(wd2.wallet.availableBalancePaise, 10000);
  assert.equal(wd2.wallet.pendingWithdrawalPaise, 20000);

  // Missing UTR rejected
  await assert.rejects(
    () =>
      settleWithdrawalManuallyByAdmin({
        requestId: wd2.request.id,
        actualAmountPaise: 20000,
        paymentMethod: 'IMPS',
        transactionReference: '12',
        paymentDate: '2026-11-27',
        paymentTime: '11:00',
        adminUid: 'ADM-1',
        adminEmail: 'finance@labsetu.com',
      }),
    /Valid external UTR/
  );

  // Settle manually with valid UTR
  const settled = await settleWithdrawalManuallyByAdmin({
    requestId: wd2.request.id,
    actualAmountPaise: 20000,
    paymentMethod: 'IMPS',
    transactionReference: 'IMPS9988776655',
    paymentDate: '2026-11-27',
    paymentTime: '11:05',
    adminUid: 'ADM-1',
    adminEmail: 'finance@labsetu.com',
  });
  assert.equal(settled.request.status, 'MANUAL_PAID');
  assert.equal(settled.settlement.referenceSource, 'ADMIN_RECORDED');
  assert.equal(settled.wallet.pendingWithdrawalPaise, 0);
  assert.equal(settled.wallet.totalSettledPaise, 20000);

  // Cannot settle again
  await assert.rejects(
    () =>
      settleWithdrawalManuallyByAdmin({
        requestId: wd2.request.id,
        actualAmountPaise: 20000,
        paymentMethod: 'IMPS',
        transactionReference: 'IMPS1122334455',
        paymentDate: '2026-11-27',
        paymentTime: '11:06',
        adminUid: 'ADM-1',
        adminEmail: 'finance@labsetu.com',
      }),
    /Duplicate|already settled/
  );

  // Second withdrawal within 7 days rejected
  await assert.rejects(
    () =>
      requestPhleboWithdrawal({
        phleboId: 'PHL-W-3',
        phleboName: 'Suresh',
        requestedAmountPaise: 10000,
        nowMs: t0 + 2 * 24 * 60 * 60 * 1000,
      }),
    /Weekly withdrawal limit/
  );

  // After 7 days, allowed!
  const wd3 = await requestPhleboWithdrawal({
    phleboId: 'PHL-W-3',
    phleboName: 'Suresh',
    requestedAmountPaise: 10000,
    nowMs: t0 + 8 * 24 * 60 * 60 * 1000,
  });
  assert.equal(wd3.request.status, 'PENDING_ADMIN_SETTLEMENT');

  // Duplicate UTR rejected on wd3
  await assert.rejects(
    () =>
      settleWithdrawalManuallyByAdmin({
        requestId: wd3.request.id,
        actualAmountPaise: 10000,
        paymentMethod: 'IMPS',
        transactionReference: 'IMPS9988776655',
        paymentDate: '2026-12-05',
        paymentTime: '10:00',
        adminUid: 'ADM-1',
        adminEmail: 'finance@labsetu.com',
      }),
    /Duplicate transaction reference/
  );

  // Reconciliation check: 0 mismatches, 0 duplicate UTRs
  const recon = await reconcileWalletsAndWithdrawals();
  assert.equal(recon.mismatchedWallets.length, 0);
  assert.equal(recon.duplicateUtrs.length, 0);
  assert.equal(recon.orphanedWithdrawals.length, 0);

  const ledger = await listWalletTransactions('PHL-W-3');
  assert.ok(ledger.length >= 4);
});

test('Wallet QA 22: Private QR image upload validation & admin access', async () => {
  const validPngB64 = Buffer.alloc(512, 1).toString('base64');
  const saved = await savePhleboQrImage({
    phleboId: 'PHL-QR-1',
    mimeType: 'image/png',
    base64Data: validPngB64,
  });
  assert.equal(saved.stored, true);
  assert.match(saved.storagePath, /^private-phlebo-qr\/PHL-QR-1\//);

  const qrAccess = await getPrivatePhleboQrForAdmin('PHL-QR-1');
  assert.equal(qrAccess.available, true);
  assert.ok(qrAccess.dataUrl?.startsWith('data:image/png;base64,'));
});
