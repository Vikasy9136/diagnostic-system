import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteBeneficiaryQr,
  getBeneficiaryPayoutSummary,
  getBeneficiaryQrPreview,
  resetBeneficiaryPayoutTestStores,
  revealSensitiveBeneficiaryBankForAdmin,
  saveBeneficiaryBankAccount,
  saveBeneficiaryQr,
  saveBeneficiaryUpiAccount,
  setBeneficiaryDefaultMethod,
} from '../services/beneficiaryPayout.service';
import {
  creditBookingEarningAtomically,
  requestPhleboWithdrawal,
  resetInMemoryWalletStores,
  settleWithdrawalManuallyByAdmin,
} from '../services/wallet.service';

const SAMPLE_PNG_B64 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' + '00'.repeat(120),
  'hex'
).toString('base64');

function mockIfscFetch() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('ifsc.razorpay.com/HDFC0000123')) {
      return new Response(
        JSON.stringify({
          IFSC: 'HDFC0000123',
          BANK: 'HDFC Bank',
          BANKCODE: 'HDFC',
          BRANCH: 'Andheri West Branch',
          ADDRESS: 'Link Road, Mumbai',
          CITY: 'Mumbai',
          DISTRICT: 'Mumbai',
          STATE: 'Maharashtra',
          IMPS: true,
          NEFT: true,
          RTGS: true,
          UPI: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('ifsc.razorpay.com/SBIN0001234')) {
      return new Response(
        JSON.stringify({
          IFSC: 'SBIN0001234',
          BANK: 'State Bank of India',
          BANKCODE: 'SBIN',
          BRANCH: 'Dadar West',
          ADDRESS: 'Dadar, Mumbai',
          CITY: 'Mumbai',
          DISTRICT: 'Mumbai',
          STATE: 'Maharashtra',
          IMPS: true,
          NEFT: true,
          RTGS: true,
          UPI: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('E2E Phlebo flow: Bank + UPI + QR -> Withdrawal -> Admin Reveal & UTR Settlement', async () => {
  const restoreFetch = mockIfscFetch();
  resetBeneficiaryPayoutTestStores();
  resetInMemoryWalletStores();
  try {
    // 1. Add Bank + UPI + QR for Phlebo
    await saveBeneficiaryBankAccount({
      beneficiaryType: 'PHLEBOTOMIST',
      beneficiaryId: 'PHL-E2E-1',
      accountHolderName: 'Ramesh Kumar',
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
      makeDefault: true,
      actorEmail: 'ramesh@labsetu.com',
    });

    await saveBeneficiaryUpiAccount({
      beneficiaryType: 'PHLEBOTOMIST',
      beneficiaryId: 'PHL-E2E-1',
      upiId: 'ramesh.phlebo@okaxis',
      confirmUpiId: 'ramesh.phlebo@okaxis',
      makeDefault: true,
      actorEmail: 'ramesh@labsetu.com',
    });

    const afterQr = await saveBeneficiaryQr({
      beneficiaryType: 'PHLEBOTOMIST',
      beneficiaryId: 'PHL-E2E-1',
      mimeType: 'image/png',
      base64Data: SAMPLE_PNG_B64,
      source: 'UPLOADED',
      decodedUpiUri: 'upi://pay?pa=ramesh.phlebo@okaxis&pn=Ramesh%20Kumar',
      actorEmail: 'ramesh@labsetu.com',
    });

    assert.equal(afterQr.defaultMethod, 'UPI');
    assert.equal(afterQr.qrCode?.available, true);
    assert.equal(afterQr.qrCode?.consistencyStatus, 'MATCHED');
    assert.ok((afterQr.profileVersion || 0) >= 3);

    // 2. Credit wallet & submit withdrawal
    await creditBookingEarningAtomically({
      phleboId: 'PHL-E2E-1',
      phleboName: 'Ramesh Kumar',
      bookingId: 'ORD-E2E-1',
      orderNumber: 'LS-E2E-1',
      grossEarningInr: 500,
      handoverConfirmed: true,
      otpOrLabConfirmed: true,
    });

    const wd = await requestPhleboWithdrawal({
      beneficiaryType: 'PHLEBOTOMIST',
      phleboId: 'PHL-E2E-1',
      phleboName: 'Ramesh Kumar',
      requestedAmountPaise: 40000,
      paymentMethod: 'UPI',
    });

    assert.equal(wd.request.beneficiaryType, 'PHLEBOTOMIST');
    assert.equal(wd.request.payoutProfileVersion, afterQr.profileVersion);
    assert.equal(wd.request.payoutSnapshot?.ifsc, 'SBIN0001234');
    assert.equal(wd.request.payoutSnapshot?.qrAvailable, true);

    // 3. Admin views QR + reveals full details + settles with UTR
    const qrPreview = await getBeneficiaryQrPreview({
      beneficiaryType: 'PHLEBOTOMIST',
      beneficiaryId: 'PHL-E2E-1',
      isAdminAccess: true,
      adminEmail: 'finance@labsetu.com',
    } as Parameters<typeof getBeneficiaryQrPreview>[0]);
    assert.equal(qrPreview.available, true);

    const sensitive = await revealSensitiveBeneficiaryBankForAdmin({
      beneficiaryType: 'PHLEBOTOMIST',
      beneficiaryId: 'PHL-E2E-1',
      adminEmail: 'finance@labsetu.com',
    });
    assert.equal(sensitive.accountNumber, '123456789012');
    assert.equal(sensitive.upiId, 'ramesh.phlebo@okaxis');

    const settled = await settleWithdrawalManuallyByAdmin({
      requestId: wd.request.id,
      actualAmountPaise: 40000,
      paymentMethod: 'UPI',
      transactionReference: 'UTR429900112233',
      paymentDate: '2026-11-27',
      paymentTime: '14:30',
      adminUid: 'ADM-FIN-1',
      adminEmail: 'finance@labsetu.com',
    });
    assert.equal(settled.request.status, 'MANUAL_PAID');
    assert.equal(settled.wallet.totalSettledPaise, 40000);
  } finally {
    restoreFetch();
  }
});

test('E2E Large Lab flow: Bank + UPI + QR upload/delete -> Withdrawal -> Admin Settlement', async () => {
  const restoreFetch = mockIfscFetch();
  resetBeneficiaryPayoutTestStores();
  resetInMemoryWalletStores();
  try {
    await saveBeneficiaryBankAccount({
      beneficiaryType: 'LARGE_LAB',
      beneficiaryId: 'LAB-LG-9001',
      accountHolderName: 'Metro Diagnostics Pvt Ltd',
      accountNumber: '987654321098',
      confirmAccountNumber: '987654321098',
      ifscCode: 'HDFC0000123',
      makeDefault: true,
      actorEmail: 'metro@labsetu.com',
    });

    await saveBeneficiaryUpiAccount({
      beneficiaryType: 'LARGE_LAB',
      beneficiaryId: 'LAB-LG-9001',
      upiId: 'metro@hdfcbank',
      confirmUpiId: 'metro@hdfcbank',
      makeDefault: false,
      actorEmail: 'metro@labsetu.com',
    });

    await saveBeneficiaryQr({
      beneficiaryType: 'LARGE_LAB',
      beneficiaryId: 'LAB-LG-9001',
      mimeType: 'image/png',
      base64Data: SAMPLE_PNG_B64,
      source: 'UPLOADED',
      decodedUpiUri: 'upi://pay?pa=metro@hdfcbank&pn=Metro%20Diagnostics',
    });

    const deletedQr = await deleteBeneficiaryQr({
      beneficiaryType: 'LARGE_LAB',
      beneficiaryId: 'LAB-LG-9001',
      actorEmail: 'metro@labsetu.com',
    });
    assert.equal(deletedQr.qrCode?.available, false);

    await setBeneficiaryDefaultMethod({
      beneficiaryType: 'LARGE_LAB',
      beneficiaryId: 'LAB-LG-9001',
      defaultMethod: 'BANK_ACCOUNT',
    });

    const summary = await getBeneficiaryPayoutSummary('LARGE_LAB', 'LAB-LG-9001');
    assert.equal(summary.beneficiaryType, 'LARGE_LAB');
    assert.equal(summary.bankAccount?.bankName, 'HDFC Bank');
    assert.equal(summary.bankAccount?.branchName, 'Andheri West Branch');

    await creditBookingEarningAtomically({
      phleboId: 'LAB-LG-9001',
      phleboName: 'Metro Diagnostics Pvt Ltd',
      bookingId: 'ORD-LL-1',
      orderNumber: 'LS-LL-1',
      grossEarningInr: 1200,
      handoverConfirmed: true,
      otpOrLabConfirmed: true,
    });

    const wd = await requestPhleboWithdrawal({
      beneficiaryType: 'LARGE_LAB',
      phleboId: 'LAB-LG-9001',
      phleboName: 'Metro Diagnostics Pvt Ltd',
      requestedAmountPaise: 100000,
      paymentMethod: 'BANK_ACCOUNT',
    });
    assert.equal(wd.request.beneficiaryType, 'LARGE_LAB');
    assert.equal(wd.request.payoutSnapshot?.bankName, 'HDFC Bank');

    const settled = await settleWithdrawalManuallyByAdmin({
      requestId: wd.request.id,
      actualAmountPaise: 100000,
      paymentMethod: 'NEFT',
      transactionReference: 'NEFT8877665544',
      paymentDate: '2026-11-27',
      paymentTime: '14:35',
      adminUid: 'ADM-FIN-1',
      adminEmail: 'finance@labsetu.com',
    });
    assert.equal(settled.request.status, 'MANUAL_PAID');
    assert.equal(settled.wallet.totalSettledPaise, 100000);
  } finally {
    restoreFetch();
  }
});
