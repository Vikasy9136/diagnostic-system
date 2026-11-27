import {
  type BankVerificationStatus,
  type BeneficiaryType,
  deepCleanFirestorePayload,
  parseUpiIntentUri,
  type PhleboBankAccountMasked,
  type PhleboPaymentMethodSummary,
  type PhleboUpiAccountMasked,
  type QrCodeMetadata,
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

interface StoredBeneficiaryBankDoc {
  id: string;
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  bankCode: string;
  bankName: string;
  branchName: string;
  branchAddress?: string;
  branchCity?: string;
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

interface StoredBeneficiaryUpiDoc {
  id: string;
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
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

interface StoredBeneficiaryMethodMeta {
  defaultMethod: 'BANK_ACCOUNT' | 'UPI' | 'NONE';
  profileVersion: number;
  qrStoragePath?: string;
  qrSource?: 'UPLOADED' | 'GENERATED_FROM_UPI' | 'NONE';
  qrDecodedUpiId?: string;
  qrDecodedPayeeName?: string;
  qrConsistencyStatus?: 'MATCHED' | 'MISMATCH' | 'UNVERIFIED' | 'NOT_APPLICABLE';
  qrVerificationStatus?: BankVerificationStatus;
  qrMimeType?: string;
  qrUpdatedAt?: string;
  updatedAt: string;
}

const memBanks = new Map<string, StoredBeneficiaryBankDoc>();
const memUpis = new Map<string, StoredBeneficiaryUpiDoc>();
const memMeta = new Map<string, StoredBeneficiaryMethodMeta>();
const memQrBytes = new Map<string, { mimeType: string; base64: string; updatedAt: string }>();
const memVersions = new Map<string, Array<Record<string, unknown>>>();

export function resetBeneficiaryPayoutTestStores() {
  memBanks.clear();
  memUpis.clear();
  memMeta.clear();
  memQrBytes.clear();
  memVersions.clear();
}

function keyFor(type: BeneficiaryType, id: string): string {
  return `${type}:${id}`;
}

function collectionsFor(type: BeneficiaryType) {
  if (type === 'LARGE_LAB') {
    return {
      bank: 'large_lab_bank_accounts',
      upi: 'large_lab_upi_accounts',
      meta: 'large_lab_payment_methods',
      qrPrefix: 'private-large-lab-qr',
    };
  }
  return {
    bank: 'phlebo_bank_accounts',
    upi: 'phlebo_upi_accounts',
    meta: 'phlebo_payment_methods',
    qrPrefix: 'private-phlebo-qr',
  };
}

function toMaskedBank(doc: StoredBeneficiaryBankDoc): PhleboBankAccountMasked {
  return {
    id: doc.id,
    phleboId: doc.beneficiaryId,
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
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toMaskedUpi(doc: StoredBeneficiaryUpiDoc): PhleboUpiAccountMasked {
  return {
    id: doc.id,
    phleboId: doc.beneficiaryId,
    maskedUpiId: doc.maskedUpiId,
    vpaHandle: doc.vpaHandle,
    verificationStatus: doc.verificationStatus,
    verifiedName: doc.verifiedName,
    keyVersion: doc.keyVersion,
    isDefault: doc.isDefault,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function recordProfileVersionSnapshot(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  version: number;
  summary: PhleboPaymentMethodSummary;
  actorEmail?: string;
}) {
  const { db, isMockMode } = initializeFirebase();
  const entry = {
    id: `PPV-${params.beneficiaryType}-${params.beneficiaryId}-v${params.version}`,
    beneficiaryType: params.beneficiaryType,
    beneficiaryId: params.beneficiaryId,
    version: params.version,
    defaultMethod: params.summary.defaultMethod,
    bankMasked: params.summary.bankAccount || null,
    upiMasked: params.summary.upiAccount || null,
    qrCode: params.summary.qrCode || null,
    actorEmail: params.actorEmail || params.beneficiaryId,
    createdAt: new Date().toISOString(),
  };

  if (db && !isMockMode) {
    await db
      .collection('payout_profile_versions')
      .doc(entry.id)
      .set(deepCleanFirestorePayload(entry));
  } else {
    const k = keyFor(params.beneficiaryType, params.beneficiaryId);
    const list = memVersions.get(k) || [];
    list.push(entry);
    memVersions.set(k, list);
  }
}

export async function getBeneficiaryPayoutSummary(
  beneficiaryType: BeneficiaryType,
  beneficiaryId: string
): Promise<PhleboPaymentMethodSummary> {
  const { db, isMockMode } = initializeFirebase();
  const cols = collectionsFor(beneficiaryType);
  let bankDoc: StoredBeneficiaryBankDoc | null = null;
  let upiDoc: StoredBeneficiaryUpiDoc | null = null;
  let meta: StoredBeneficiaryMethodMeta = {
    defaultMethod: 'NONE',
    profileVersion: 1,
    updatedAt: new Date().toISOString(),
  };

  if (db && !isMockMode) {
    const [bSnap, uSnap, mSnap] = await Promise.all([
      db.collection(cols.bank).doc(beneficiaryId).get(),
      db.collection(cols.upi).doc(beneficiaryId).get(),
      db.collection(cols.meta).doc(beneficiaryId).get(),
    ]);
    if (bSnap.exists) bankDoc = bSnap.data() as StoredBeneficiaryBankDoc;
    if (uSnap.exists) upiDoc = uSnap.data() as StoredBeneficiaryUpiDoc;
    if (mSnap.exists) {
      meta = { ...meta, ...(mSnap.data() as Partial<StoredBeneficiaryMethodMeta>) };
    }
  } else {
    const k = keyFor(beneficiaryType, beneficiaryId);
    bankDoc = memBanks.get(k) || null;
    upiDoc = memUpis.get(k) || null;
    meta = memMeta.get(k) || meta;
  }

  const qrCode: QrCodeMetadata = {
    available: Boolean(meta.qrStoragePath || memQrBytes.has(keyFor(beneficiaryType, beneficiaryId))),
    source: meta.qrSource || 'NONE',
    decodedUpiId: meta.qrDecodedUpiId,
    decodedPayeeName: meta.qrDecodedPayeeName,
    consistencyStatus: meta.qrConsistencyStatus || 'NOT_APPLICABLE',
    verificationStatus: meta.qrVerificationStatus || 'UNVERIFIED',
    mimeType: meta.qrMimeType,
    updatedAt: meta.qrUpdatedAt,
  };

  return {
    phleboId: beneficiaryId,
    beneficiaryType,
    beneficiaryId,
    profileVersion: meta.profileVersion || 1,
    defaultMethod: meta.defaultMethod || (bankDoc ? 'BANK_ACCOUNT' : upiDoc ? 'UPI' : 'NONE'),
    bankAccount: bankDoc ? toMaskedBank(bankDoc) : null,
    upiAccount: upiDoc ? toMaskedUpi(upiDoc) : null,
    qrCode,
    updatedAt: meta.updatedAt || new Date().toISOString(),
  };
}

export async function saveBeneficiaryBankAccount(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
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
  if (holder.length < 3 || holder.length > 100) {
    throw new AppError('Account holder name must be between 3 and 100 characters.', 400, 'INVALID_HOLDER_NAME');
  }
  const acct = params.accountNumber.replace(/\s+/g, '');
  const confirmAcct = params.confirmAccountNumber.replace(/\s+/g, '');
  if (!isValidBankAccountNumber(acct)) {
    throw new AppError('Bank account number must be 9 to 18 digits.', 400, 'INVALID_ACCOUNT_NUMBER');
  }
  if (acct !== confirmAcct) {
    throw new AppError('Bank account numbers do not match.', 400, 'ACCOUNT_NUMBER_MISMATCH');
  }

  const ifscInfo = await lookupIfscDetails(params.ifscCode);
  const { db, isMockMode } = initializeFirebase();
  const cols = collectionsFor(params.beneficiaryType);
  const now = new Date().toISOString();

  const currentSummary = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  const nextVersion = (currentSummary.profileVersion || 0) + 1;

  const docData: StoredBeneficiaryBankDoc = {
    id: params.beneficiaryId,
    beneficiaryType: params.beneficiaryType,
    beneficiaryId: params.beneficiaryId,
    bankCode: params.selectedBankCode || ifscInfo.bankCode || ifscInfo.ifsc.slice(0, 4),
    bankName: ifscInfo.bank,
    branchName: ifscInfo.branch,
    branchAddress: ifscInfo.address,
    branchCity: ifscInfo.city,
    branchState: ifscInfo.state,
    ifsc: ifscInfo.ifsc,
    accountHolderName: holder,
    encryptedAccountNumber: encryptSensitiveField(acct),
    maskedAccountNumber: maskAccountNumber(acct),
    last4: acct.slice(-4),
    verificationStatus: 'VERIFIED',
    keyVersion: 'v1',
    isDefault: params.makeDefault !== false,
    createdAt: currentSummary.bankAccount?.createdAt || now,
    updatedAt: now,
  };

  const defaultMethod = params.makeDefault !== false ? 'BANK_ACCOUNT' : currentSummary.defaultMethod || 'BANK_ACCOUNT';

  if (db && !isMockMode) {
    await Promise.all([
      db.collection(cols.bank).doc(params.beneficiaryId).set(deepCleanFirestorePayload(docData)),
      db.collection(cols.meta).doc(params.beneficiaryId).set(
        deepCleanFirestorePayload({ defaultMethod, profileVersion: nextVersion, updatedAt: now }),
        { merge: true }
      ),
    ]);
  } else {
    const k = keyFor(params.beneficiaryType, params.beneficiaryId);
    memBanks.set(k, docData);
    const prevMeta = memMeta.get(k);
    memMeta.set(k, {
      ...(prevMeta || {}),
      defaultMethod,
      profileVersion: nextVersion,
      updatedAt: now,
    });
  }

  const nextSummary = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  await recordProfileVersionSnapshot({
    beneficiaryType: params.beneficiaryType,
    beneficiaryId: params.beneficiaryId,
    version: nextVersion,
    summary: nextSummary,
    actorEmail: params.actorEmail,
  });

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: params.beneficiaryType,
    action: `${params.beneficiaryType}_BANK_SAVED`,
    resourceType: 'payout_profile',
    resourceId: params.beneficiaryId,
    severity: 'SENSITIVE',
    summary: `Saved verified bank account (${docData.bankName} ${docData.maskedAccountNumber}, v${nextVersion}).`,
  });

  return nextSummary;
}

export async function saveBeneficiaryUpiAccount(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  upiId: string;
  confirmUpiId?: string;
  makeDefault?: boolean;
  actorUid?: string;
  actorEmail?: string;
}): Promise<PhleboPaymentMethodSummary> {
  const cleanUpi = params.upiId.trim().toLowerCase();
  if (!isValidUpiVpa(cleanUpi)) {
    throw new AppError('Invalid UPI ID format (expected e.g. name@okaxis).', 400, 'INVALID_UPI_ID');
  }
  if (params.confirmUpiId !== undefined && params.confirmUpiId.trim().toLowerCase() !== cleanUpi) {
    throw new AppError('UPI IDs do not match.', 400, 'UPI_ID_MISMATCH');
  }

  const { db, isMockMode } = initializeFirebase();
  const cols = collectionsFor(params.beneficiaryType);
  const now = new Date().toISOString();
  const currentSummary = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  const nextVersion = (currentSummary.profileVersion || 0) + 1;

  const docData: StoredBeneficiaryUpiDoc = {
    id: params.beneficiaryId,
    beneficiaryType: params.beneficiaryType,
    beneficiaryId: params.beneficiaryId,
    encryptedUpiId: encryptSensitiveField(cleanUpi),
    maskedUpiId: maskUpiId(cleanUpi),
    vpaHandle: cleanUpi.split('@')[1] || '',
    verificationStatus: 'VERIFIED',
    keyVersion: 'v1',
    isDefault: Boolean(params.makeDefault),
    createdAt: currentSummary.upiAccount?.createdAt || now,
    updatedAt: now,
  };

  const defaultMethod = params.makeDefault ? 'UPI' : currentSummary.defaultMethod === 'NONE' ? 'UPI' : currentSummary.defaultMethod;

  // Re-evaluate QR consistency if a QR is already stored
  let qrConsistencyStatus = currentSummary.qrCode?.consistencyStatus;
  if (currentSummary.qrCode?.available && currentSummary.qrCode.decodedUpiId) {
    qrConsistencyStatus =
      currentSummary.qrCode.decodedUpiId.toLowerCase() === cleanUpi ? 'MATCHED' : 'MISMATCH';
  }

  if (db && !isMockMode) {
    await Promise.all([
      db.collection(cols.upi).doc(params.beneficiaryId).set(deepCleanFirestorePayload(docData)),
      db.collection(cols.meta).doc(params.beneficiaryId).set(
        deepCleanFirestorePayload({
          defaultMethod,
          profileVersion: nextVersion,
          ...(qrConsistencyStatus ? { qrConsistencyStatus } : {}),
          updatedAt: now,
        }),
        { merge: true }
      ),
    ]);
  } else {
    const k = keyFor(params.beneficiaryType, params.beneficiaryId);
    memUpis.set(k, docData);
    const prevMeta = memMeta.get(k);
    memMeta.set(k, {
      ...(prevMeta || {}),
      defaultMethod,
      profileVersion: nextVersion,
      ...(qrConsistencyStatus ? { qrConsistencyStatus } : {}),
      updatedAt: now,
    });
  }

  const nextSummary = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  await recordProfileVersionSnapshot({
    beneficiaryType: params.beneficiaryType,
    beneficiaryId: params.beneficiaryId,
    version: nextVersion,
    summary: nextSummary,
    actorEmail: params.actorEmail,
  });

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: params.beneficiaryType,
    action: `${params.beneficiaryType}_UPI_SAVED`,
    resourceType: 'payout_profile',
    resourceId: params.beneficiaryId,
    severity: 'SENSITIVE',
    summary: `Saved verified UPI ID (${docData.maskedUpiId}, v${nextVersion}).`,
  });

  return nextSummary;
}

export async function setBeneficiaryDefaultMethod(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  defaultMethod: 'BANK_ACCOUNT' | 'UPI';
  actorUid?: string;
  actorEmail?: string;
}): Promise<PhleboPaymentMethodSummary> {
  const current = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  if (params.defaultMethod === 'BANK_ACCOUNT' && !current.bankAccount) {
    throw new AppError('Add a Bank Account before setting it as default.', 400, 'BANK_DETAILS_NOT_ADDED');
  }
  if (params.defaultMethod === 'UPI' && !current.upiAccount) {
    throw new AppError('Add a UPI ID before setting it as default.', 400, 'BANK_DETAILS_NOT_ADDED');
  }

  const nextVersion = (current.profileVersion || 0) + 1;
  const now = new Date().toISOString();
  const { db, isMockMode } = initializeFirebase();
  const cols = collectionsFor(params.beneficiaryType);

  if (db && !isMockMode) {
    await db
      .collection(cols.meta)
      .doc(params.beneficiaryId)
      .set({ defaultMethod: params.defaultMethod, profileVersion: nextVersion, updatedAt: now }, { merge: true });
  } else {
    const k = keyFor(params.beneficiaryType, params.beneficiaryId);
    const prev = memMeta.get(k) || { defaultMethod: params.defaultMethod, profileVersion: nextVersion, updatedAt: now };
    memMeta.set(k, { ...prev, defaultMethod: params.defaultMethod, profileVersion: nextVersion, updatedAt: now });
  }

  return getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
}

export async function saveBeneficiaryQr(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  mimeType: string;
  base64Data: string;
  source?: 'UPLOADED' | 'GENERATED_FROM_UPI';
  decodedUpiUri?: string;
  actorUid?: string;
  actorEmail?: string;
}): Promise<PhleboPaymentMethodSummary> {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(params.mimeType.toLowerCase())) {
    throw new AppError('Only PNG, JPEG, or WEBP QR images are allowed.', 400, 'INVALID_QR_FORMAT');
  }
  const cleanB64 = params.base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(cleanB64, 'base64');
  if (buf.length < 100 || buf.length > 2 * 1024 * 1024) {
    throw new AppError('QR image size must be between 100 bytes and 2 MB.', 400, 'INVALID_QR_SIZE');
  }

  const { db, storage, isMockMode } = initializeFirebase();
  const cols = collectionsFor(params.beneficiaryType);
  const current = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  const nextVersion = (current.profileVersion || 0) + 1;
  const now = new Date().toISOString();
  const storagePath = `${cols.qrPrefix}/${params.beneficiaryId}/upi-qr.png`;

  // Consistency check between decoded QR URI and saved UPI ID
  let decodedUpiId: string | undefined;
  let decodedPayeeName: string | undefined;
  let consistencyStatus: QrCodeMetadata['consistencyStatus'] = 'UNVERIFIED';
  let verificationStatus: BankVerificationStatus = 'PENDING_VERIFICATION';

  if (params.decodedUpiUri) {
    const parsed = parseUpiIntentUri(params.decodedUpiUri);
    decodedUpiId = parsed.upiId;
    decodedPayeeName = parsed.payeeName;
  }

  // If generated directly from verified UPI ID, retrieve decrypted UPI to confirm match
  if (params.source === 'GENERATED_FROM_UPI') {
    const rawUpi = await getDecryptedBeneficiaryUpiInternal(params.beneficiaryType, params.beneficiaryId);
    if (!rawUpi) {
      throw new AppError('Save a verified UPI ID before generating a static QR.', 400, 'UPI_REQUIRED');
    }
    decodedUpiId = rawUpi;
    decodedPayeeName = current.bankAccount?.accountHolderName || params.beneficiaryId;
    consistencyStatus = 'MATCHED';
    verificationStatus = 'VERIFIED';
  } else if (decodedUpiId) {
    const rawUpi = await getDecryptedBeneficiaryUpiInternal(params.beneficiaryType, params.beneficiaryId);
    if (rawUpi) {
      consistencyStatus = decodedUpiId.toLowerCase() === rawUpi.toLowerCase() ? 'MATCHED' : 'MISMATCH';
      verificationStatus = consistencyStatus === 'MATCHED' ? 'VERIFIED' : 'REVERIFICATION_REQUIRED';
    }
  } else {
    verificationStatus = 'VERIFIED';
  }

  if (db && storage && !isMockMode) {
    const file = storage.bucket().file(storagePath);
    await file.save(buf, { contentType: params.mimeType, resumable: false, public: false });
    await db.collection(cols.meta).doc(params.beneficiaryId).set(
      deepCleanFirestorePayload({
        profileVersion: nextVersion,
        qrStoragePath: storagePath,
        qrSource: params.source || 'UPLOADED',
        qrDecodedUpiId: decodedUpiId,
        qrDecodedPayeeName: decodedPayeeName,
        qrConsistencyStatus: consistencyStatus,
        qrVerificationStatus: verificationStatus,
        qrMimeType: params.mimeType,
        qrUpdatedAt: now,
        updatedAt: now,
      }),
      { merge: true }
    );
  } else {
    const k = keyFor(params.beneficiaryType, params.beneficiaryId);
    memQrBytes.set(k, { mimeType: params.mimeType, base64: cleanB64, updatedAt: now });
    const prev = memMeta.get(k) || { defaultMethod: current.defaultMethod, profileVersion: nextVersion, updatedAt: now };
    memMeta.set(k, {
      ...prev,
      profileVersion: nextVersion,
      qrStoragePath: storagePath,
      qrSource: params.source || 'UPLOADED',
      qrDecodedUpiId: decodedUpiId,
      qrDecodedPayeeName: decodedPayeeName,
      qrConsistencyStatus: consistencyStatus,
      qrVerificationStatus: verificationStatus,
      qrMimeType: params.mimeType,
      qrUpdatedAt: now,
      updatedAt: now,
    });
  }

  const nextSummary = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  await recordProfileVersionSnapshot({
    beneficiaryType: params.beneficiaryType,
    beneficiaryId: params.beneficiaryId,
    version: nextVersion,
    summary: nextSummary,
    actorEmail: params.actorEmail,
  });

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: params.beneficiaryType,
    action: `${params.beneficiaryType}_QR_SAVED`,
    resourceType: 'payout_profile',
    resourceId: params.beneficiaryId,
    severity: 'SENSITIVE',
    summary: `Saved UPI QR (${params.source || 'UPLOADED'}, consistency=${consistencyStatus}, v${nextVersion}).`,
  });

  return nextSummary;
}

export async function deleteBeneficiaryQr(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  actorUid?: string;
  actorEmail?: string;
}): Promise<PhleboPaymentMethodSummary> {
  const { db, storage, isMockMode } = initializeFirebase();
  const cols = collectionsFor(params.beneficiaryType);
  const current = await getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
  const nextVersion = (current.profileVersion || 0) + 1;
  const now = new Date().toISOString();
  const storagePath = `${cols.qrPrefix}/${params.beneficiaryId}/upi-qr.png`;

  if (db && storage && !isMockMode) {
    try {
      const file = storage.bucket().file(storagePath);
      const [exists] = await file.exists();
      if (exists) await file.delete();
    } catch {
      // Non-fatal if file already removed
    }
    await db.collection(cols.meta).doc(params.beneficiaryId).set(
      {
        profileVersion: nextVersion,
        qrStoragePath: null,
        qrSource: 'NONE',
        qrDecodedUpiId: null,
        qrDecodedPayeeName: null,
        qrConsistencyStatus: 'NOT_APPLICABLE',
        qrVerificationStatus: 'UNVERIFIED',
        qrUpdatedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  } else {
    const k = keyFor(params.beneficiaryType, params.beneficiaryId);
    memQrBytes.delete(k);
    const prev = memMeta.get(k);
    if (prev) {
      memMeta.set(k, {
        ...prev,
        profileVersion: nextVersion,
        qrStoragePath: undefined,
        qrSource: 'NONE',
        qrDecodedUpiId: undefined,
        qrDecodedPayeeName: undefined,
        qrConsistencyStatus: 'NOT_APPLICABLE',
        qrVerificationStatus: 'UNVERIFIED',
        qrUpdatedAt: now,
        updatedAt: now,
      });
    }
  }

  await recordAuditLog({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorRole: params.beneficiaryType,
    action: `${params.beneficiaryType}_QR_DELETED`,
    resourceType: 'payout_profile',
    resourceId: params.beneficiaryId,
    severity: 'SENSITIVE',
    summary: `Deleted UPI QR (v${nextVersion}).`,
  });

  return getBeneficiaryPayoutSummary(params.beneficiaryType, params.beneficiaryId);
}

export async function getBeneficiaryQrPreview(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  actorUid?: string;
  actorEmail?: string;
  isAdminAccess?: boolean;
}): Promise<{ available: boolean; signedUrl?: string; dataUrl?: string }> {
  const { db, storage, isMockMode } = initializeFirebase();
  const cols = collectionsFor(params.beneficiaryType);
  const storagePath = `${cols.qrPrefix}/${params.beneficiaryId}/upi-qr.png`;

  if (db && storage && !isMockMode) {
    const file = storage.bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists) return { available: false };
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 2 * 60 * 1000,
    });
    if (params.isAdminAccess) {
      await recordAuditLog({
        actorUid: params.actorUid,
        actorEmail: params.actorEmail,
        actorRole: 'ADMIN',
        action: 'ADMIN_VIEWED_BENEFICIARY_QR',
        resourceType: 'payout_profile',
        resourceId: params.beneficiaryId,
        severity: 'SENSITIVE',
        summary: `Admin viewed private UPI QR for ${params.beneficiaryType} ${params.beneficiaryId}.`,
      });
    }
    return { available: true, signedUrl };
  }

  const mem = memQrBytes.get(keyFor(params.beneficiaryType, params.beneficiaryId));
  if (!mem) return { available: false };
  return { available: true, dataUrl: `data:${mem.mimeType};base64,${mem.base64}` };
}

async function getDecryptedBeneficiaryUpiInternal(
  beneficiaryType: BeneficiaryType,
  beneficiaryId: string
): Promise<string | null> {
  const { db, isMockMode } = initializeFirebase();
  const cols = collectionsFor(beneficiaryType);
  let upiDoc: StoredBeneficiaryUpiDoc | null = null;
  if (db && !isMockMode) {
    const snap = await db.collection(cols.upi).doc(beneficiaryId).get();
    if (snap.exists) upiDoc = snap.data() as StoredBeneficiaryUpiDoc;
  } else {
    upiDoc = memUpis.get(keyFor(beneficiaryType, beneficiaryId)) || null;
  }
  if (!upiDoc?.encryptedUpiId) return null;
  return decryptSensitiveField(upiDoc.encryptedUpiId);
}

export async function revealSensitiveBeneficiaryBankForAdmin(params: {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  adminUid?: string;
  adminEmail?: string;
}): Promise<{ accountNumber?: string; upiId?: string }> {
  const { db, isMockMode } = initializeFirebase();
  const cols = collectionsFor(params.beneficiaryType);
  let bankDoc: StoredBeneficiaryBankDoc | null = null;
  let upiDoc: StoredBeneficiaryUpiDoc | null = null;

  if (db && !isMockMode) {
    const [bSnap, uSnap] = await Promise.all([
      db.collection(cols.bank).doc(params.beneficiaryId).get(),
      db.collection(cols.upi).doc(params.beneficiaryId).get(),
    ]);
    if (bSnap.exists) bankDoc = bSnap.data() as StoredBeneficiaryBankDoc;
    if (uSnap.exists) upiDoc = uSnap.data() as StoredBeneficiaryUpiDoc;
  } else {
    const k = keyFor(params.beneficiaryType, params.beneficiaryId);
    bankDoc = memBanks.get(k) || null;
    upiDoc = memUpis.get(k) || null;
  }

  await recordAuditLog({
    actorUid: params.adminUid,
    actorEmail: params.adminEmail,
    actorRole: 'ADMIN',
    action: 'ADMIN_REVEALED_SENSITIVE_BANK',
    resourceType: 'payout_profile',
    resourceId: params.beneficiaryId,
    severity: 'SENSITIVE',
    summary: `Finance/Super Admin revealed full decrypted banking details for ${params.beneficiaryType} ${params.beneficiaryId}.`,
  });

  return {
    accountNumber: bankDoc?.encryptedAccountNumber ? decryptSensitiveField(bankDoc.encryptedAccountNumber) : undefined,
    upiId: upiDoc?.encryptedUpiId ? decryptSensitiveField(upiDoc.encryptedUpiId) : undefined,
  };
}
