import {
  type BankVerificationStatus,
  deepCleanFirestorePayload,
  type PhleboBankAccountMasked,
  type PhleboPaymentMethodSummary,
  type PhleboUpiAccountMasked,
} from '@diagnostic/shared';
import { initializeFirebase } from '../config/firebase';
import { AppError } from '../middleware/errorHandler';
import { recordAuditLog } from '../middleware/rbac';
import {
  decryptSensitiveField,
  type EncryptedFieldEnvelope,
  encryptSensitiveField,
  isValidBankAccountNumber,
  isValidUpiVpa,
  maskAccountNumber,
  maskUpiId,
} from './bankCrypto.service';
import { lookupIfscDetails } from './bankDirectory.service';

interface StoredBankDoc {
  id: string;
  phleboId: string;
  bankCode: string;
  bankName: string;
  branchName: string;
  branchAddress?: string;
  branchCity?: string;
  branchDistrict?: string;
  branchState?: string;
  ifsc: string;
  accountHolderName: string;
  encryptedAccountNumber: EncryptedFieldEnvelope;
  maskedAccountNumber: string;
  last4: string;
  verificationStatus: BankVerificationStatus;
  keyVersion: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredUpiDoc {
  id: string;
  phleboId: string;
  encryptedUpiId: EncryptedFieldEnvelope;
  maskedUpiId: string;
  vpaHandle: string;
  verificationStatus: BankVerificationStatus;
  verifiedName?: string;
  keyVersion: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const inMemoryBankStore = new Map<string, StoredBankDoc>();
const inMemoryUpiStore = new Map<string, StoredUpiDoc>();
const inMemoryMethodStore = new Map<string, { defaultMethod: 'BANK_ACCOUNT' | 'UPI' | 'NONE'; updatedAt: string }>();

function toMaskedBank(doc: StoredBankDoc): PhleboBankAccountMasked {
  return {
    id: doc.id,
    phleboId: doc.phleboId,
    bankCode: doc.bankCode,
    bankName: doc.bankName,
    branchName: doc.branchName,
    branchAddress: doc.branchAddress,
    branchCity: doc.branchCity,
    branchState: doc.branchState,
    ifsc: doc.ifsc,
    accountHolderName: doc.accountHolderName,
    maskedAccountNumber: doc.maskedAccountNumber,
    last4: doc.last4,
    verificationStatus: doc.verificationStatus,
    keyVersion: doc.keyVersion,
    isDefault: doc.isDefault,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

function toMaskedUpi(doc: StoredUpiDoc): PhleboUpiAccountMasked {
  return {
    id: doc.id,
    phleboId: doc.phleboId,
    maskedUpiId: doc.maskedUpiId,
    vpaHandle: doc.vpaHandle,
    verificationStatus: doc.verificationStatus,
    verifiedName: doc.verifiedName,
    keyVersion: doc.keyVersion,
    isDefault: doc.isDefault,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

export async function getPhleboPaymentSummary(phleboId: string): Promise<PhleboPaymentMethodSummary> {
  const { db, isMockMode } = initializeFirebase();
  let bankDoc: StoredBankDoc | null = null;
  let upiDoc: StoredUpiDoc | null = null;
  let defaultMethod: 'BANK_ACCOUNT' | 'UPI' | 'NONE' = 'NONE';
  let linkedAccountStatus: PhleboPaymentMethodSummary['linkedAccountStatus'] = 'NOT_CREATED';
  let linkedAccountId: string | undefined;
  let updatedAt = new Date().toISOString();

  if (db && !isMockMode) {
    const [bSnap, uSnap, mSnap, lSnap] = await Promise.all([
      db.collection('phlebo_bank_accounts').doc(phleboId).get(),
      db.collection('phlebo_upi_accounts').doc(phleboId).get(),
      db.collection('phlebo_payment_methods').doc(phleboId).get(),
      db.collection('phlebo_linked_accounts').doc(phleboId).get(),
    ]);
    if (bSnap.exists) bankDoc = bSnap.data() as StoredBankDoc;
    if (uSnap.exists) upiDoc = uSnap.data() as StoredUpiDoc;
    if (mSnap.exists) {
      const mData = mSnap.data() as { defaultMethod?: 'BANK_ACCOUNT' | 'UPI' | 'NONE'; updatedAt?: string };
      if (mData.defaultMethod) defaultMethod = mData.defaultMethod;
      if (mData.updatedAt) updatedAt = mData.updatedAt;
    }
    if (lSnap.exists) {
      const lData = lSnap.data() as { status?: PhleboPaymentMethodSummary['linkedAccountStatus']; linkedAccountId?: string };
      if (lData.status) linkedAccountStatus = lData.status;
      linkedAccountId = lData.linkedAccountId;
    }
  } else {
    bankDoc = inMemoryBankStore.get(phleboId) || null;
    upiDoc = inMemoryUpiStore.get(phleboId) || null;
    const m = inMemoryMethodStore.get(phleboId);
    if (m) {
      defaultMethod = m.defaultMethod;
      updatedAt = m.updatedAt;
    }
  }

  return {
    phleboId,
    defaultMethod,
    bankAccount: bankDoc ? toMaskedBank(bankDoc) : null,
    upiAccount: upiDoc ? toMaskedUpi(upiDoc) : null,
    linkedAccountStatus,
    linkedAccountId,
    updatedAt,
  };
}

export async function savePhleboBankAccount(params: {
  phleboId: string;
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  selectedBankCode?: string;
  makeDefault?: boolean;
  actorUid?: string;
  actorEmail?: string;
}): Promise<PhleboPaymentMethodSummary> {
  const holder = params.accountHolderName.trim();
  const acct = params.accountNumber.replace(/\s+/g, '');
  const confirmAcct = params.confirmAccountNumber.replace(/\s+/g, '');
  const ifsc = params.ifscCode.trim().toUpperCase();

  if (holder.length < 3) {
    throw new AppError('Account holder name must be at least 3 characters.', 400, 'INVALID_ACCOUNT_HOLDER');
  }
  if (!isValidBankAccountNumber(acct)) {
    throw new AppError('Bank account number must be 9 to 18 digits.', 400, 'INVALID_ACCOUNT_NUMBER');
  }
  if (acct !== confirmAcct) {
    throw new AppError('Account number and Confirm account number do not match.', 400, 'ACCOUNT_MISMATCH');
  }

  // Always verify IFSC via backend service (never trust client branch/bank fields)
  const ifscDetails = await lookupIfscDetails(ifsc);
  if (params.selectedBankCode && ifscDetails.bankCode && params.selectedBankCode !== ifscDetails.bankCode) {
    // Allow minor bank-code aliases (e.g. merged banks) only if name matches; otherwise warn clearly
    const prefixMatch = ifsc.startsWith(params.selectedBankCode.toUpperCase());
    if (!prefixMatch && !ifscDetails.bank.toLowerCase().includes(params.selectedBankCode.toLowerCase())) {
      throw new AppError(
        `IFSC "${ifsc}" belongs to ${ifscDetails.bank} (${ifscDetails.bankCode}), not the selected bank.`,
        400,
        'IFSC_BANK_MISMATCH'
      );
    }
  }

  const envelope = encryptSensitiveField(acct);
  const masked = maskAccountNumber(acct);
  const last4 = acct.slice(-4);
  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();

  let existing: StoredBankDoc | null = null;
  if (db && !isMockMode) {
    const snap = await db.collection('phlebo_bank_accounts').doc(params.phleboId).get();
    if (snap.exists) existing = snap.data() as StoredBankDoc;
  } else {
    existing = inMemoryBankStore.get(params.phleboId) || null;
  }

  // Whenever bank details are added or changed, require verification before releasing payouts
  const verificationStatus: BankVerificationStatus = existing
    ? 'REVERIFICATION_REQUIRED'
    : 'PENDING_VERIFICATION';

  const makeDefault = params.makeDefault !== false;
  const docPayload: StoredBankDoc = {
    id: params.phleboId,
    phleboId: params.phleboId,
    bankCode: ifscDetails.bankCode,
    bankName: ifscDetails.bank,
    branchName: ifscDetails.branch,
    branchAddress: ifscDetails.address,
    branchCity: ifscDetails.city,
    branchDistrict: ifscDetails.district,
    branchState: ifscDetails.state,
    ifsc: ifscDetails.ifsc,
    accountHolderName: holder,
    encryptedAccountNumber: envelope,
    maskedAccountNumber: masked,
    last4,
    verificationStatus,
    keyVersion: envelope.keyVersion,
    isDefault: makeDefault,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (db && !isMockMode) {
    await db.collection('phlebo_bank_accounts').doc(params.phleboId).set(deepCleanFirestorePayload(docPayload));
    await db.collection('phlebo_payment_methods').doc(params.phleboId).set(
      {
        phleboId: params.phleboId,
        ...(makeDefault ? { defaultMethod: 'BANK_ACCOUNT' } : {}),
        bankLast4: last4,
        bankName: ifscDetails.bank,
        ifsc: ifscDetails.ifsc,
        bankVerificationStatus: verificationStatus,
        updatedAt: now,
      },
      { merge: true }
    );
    // Keep only non-sensitive masked metadata on phlebotomists/{id} (never plaintext account number!)
    await db.collection('phlebotomists').doc(params.phleboId).set(
      {
        payoutProfile: {
          accountHolderName: holder,
          bankName: ifscDetails.bank,
          branchName: ifscDetails.branch,
          bankAccountLast4: last4,
          maskedAccountNumber: masked,
          ifscCode: ifscDetails.ifsc,
          verificationStatus,
          defaultMethod: makeDefault ? 'BANK_ACCOUNT' : undefined,
          updatedAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } else {
    inMemoryBankStore.set(params.phleboId, docPayload);
    if (makeDefault) {
      inMemoryMethodStore.set(params.phleboId, { defaultMethod: 'BANK_ACCOUNT', updatedAt: now });
    }
  }

  await recordAuditLog({
    actorUid: params.actorUid || params.phleboId,
    actorEmail: params.actorEmail,
    actorRole: 'PHLEBOTOMIST',
    action: existing ? 'PHLEBO_BANK_ACCOUNT_UPDATED' : 'PHLEBO_BANK_ACCOUNT_ADDED',
    resourceType: 'PHLEBO_BANK_ACCOUNT',
    resourceId: params.phleboId,
    departmentId: 'FINANCE_BUSINESS',
    severity: 'SENSITIVE',
    summary: `Phlebo ${params.phleboId} saved masked bank ${masked} (${ifscDetails.bank}, ${ifscDetails.ifsc}); status=${verificationStatus}`,
  });

  return getPhleboPaymentSummary(params.phleboId);
}

export async function savePhleboUpiAccount(params: {
  phleboId: string;
  upiId: string;
  confirmUpiId: string;
  makeDefault?: boolean;
  actorUid?: string;
  actorEmail?: string;
}): Promise<PhleboPaymentMethodSummary> {
  const upi = params.upiId.trim().toLowerCase();
  const confirmUpi = params.confirmUpiId.trim().toLowerCase();

  if (!isValidUpiVpa(upi)) {
    throw new AppError('Invalid UPI ID format (expected format like name@bank).', 400, 'INVALID_UPI_ID');
  }
  if (upi !== confirmUpi) {
    throw new AppError('UPI ID and Confirm UPI ID do not match.', 400, 'UPI_MISMATCH');
  }

  const envelope = encryptSensitiveField(upi);
  const masked = maskUpiId(upi);
  const handle = upi.split('@')[1] || '';
  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();

  let existing: StoredUpiDoc | null = null;
  if (db && !isMockMode) {
    const snap = await db.collection('phlebo_upi_accounts').doc(params.phleboId).get();
    if (snap.exists) existing = snap.data() as StoredUpiDoc;
  } else {
    existing = inMemoryUpiStore.get(params.phleboId) || null;
  }

  const verificationStatus: BankVerificationStatus = 'PENDING_VERIFICATION';
  const makeDefault = Boolean(params.makeDefault);

  const docPayload: StoredUpiDoc = {
    id: params.phleboId,
    phleboId: params.phleboId,
    encryptedUpiId: envelope,
    maskedUpiId: masked,
    vpaHandle: handle,
    verificationStatus,
    keyVersion: envelope.keyVersion,
    isDefault: makeDefault,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (db && !isMockMode) {
    await db.collection('phlebo_upi_accounts').doc(params.phleboId).set(deepCleanFirestorePayload(docPayload));
    await db.collection('phlebo_payment_methods').doc(params.phleboId).set(
      {
        phleboId: params.phleboId,
        ...(makeDefault ? { defaultMethod: 'UPI' } : {}),
        maskedUpiId: masked,
        upiVerificationStatus: verificationStatus,
        updatedAt: now,
      },
      { merge: true }
    );
    await db.collection('phlebotomists').doc(params.phleboId).set(
      {
        payoutProfile: {
          maskedUpiId: masked,
          upiVerificationStatus: verificationStatus,
          ...(makeDefault ? { defaultMethod: 'UPI' } : {}),
          updatedAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } else {
    inMemoryUpiStore.set(params.phleboId, docPayload);
    if (makeDefault) {
      inMemoryMethodStore.set(params.phleboId, { defaultMethod: 'UPI', updatedAt: now });
    }
  }

  await recordAuditLog({
    actorUid: params.actorUid || params.phleboId,
    actorEmail: params.actorEmail,
    actorRole: 'PHLEBOTOMIST',
    action: existing ? 'PHLEBO_UPI_UPDATED' : 'PHLEBO_UPI_ADDED',
    resourceType: 'PHLEBO_UPI_ACCOUNT',
    resourceId: params.phleboId,
    departmentId: 'FINANCE_BUSINESS',
    severity: 'SENSITIVE',
    summary: `Phlebo ${params.phleboId} saved masked UPI ${masked}; status=${verificationStatus}`,
  });

  return getPhleboPaymentSummary(params.phleboId);
}

export async function setPhleboDefaultMethod(
  phleboId: string,
  method: 'BANK_ACCOUNT' | 'UPI',
  actorUid?: string,
  actorEmail?: string
): Promise<PhleboPaymentMethodSummary> {
  const summary = await getPhleboPaymentSummary(phleboId);
  if (method === 'BANK_ACCOUNT' && !summary.bankAccount) {
    throw new AppError('Add a bank account before setting it as default.', 400, 'BANK_DETAILS_NOT_ADDED');
  }
  if (method === 'UPI' && !summary.upiAccount) {
    throw new AppError('Add a UPI ID before setting it as default.', 400, 'BANK_DETAILS_NOT_ADDED');
  }

  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();
  if (db && !isMockMode) {
    await db.collection('phlebo_payment_methods').doc(phleboId).set(
      { phleboId, defaultMethod: method, updatedAt: now },
      { merge: true }
    );
    await db.collection('phlebotomists').doc(phleboId).set(
      { payoutProfile: { defaultMethod: method, updatedAt: now }, updatedAt: now },
      { merge: true }
    );
  } else {
    inMemoryMethodStore.set(phleboId, { defaultMethod: method, updatedAt: now });
  }

  await recordAuditLog({
    actorUid: actorUid || phleboId,
    actorEmail,
    action: 'PHLEBO_DEFAULT_PAYOUT_METHOD_CHANGED',
    resourceType: 'PHLEBO_PAYMENT_METHOD',
    resourceId: phleboId,
    departmentId: 'FINANCE_BUSINESS',
    severity: 'INFO',
    summary: `Phlebo ${phleboId} default payout method switched to ${method}`,
  });

  return getPhleboPaymentSummary(phleboId);
}

export async function verifyPhleboPaymentMethodByAdmin(params: {
  phleboId: string;
  target: 'BANK_ACCOUNT' | 'UPI';
  status: 'VERIFIED' | 'FAILED';
  notes?: string;
  adminUid?: string;
  adminEmail: string;
}): Promise<PhleboPaymentMethodSummary> {
  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();
  const col = params.target === 'BANK_ACCOUNT' ? 'phlebo_bank_accounts' : 'phlebo_upi_accounts';

  if (db && !isMockMode) {
    const snap = await db.collection(col).doc(params.phleboId).get();
    if (!snap.exists) {
      throw new AppError(`No ${params.target} record found for ${params.phleboId}`, 404, 'NOT_FOUND');
    }
    await snap.ref.set({ verificationStatus: params.status, updatedAt: now }, { merge: true });
    await db.collection('phlebo_payment_methods').doc(params.phleboId).set(
      {
        ...(params.target === 'BANK_ACCOUNT'
          ? { bankVerificationStatus: params.status }
          : { upiVerificationStatus: params.status }),
        updatedAt: now,
      },
      { merge: true }
    );
    await db.collection('phlebotomists').doc(params.phleboId).set(
      {
        payoutProfile: {
          ...(params.target === 'BANK_ACCOUNT'
            ? { verificationStatus: params.status }
            : { upiVerificationStatus: params.status }),
          updatedAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } else {
    if (params.target === 'BANK_ACCOUNT') {
      const b = inMemoryBankStore.get(params.phleboId);
      if (!b) throw new AppError('Bank account not found', 404, 'NOT_FOUND');
      b.verificationStatus = params.status;
      b.updatedAt = now;
    } else {
      const u = inMemoryUpiStore.get(params.phleboId);
      if (!u) throw new AppError('UPI account not found', 404, 'NOT_FOUND');
      u.verificationStatus = params.status;
      u.updatedAt = now;
    }
  }

  await recordAuditLog({
    actorUid: params.adminUid,
    actorEmail: params.adminEmail,
    actorRole: 'ADMIN',
    action: `ADMIN_${params.target}_VERIFICATION_${params.status}`,
    resourceType: col.toUpperCase(),
    resourceId: params.phleboId,
    departmentId: 'FINANCE_BUSINESS',
    severity: 'SENSITIVE',
    summary: `Admin ${params.adminEmail} marked ${params.target} for ${params.phleboId} as ${params.status}. ${params.notes || ''}`.trim(),
  });

  return getPhleboPaymentSummary(params.phleboId);
}

export async function revealPhleboSensitiveDetailsForAdmin(params: {
  phleboId: string;
  reason: string;
  adminUid: string;
  adminEmail: string;
  adminRole?: string;
}): Promise<{
  phleboId: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  upiId?: string;
  expiresAt: string;
}> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new AppError(
      'A clear audit reason (minimum 8 characters) is required to reveal sensitive bank details.',
      400,
      'AUDIT_REASON_REQUIRED'
    );
  }

  const { db, isMockMode } = initializeFirebase();
  let bankDoc: StoredBankDoc | null = null;
  let upiDoc: StoredUpiDoc | null = null;

  if (db && !isMockMode) {
    const [bSnap, uSnap] = await Promise.all([
      db.collection('phlebo_bank_accounts').doc(params.phleboId).get(),
      db.collection('phlebo_upi_accounts').doc(params.phleboId).get(),
    ]);
    if (bSnap.exists) bankDoc = bSnap.data() as StoredBankDoc;
    if (uSnap.exists) upiDoc = uSnap.data() as StoredUpiDoc;
  } else {
    bankDoc = inMemoryBankStore.get(params.phleboId) || null;
    upiDoc = inMemoryUpiStore.get(params.phleboId) || null;
  }

  if (!bankDoc && !upiDoc) {
    throw new AppError('No bank or UPI details found for this Phlebotomist.', 404, 'NOT_FOUND');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 1000).toISOString();

  await recordAuditLog({
    actorUid: params.adminUid,
    actorEmail: params.adminEmail,
    actorRole: params.adminRole || 'ADMIN',
    action: 'ADMIN_REVEAL_PHLEBO_BANK_DETAILS',
    resourceType: 'PHLEBO_BANK_ACCOUNT',
    resourceId: params.phleboId,
    departmentId: 'FINANCE_BUSINESS',
    severity: 'CRITICAL',
    summary: `Admin ${params.adminEmail} revealed decrypted bank/UPI for ${params.phleboId}. Reason: ${reason}`,
    details: { reason, expiresAt },
  });

  if (db && !isMockMode) {
    await db.collection('payout_audit_logs').add({
      actorUid: params.adminUid,
      actorEmail: params.adminEmail,
      action: 'REVEAL_SENSITIVE_BANK_DETAILS',
      phleboId: params.phleboId,
      reason,
      expiresAt,
      createdAt: now.toISOString(),
    });
  }

  return {
    phleboId: params.phleboId,
    accountHolderName: bankDoc?.accountHolderName,
    accountNumber: bankDoc ? decryptSensitiveField(bankDoc.encryptedAccountNumber) : undefined,
    ifsc: bankDoc?.ifsc,
    bankName: bankDoc?.bankName,
    upiId: upiDoc ? decryptSensitiveField(upiDoc.encryptedUpiId) : undefined,
    expiresAt,
  };
}

/**
 * Internal-only helper used by the backend payout engine when initiating a provider transfer/payout.
 * Never exposed to client APIs.
 */
export async function getDecryptedPayoutDestinationForEngine(phleboId: string): Promise<{
  method: 'BANK_ACCOUNT' | 'UPI' | 'NONE';
  verified: boolean;
  maskedDestination: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  upiId?: string;
}> {
  const { db, isMockMode } = initializeFirebase();
  let bankDoc: StoredBankDoc | null = null;
  let upiDoc: StoredUpiDoc | null = null;
  let defaultMethod: 'BANK_ACCOUNT' | 'UPI' | 'NONE' = 'NONE';

  if (db && !isMockMode) {
    const [bSnap, uSnap, mSnap] = await Promise.all([
      db.collection('phlebo_bank_accounts').doc(phleboId).get(),
      db.collection('phlebo_upi_accounts').doc(phleboId).get(),
      db.collection('phlebo_payment_methods').doc(phleboId).get(),
    ]);
    if (bSnap.exists) bankDoc = bSnap.data() as StoredBankDoc;
    if (uSnap.exists) upiDoc = uSnap.data() as StoredUpiDoc;
    if (mSnap.exists) {
      defaultMethod = (mSnap.data()?.defaultMethod as 'BANK_ACCOUNT' | 'UPI' | 'NONE') || 'NONE';
    }
  } else {
    bankDoc = inMemoryBankStore.get(phleboId) || null;
    upiDoc = inMemoryUpiStore.get(phleboId) || null;
    defaultMethod = inMemoryMethodStore.get(phleboId)?.defaultMethod || 'NONE';
  }

  if (defaultMethod === 'NONE') {
    defaultMethod = bankDoc ? 'BANK_ACCOUNT' : upiDoc ? 'UPI' : 'NONE';
  }

  if (defaultMethod === 'UPI' && upiDoc) {
    return {
      method: 'UPI',
      verified: upiDoc.verificationStatus === 'VERIFIED',
      maskedDestination: upiDoc.maskedUpiId,
      upiId: decryptSensitiveField(upiDoc.encryptedUpiId),
    };
  }

  if (bankDoc) {
    return {
      method: 'BANK_ACCOUNT',
      verified: bankDoc.verificationStatus === 'VERIFIED',
      maskedDestination: `${bankDoc.bankName} ${bankDoc.maskedAccountNumber} (${bankDoc.ifsc})`,
      accountHolderName: bankDoc.accountHolderName,
      accountNumber: decryptSensitiveField(bankDoc.encryptedAccountNumber),
      ifsc: bankDoc.ifsc,
      bankName: bankDoc.bankName,
    };
  }

  return {
    method: 'NONE',
    verified: false,
    maskedDestination: 'Not Configured',
  };
}
