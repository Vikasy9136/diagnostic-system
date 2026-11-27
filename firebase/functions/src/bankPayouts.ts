import crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import { Router, type NextFunction, type Response } from 'express';
import { AppError, db } from './firebaseAdmin';
import { type AuthenticatedRequest, requireAuth, requireRoles } from './rbac';
import { UserRole } from './types';

const BANKS = [
  { code: 'SBIN', name: 'State Bank of India', shortName: 'SBI', ifscPrefix: 'SBIN', popular: true, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'HDFC', name: 'HDFC Bank', shortName: 'HDFC', ifscPrefix: 'HDFC', popular: true, accentColor: '#1E3A8A', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'ICIC', name: 'ICICI Bank', shortName: 'ICICI', ifscPrefix: 'ICIC', popular: true, accentColor: '#EA580C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'UTIB', name: 'Axis Bank', shortName: 'AXIS', ifscPrefix: 'UTIB', popular: true, accentColor: '#9F1239', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', shortName: 'KOTAK', ifscPrefix: 'KKBK', popular: true, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'PUNB', name: 'Punjab National Bank', shortName: 'PNB', ifscPrefix: 'PUNB', popular: true, accentColor: '#B91C1C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'BARB', name: 'Bank of Baroda', shortName: 'BOB', ifscPrefix: 'BARB', popular: true, accentColor: '#F97316', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'CNRB', name: 'Canara Bank', shortName: 'CANARA', ifscPrefix: 'CNRB', popular: true, accentColor: '#0284C7', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IDFB', name: 'IDFC FIRST Bank', shortName: 'IDFC', ifscPrefix: 'IDFB', popular: true, accentColor: '#991B1B', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'UBIN', name: 'Union Bank of India', shortName: 'UNION', ifscPrefix: 'UBIN', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IDIB', name: 'Indian Bank', shortName: 'INDIAN', ifscPrefix: 'IDIB', popular: false, accentColor: '#0369A1', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'INDB', name: 'IndusInd Bank', shortName: 'INDUS', ifscPrefix: 'INDB', popular: false, accentColor: '#7F1D1D', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'YESB', name: 'Yes Bank', shortName: 'YES', ifscPrefix: 'YESB', popular: false, accentColor: '#1E40AF', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'FDRL', name: 'Federal Bank', shortName: 'FEDERAL', ifscPrefix: 'FDRL', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'AUBL', name: 'AU Small Finance Bank', shortName: 'AU', ifscPrefix: 'AUBL', popular: false, accentColor: '#6D28D9', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'BDBL', name: 'Bandhan Bank', shortName: 'BANDHAN', ifscPrefix: 'BDBL', popular: false, accentColor: '#BE123C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'BKID', name: 'Bank of India', shortName: 'BOI', ifscPrefix: 'BKID', popular: false, accentColor: '#0284C7', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'CBIN', name: 'Central Bank of India', shortName: 'CBI', ifscPrefix: 'CBIN', popular: false, accentColor: '#1E3A8A', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IOBA', name: 'Indian Overseas Bank', shortName: 'IOB', ifscPrefix: 'IOBA', popular: false, accentColor: '#0369A1', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'RATN', name: 'RBL Bank', shortName: 'RBL', ifscPrefix: 'RATN', popular: false, accentColor: '#1E3A8A', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'SIBL', name: 'South Indian Bank', shortName: 'SIB', ifscPrefix: 'SIBL', popular: false, accentColor: '#B91C1C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'UCBA', name: 'UCO Bank', shortName: 'UCO', ifscPrefix: 'UCBA', popular: false, accentColor: '#0284C7', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'KARB', name: 'Karnataka Bank', shortName: 'KARNATAKA', ifscPrefix: 'KARB', popular: false, accentColor: '#7C2D12', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'KVBL', name: 'Karur Vysya Bank', shortName: 'KVB', ifscPrefix: 'KVBL', popular: false, accentColor: '#15803D', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'CIUB', name: 'City Union Bank', shortName: 'CUB', ifscPrefix: 'CIUB', popular: false, accentColor: '#047857', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'PSIB', name: 'Punjab & Sind Bank', shortName: 'PSB', ifscPrefix: 'PSIB', popular: false, accentColor: '#15803D', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'DBSS', name: 'DBS Bank India', shortName: 'DBS', ifscPrefix: 'DBSS', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'SCBL', name: 'Standard Chartered Bank', shortName: 'SCB', ifscPrefix: 'SCBL', popular: false, accentColor: '#0F766E', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'HSBC', name: 'HSBC Bank India', shortName: 'HSBC', ifscPrefix: 'HSBC', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'AIRP', name: 'Airtel Payments Bank', shortName: 'AIRTEL', ifscPrefix: 'AIRP', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'JIOP', name: 'Jio Payments Bank', shortName: 'JIO', ifscPrefix: 'JIOP', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'PYTM', name: 'Paytm Payments Bank', shortName: 'PAYTM', ifscPrefix: 'PYTM', popular: false, accentColor: '#0284C7', upiSupported: false, impsSupported: true, neftSupported: true },
];

function getEncKey(): Buffer {
  const raw = (process.env.BANK_ENCRYPTION_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw || 'labsetu-cloud-functions-bank-key').digest();
}

function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ct.toString('base64'),
  };
}

function maskAcct(acct: string): string {
  const clean = acct.replace(/\s+/g, '');
  if (clean.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
}

function maskUpi(upi: string): string {
  const [user, handle] = upi.split('@');
  if (!handle) return '***';
  const masked = user.length <= 2 ? `${user[0] || '*'}*` : `${user.slice(0, 2)}${'*'.repeat(Math.max(2, user.length - 3))}${user.slice(-1)}`;
  return `${masked}@${handle}`;
}

async function lookupIfscLive(rawIfsc: string) {
  const ifsc = rawIfsc.trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new AppError('Invalid IFSC code format. Expected 11 characters (e.g., SBIN0001234).', 400, 'IFSC_INVALID');
  }
  const res = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`);
  if (res.status === 404) {
    throw new AppError(`IFSC code "${ifsc}" was not found in RBI/NPCI directory.`, 404, 'IFSC_INVALID');
  }
  if (!res.ok) {
    throw new AppError('IFSC lookup service temporarily unavailable. Please retry.', 503, 'IFSC_LOOKUP_UNAVAILABLE');
  }
  const d = (await res.json()) as Record<string, unknown>;
  const bankCode = String(d.BANKCODE || ifsc.slice(0, 4)).toUpperCase();
  const bankName = String(d.BANK || '');
  const knownBank = BANKS.some((b) => b.code === bankCode || b.ifscPrefix === bankCode);
  if (!knownBank && bankCode) {
    const nowIso = new Date().toISOString();
    void db.collection('bank_logo_review_queue').doc(bankCode).set(
      {
        bankCode,
        bankName: bankName || bankCode,
        ifscSample: String(d.IFSC || ifsc),
        status: 'NEEDS_ADMIN_REVIEW',
        lastSeenAt: nowIso,
        lookupCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    ).catch(() => undefined);
  }
  return {
    ifsc: String(d.IFSC || ifsc),
    bank: bankName,
    bankCode,
    branch: String(d.BRANCH || ''),
    address: String(d.ADDRESS || ''),
    city: String(d.CITY || ''),
    district: String(d.DISTRICT || ''),
    state: String(d.STATE || ''),
    micr: d.MICR ? String(d.MICR) : undefined,
    upi: Boolean(d.UPI),
    imps: Boolean(d.IMPS),
    neft: Boolean(d.NEFT),
    rtgs: Boolean(d.RTGS),
  };
}

function profileDocId(type: 'PHLEBOTOMIST' | 'LARGE_LAB', id: string) {
  return `${type}_${id}`;
}

async function getBeneficiarySummary(type: 'PHLEBOTOMIST' | 'LARGE_LAB', id: string) {
  const snap = await db.collection('beneficiary_payout_profiles').doc(profileDocId(type, id)).get();
  if (snap.exists) {
    const data = snap.data() as Record<string, any>;
    const bankAccount = data.bankAccount
      ? {
          ...data.bankAccount,
          ifsc: data.bankAccount.ifsc || data.bankAccount.ifscCode,
          ifscCode: data.bankAccount.ifscCode || data.bankAccount.ifsc,
        }
      : undefined;
    return {
      defaultMethod: data.defaultMethod || 'NONE',
      bankAccount,
      upiAccount: data.upiAccount,
      qrCode: data.qrCode,
      bankLast4: bankAccount?.last4,
      maskedAccountNumber: bankAccount?.maskedAccountNumber,
      ifscCode: bankAccount?.ifscCode,
      bankName: bankAccount?.bankName,
      branchName: bankAccount?.branchName,
      accountHolderName: bankAccount?.accountHolderName,
      bankVerificationStatus: bankAccount?.verificationStatus || 'UNVERIFIED',
      maskedUpiId: data.upiAccount?.maskedUpiId,
      upiVerificationStatus: data.upiAccount?.verificationStatus || 'UNVERIFIED',
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  }
  return {
    defaultMethod: 'NONE',
    bankVerificationStatus: 'UNVERIFIED',
    upiVerificationStatus: 'UNVERIFIED',
    updatedAt: new Date().toISOString(),
  };
}

async function saveBank(params: {
  type: 'PHLEBOTOMIST' | 'LARGE_LAB';
  id: string;
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  selectedBankCode?: string;
  makeDefault?: boolean;
}) {
  const holder = params.accountHolderName.trim();
  const acct = params.accountNumber.replace(/\s+/g, '');
  const confirm = params.confirmAccountNumber.replace(/\s+/g, '');
  if (holder.length < 3) throw new AppError('Account holder name must be at least 3 characters.', 400, 'BAD_REQUEST');
  if (!/^\d{9,18}$/.test(acct)) throw new AppError('Account number must be 9 to 18 digits.', 400, 'BAD_REQUEST');
  if (acct !== confirm) throw new AppError('Account number and confirm account number do not match.', 400, 'ACCOUNT_MISMATCH');

  const ifscInfo = await lookupIfscLive(params.ifscCode);
  const now = new Date().toISOString();
  const docRef = db.collection('beneficiary_payout_profiles').doc(profileDocId(params.type, params.id));
  const curSnap = await docRef.get();
  const cur = (curSnap.data() as Record<string, any>) || {};

  const bankEntry = {
    accountHolderName: holder,
    maskedAccountNumber: maskAcct(acct),
    last4: acct.slice(-4),
    ifsc: ifscInfo.ifsc,
    ifscCode: ifscInfo.ifsc,
    bankCode: params.selectedBankCode || ifscInfo.bankCode || ifscInfo.ifsc.slice(0, 4),
    bankName: ifscInfo.bank,
    branchName: ifscInfo.branch,
    encryptedAccount: encryptSecret(acct),
    verificationStatus: 'PENDING_VERIFICATION',
    updatedAt: now,
  };

  const defaultMethod =
    params.makeDefault || !cur.defaultMethod || cur.defaultMethod === 'NONE'
      ? 'BANK_ACCOUNT'
      : cur.defaultMethod;

  await docRef.set({
    id: profileDocId(params.type, params.id),
    beneficiaryType: params.type,
    beneficiaryId: params.id,
    defaultMethod,
    bankAccount: bankEntry,
    updatedAt: now,
  }, { merge: true });

  if (params.type === 'PHLEBOTOMIST') {
    await db.collection('phlebotomists').doc(params.id).set({
      payoutProfile: {
        preferredMethod: defaultMethod === 'UPI' ? 'UPI' : 'BANK_TRANSFER',
        accountHolderName: holder,
        bankAccountLast4: acct.slice(-4),
        ifscCode: ifscInfo.ifsc,
        bankName: ifscInfo.bank,
        branchName: ifscInfo.branch,
        updatedAt: now,
      },
      updatedAt: now,
    }, { merge: true });
  }

  return getBeneficiarySummary(params.type, params.id);
}

async function saveUpi(params: {
  type: 'PHLEBOTOMIST' | 'LARGE_LAB';
  id: string;
  upiId: string;
  confirmUpiId: string;
  makeDefault?: boolean;
}) {
  const upi = params.upiId.trim().toLowerCase();
  const confirm = params.confirmUpiId.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/.test(upi)) {
    throw new AppError('Invalid UPI ID format (example: name@okhdfcbank).', 400, 'INVALID_UPI');
  }
  if (upi !== confirm) throw new AppError('UPI ID and confirm UPI ID do not match.', 400, 'UPI_MISMATCH');

  const now = new Date().toISOString();
  const docRef = db.collection('beneficiary_payout_profiles').doc(profileDocId(params.type, params.id));
  const curSnap = await docRef.get();
  const cur = (curSnap.data() as Record<string, any>) || {};
  const defaultMethod =
    params.makeDefault || !cur.defaultMethod || cur.defaultMethod === 'NONE'
      ? 'UPI'
      : cur.defaultMethod;

  await docRef.set({
    id: profileDocId(params.type, params.id),
    beneficiaryType: params.type,
    beneficiaryId: params.id,
    defaultMethod,
    upiAccount: {
      maskedUpiId: maskUpi(upi),
      encryptedUpi: encryptSecret(upi),
      verificationStatus: 'PENDING_VERIFICATION',
      updatedAt: now,
    },
    updatedAt: now,
  }, { merge: true });

  return getBeneficiarySummary(params.type, params.id);
}

export function createPhleboPayoutsCloudRouter(): Router {
  const r = Router();
  r.get('/banks', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const filtered = q
      ? BANKS.filter((b) => b.name.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || b.ifscPrefix.toLowerCase().includes(q))
      : BANKS;
    res.json({
      success: true,
      data: {
        popular: filtered.filter((b) => b.popular),
        all: [...filtered].sort((a, b) => a.name.localeCompare(b.name)),
      },
      timestamp: new Date().toISOString(),
    });
  });

  r.get('/ifsc/:code', requireAuth, async (req, res, next) => {
    try {
      const data = await lookupIfscLive(req.params.code);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.get('/my-payment-methods', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await getBeneficiarySummary('PHLEBOTOMIST', id);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.put('/my-bank-account', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await saveBank({
        type: 'PHLEBOTOMIST',
        id,
        accountHolderName: String(req.body?.accountHolderName || ''),
        accountNumber: String(req.body?.accountNumber || ''),
        confirmAccountNumber: String(req.body?.confirmAccountNumber || ''),
        ifscCode: String(req.body?.ifscCode || ''),
        selectedBankCode: req.body?.selectedBankCode ? String(req.body.selectedBankCode) : undefined,
        makeDefault: req.body?.makeDefault !== false,
      });
      res.json({ success: true, data, message: 'Bank account encrypted & saved.', timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.put('/my-upi-account', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await saveUpi({
        type: 'PHLEBOTOMIST',
        id,
        upiId: String(req.body?.upiId || ''),
        confirmUpiId: String(req.body?.confirmUpiId || ''),
        makeDefault: req.body?.makeDefault !== false,
      });
      res.json({ success: true, data, message: 'UPI ID encrypted & saved.', timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.patch('/my-default-method', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const method = req.body?.method === 'UPI' ? 'UPI' : 'BANK_ACCOUNT';
      await db.collection('beneficiary_payout_profiles').doc(profileDocId('PHLEBOTOMIST', id)).set({ defaultMethod: method, updatedAt: new Date().toISOString() }, { merge: true });
      const data = await getBeneficiarySummary('PHLEBOTOMIST', id);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.get('/admin/finance/missing-bank-logos', requireAuth, requireRoles(UserRole.ADMIN), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const snap = await db.collection('bank_logo_review_queue').orderBy('lastSeenAt', 'desc').limit(100).get();
      res.json({ success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (e) { next(e); }
  });

  return r;
}

function detectImageMimeFromMagicBytes(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function decryptSecret(enc?: { iv?: string; tag?: string; ciphertext?: string }): string | null {
  if (!enc?.iv || !enc?.tag || !enc?.ciphertext) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function handleSaveQrForBeneficiary(params: {
  type: 'PHLEBOTOMIST' | 'LARGE_LAB';
  id: string;
  base64Data: string;
  source?: string;
  decodedUpiUri?: string;
}) {
  const rawB64 = String(params.base64Data || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
  if (!rawB64) throw new AppError('QR image data is required.', 400, 'BAD_REQUEST');
  const buf = Buffer.from(rawB64, 'base64');
  if (buf.length < 64 || buf.length > 5 * 1024 * 1024) {
    throw new AppError('QR image must be between 64 bytes and 5 MB.', 400, 'INVALID_FILE_SIZE');
  }
  const detectedMime = detectImageMimeFromMagicBytes(buf);
  if (!detectedMime) {
    throw new AppError('Unsupported QR image format. Only PNG, JPEG, or WebP images are allowed.', 400, 'UNSUPPORTED_FILE_TYPE');
  }

  const ext = detectedMime === 'image/jpeg' ? 'jpg' : detectedMime === 'image/webp' ? 'webp' : 'png';
  const folder = params.type === 'PHLEBOTOMIST' ? 'private-phlebo-qr' : 'private-large-lab-qr';
  const storagePath = `${folder}/${params.id}/upi-qr.${ext}`;
  await admin.storage().bucket().file(storagePath).save(buf, { contentType: detectedMime, public: false });

  const docRef = db.collection('beneficiary_payout_profiles').doc(profileDocId(params.type, params.id));
  const curSnap = await docRef.get();
  const curData = (curSnap.data() as Record<string, any>) || {};
  const savedUpi = decryptSecret(curData.upiAccount?.encryptedUpi)?.toLowerCase();

  let decodedUpiId: string | undefined;
  let consistencyStatus: 'MATCHED' | 'VPA_MISMATCH' | 'UNVERIFIED' = 'UNVERIFIED';
  if (params.decodedUpiUri && params.decodedUpiUri.toLowerCase().startsWith('upi://pay')) {
    const qIdx = params.decodedUpiUri.indexOf('?');
    if (qIdx >= 0) {
      const sp = new URLSearchParams(params.decodedUpiUri.slice(qIdx + 1));
      decodedUpiId = sp.get('pa')?.trim().toLowerCase() || undefined;
    }
  }
  if (decodedUpiId && savedUpi) {
    consistencyStatus = decodedUpiId === savedUpi ? 'MATCHED' : 'VPA_MISMATCH';
  }

  const now = new Date().toISOString();
  const verificationStatus = consistencyStatus === 'VPA_MISMATCH' ? 'FAILED' : 'PENDING_VERIFICATION';
  const qrRecord = {
    available: true,
    storagePath,
    mimeType: detectedMime,
    source: params.source === 'GENERATED_FROM_UPI' ? 'GENERATED_FROM_UPI' : 'UPLOADED',
    ...(decodedUpiId ? { decodedUpiId } : {}),
    consistencyStatus,
    verificationStatus,
    updatedAt: now,
  };
  await docRef.set({ qrCode: qrRecord, updatedAt: now }, { merge: true });
  return qrRecord;
}

async function handleGetQrForBeneficiary(type: 'PHLEBOTOMIST' | 'LARGE_LAB', id: string) {
  const snap = await db.collection('beneficiary_payout_profiles').doc(profileDocId(type, id)).get();
  const qr = snap.exists ? (snap.data() as Record<string, any>)?.qrCode : undefined;
  if (!qr?.available || !qr?.storagePath) return { available: false };
  const file = admin.storage().bucket().file(String(qr.storagePath));
  const [exists] = await file.exists();
  if (!exists) return { available: false };
  let signedUrl: string | undefined;
  try {
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 120000 });
    signedUrl = url;
  } catch {
    signedUrl = undefined;
  }
  let dataUrl: string | undefined;
  try {
    const [buf] = await file.download();
    dataUrl = `data:${qr.mimeType || 'image/png'};base64,${buf.toString('base64')}`;
  } catch {
    dataUrl = undefined;
  }
  return { available: true, ...(signedUrl ? { signedUrl } : {}), ...(dataUrl ? { dataUrl } : {}), ...qr };
}

async function handleDeleteQrForBeneficiary(type: 'PHLEBOTOMIST' | 'LARGE_LAB', id: string) {
  const docRef = db.collection('beneficiary_payout_profiles').doc(profileDocId(type, id));
  const snap = await docRef.get();
  const qr = snap.exists ? (snap.data() as Record<string, any>)?.qrCode : undefined;
  if (qr?.storagePath) {
    await admin.storage().bucket().file(String(qr.storagePath)).delete({ ignoreNotFound: true });
  }
  await docRef.set({ qrCode: { available: false, updatedAt: new Date().toISOString() } }, { merge: true });
  return { available: false };
}

export function createLargeLabAndWalletCloudRouter(): Router {
  const r = Router();
  r.get('/large-lab/payout-profile', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const data = await getBeneficiarySummary('LARGE_LAB', id);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  // Unified POST /large-lab/payout-profile matching apps/api/src/routes/wallet.routes.ts
  r.post('/large-lab/payout-profile', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const actionType = String(req.body?.type || '').toUpperCase();
      if (actionType === 'BANK_ACCOUNT') {
        const data = await saveBank({
          type: 'LARGE_LAB',
          id,
          accountHolderName: String(req.body?.accountHolderName || ''),
          accountNumber: String(req.body?.accountNumber || ''),
          confirmAccountNumber: String(req.body?.confirmAccountNumber || ''),
          ifscCode: String(req.body?.ifscCode || ''),
          selectedBankCode: req.body?.selectedBankCode ? String(req.body.selectedBankCode) : undefined,
          makeDefault: req.body?.makeDefault !== false,
        });
        return res.json({ success: true, data, message: 'Bank account saved.', timestamp: new Date().toISOString() });
      }
      if (actionType === 'UPI') {
        const data = await saveUpi({
          type: 'LARGE_LAB',
          id,
          upiId: String(req.body?.upiId || ''),
          confirmUpiId: String(req.body?.confirmUpiId || ''),
          makeDefault: req.body?.makeDefault !== false,
        });
        return res.json({ success: true, data, message: 'UPI ID saved.', timestamp: new Date().toISOString() });
      }
      if (actionType === 'SET_DEFAULT') {
        const method = req.body?.defaultMethod === 'UPI' ? 'UPI' : 'BANK_ACCOUNT';
        await db.collection('beneficiary_payout_profiles').doc(profileDocId('LARGE_LAB', id)).set({ defaultMethod: method, updatedAt: new Date().toISOString() }, { merge: true });
        const data = await getBeneficiarySummary('LARGE_LAB', id);
        return res.json({ success: true, data, message: `Default payout method updated to ${method}.`, timestamp: new Date().toISOString() });
      }
      throw new AppError('Invalid payout profile action type. Expected BANK_ACCOUNT, UPI, or SET_DEFAULT.', 400, 'INVALID_ACTION_TYPE');
    } catch (e) { return next(e); }
  });

  r.put('/large-lab/payout-profile/bank', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const data = await saveBank({
        type: 'LARGE_LAB',
        id,
        accountHolderName: String(req.body?.accountHolderName || ''),
        accountNumber: String(req.body?.accountNumber || ''),
        confirmAccountNumber: String(req.body?.confirmAccountNumber || ''),
        ifscCode: String(req.body?.ifscCode || ''),
        selectedBankCode: req.body?.selectedBankCode ? String(req.body.selectedBankCode) : undefined,
        makeDefault: req.body?.makeDefault !== false,
      });
      res.json({ success: true, data, message: 'Bank account saved.', timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.put('/large-lab/payout-profile/upi', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const data = await saveUpi({
        type: 'LARGE_LAB',
        id,
        upiId: String(req.body?.upiId || ''),
        confirmUpiId: String(req.body?.confirmUpiId || ''),
        makeDefault: req.body?.makeDefault !== false,
      });
      res.json({ success: true, data, message: 'UPI ID saved.', timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.post('/large-lab/payout-profile/default-method', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const method = req.body?.defaultMethod === 'UPI' ? 'UPI' : 'BANK_ACCOUNT';
      await db.collection('beneficiary_payout_profiles').doc(profileDocId('LARGE_LAB', id)).set({ defaultMethod: method, updatedAt: new Date().toISOString() }, { merge: true });
      const data = await getBeneficiarySummary('LARGE_LAB', id);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.post('/large-lab/payout-profile/qr', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const data = await handleSaveQrForBeneficiary({ type: 'LARGE_LAB', id, base64Data: String(req.body?.base64Data || ''), source: req.body?.source, decodedUpiUri: req.body?.decodedUpiUri });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.get('/large-lab/payout-profile/qr', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const data = await handleGetQrForBeneficiary('LARGE_LAB', id);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  r.delete('/large-lab/payout-profile/qr', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.labId || req.user?.uid || '';
      const data = await handleDeleteQrForBeneficiary('LARGE_LAB', id);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  // Phlebo QR routes matching apps/phlebo-app/services/walletService.ts (/api/phlebo/payout-profile/qr)
  r.post('/phlebo/payout-profile/qr', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await handleSaveQrForBeneficiary({ type: 'PHLEBOTOMIST', id, base64Data: String(req.body?.base64Data || ''), source: req.body?.source, decodedUpiUri: req.body?.decodedUpiUri });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  });

  r.get('/phlebo/payout-profile/qr', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await handleGetQrForBeneficiary('PHLEBOTOMIST', id);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  r.delete('/phlebo/payout-profile/qr', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const data = await handleDeleteQrForBeneficiary('PHLEBOTOMIST', id);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  });

  // Phlebo wallet read routes (/api/phlebo/wallet*)
  async function syncAndGetPhleboWallet(id: string) {
    const [wSnap, cfgSnap, ordersSnap, payoutsSnap, settlementsSnap, wdSnap] = await Promise.all([
      db.collection('wallets').doc(id).get(),
      db.collection('settings').doc('withdrawalConfig').get(),
      db.collection('orders').where('phlebotomistId', '==', id).get().catch(() => ({ docs: [] as any[] })),
      db.collection('payouts').where('phleboId', '==', id).get().catch(() => ({ docs: [] as any[] })),
      db.collection('settlements').where('phleboId', '==', id).get().catch(() => ({ docs: [] as any[] })),
      db.collection('withdrawalRequests').where('phleboId', '==', id).get().catch(() => ({ docs: [] as any[] })),
    ]);

    const payoutByOrder = new Map<string, any>();
    for (const d of payoutsSnap.docs) {
      const p = d.data() || {};
      if (p.orderId) payoutByOrder.set(String(p.orderId), p);
      if (p.orderNumber) payoutByOrder.set(String(p.orderNumber), p);
    }
    const stlByOrder = new Map<string, any>();
    for (const d of settlementsSnap.docs) {
      const s = d.data() || {};
      if (s.orderId) stlByOrder.set(String(s.orderId), s);
      if (s.orderNumber) stlByOrder.set(String(s.orderNumber), s);
    }

    const DELIVERED_STATUSES = new Set(['DELIVERED_TO_LAB', 'UNDER_ANALYSIS', 'REPORT_READY', 'COMPLETED', 'CLOSED']);
    const now = new Date();
    const weekAgoMs = now.getTime() - 7 * 86400000;
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let totalEarnedPaise = 0;
    let settledDirectPaise = 0;
    let thisWeekEarningsPaise = 0;
    let thisMonthEarningsPaise = 0;
    const syncedCredits: Array<{ id: string; phleboId: string; type: string; direction: string; amountPaise: number; description: string; referenceId?: string; createdAt: string }> = [];

    for (const d of ordersSnap.docs) {
      const o = d.data() || {};
      const status = String(o.status || '');
      if (!DELIVERED_STATUSES.has(status)) continue;
      const stl = stlByOrder.get(d.id) || stlByOrder.get(String(o.orderNumber || ''));
      const payout = payoutByOrder.get(d.id) || payoutByOrder.get(String(o.orderNumber || ''));
      const amountInr = Number(stl?.phleboPayoutInr ?? payout?.amountInr ?? o.phleboPayoutInr ?? o.courierFeeInr ?? 0);
      if (!Number.isFinite(amountInr) || amountInr <= 0) continue;

      const amtPaise = Math.round(amountInr * 100);
      totalEarnedPaise += amtPaise;

      const updatedAt = String(o.updatedAt || o.createdAt || '');
      if (updatedAt && new Date(updatedAt).getTime() >= weekAgoMs) thisWeekEarningsPaise += amtPaise;
      if (updatedAt.startsWith(monthPrefix)) thisMonthEarningsPaise += amtPaise;

      const payoutRef = stl?.phleboPayoutRef || payout?.referenceId || (o.paymentMethod === 'CASH' ? 'CASH' : undefined);
      const isSynthetic = Boolean(payoutRef && /^(CURPAY|LABPAY)-/i.test(String(payoutRef)));
      const pStatus = String(payout?.status || '');
      const isSettledDirect =
        !isSynthetic &&
        (pStatus === 'SETTLED' ||
          pStatus === 'PROCESSED' ||
          pStatus === 'MANUAL_RECONCILED' ||
          (stl?.phleboPayoutStatus === 'PAID' && Boolean(payoutRef)) ||
          o.paymentMethod === 'CASH' ||
          o.paymentMethod === 'DIRECT_LAB_SETTLEMENT');

      if (isSettledDirect) {
        settledDirectPaise += amtPaise;
      } else {
        syncedCredits.push({
          id: `AUTO-${d.id}`,
          phleboId: id,
          type: 'TRIP_EARNING_CREDIT',
          direction: 'CREDIT',
          amountPaise: amtPaise,
          description: `Trip earning • ${o.orderNumber || d.id}`,
          referenceId: o.orderNumber || d.id,
          createdAt: updatedAt || now.toISOString(),
        });
      }
    }

    let pendingWithdrawalPaise = 0;
    let withdrawnViaRequestsPaise = 0;
    for (const d of wdSnap.docs) {
      const wd = d.data() || {};
      const st = String(wd.status || '');
      const amt = Number(wd.requestedAmountPaise || 0);
      if (['PENDING_ADMIN_SETTLEMENT', 'UNDER_REVIEW', 'ON_HOLD', 'PROCESSING_MANUALLY', 'NEEDS_REVIEW'].includes(st)) {
        pendingWithdrawalPaise += amt;
      } else if (st === 'SETTLED' || st === 'PAID') {
        withdrawnViaRequestsPaise += amt;
      }
    }

    const existing = wSnap.exists ? wSnap.data()! : {};
    const computedAvail = Math.max(0, totalEarnedPaise - settledDirectPaise - pendingWithdrawalPaise - withdrawnViaRequestsPaise);
    const mergedWallet = {
      ...existing,
      id,
      phleboId: id,
      availableBalancePaise: totalEarnedPaise > 0 ? computedAvail : Number(existing.availableBalancePaise || 0),
      withdrawalEligibleBalancePaise: totalEarnedPaise > 0 ? computedAvail : Number(existing.withdrawalEligibleBalancePaise || existing.availableBalancePaise || 0),
      pendingWithdrawalPaise: pendingWithdrawalPaise || Number(existing.pendingWithdrawalPaise || 0),
      totalEarnedPaise: Math.max(totalEarnedPaise, Number(existing.totalEarnedPaise || 0)),
      totalWithdrawnPaise: Math.max(settledDirectPaise + withdrawnViaRequestsPaise, Number(existing.totalWithdrawnPaise || 0)),
      totalSettledPaise: Math.max(settledDirectPaise + withdrawnViaRequestsPaise, Number(existing.totalSettledPaise || existing.totalWithdrawnPaise || 0)),
      onHoldBalancePaise: Number(existing.onHoldBalancePaise || 0),
      thisWeekEarningsPaise: Math.max(thisWeekEarningsPaise, Number(existing.thisWeekEarningsPaise || 0)),
      thisMonthEarningsPaise: Math.max(thisMonthEarningsPaise, Number(existing.thisMonthEarningsPaise || 0)),
      updatedAt: now.toISOString(),
    };

    if (totalEarnedPaise > 0) {
      await db.collection('wallets').doc(id).set(mergedWallet, { merge: true }).catch(() => undefined);
    }

    const config = cfgSnap.exists ? cfgSnap.data() : { minWithdrawalPaise: 10000, cycleDays: 7, platformFeePct: 10 };
    return { wallet: mergedWallet, config, syncedCredits };
  }

  r.get('/phlebo/wallet', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const { wallet, config } = await syncAndGetPhleboWallet(id);
      res.json({ success: true, data: { wallet, config } });
    } catch (e) { next(e); }
  });

  r.get('/phlebo/wallet/transactions', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const [snap, synced] = await Promise.all([
        db.collection('walletTransactions').where('phleboId', '==', id).get(),
        syncAndGetPhleboWallet(id).catch(() => ({ syncedCredits: [] as any[] })),
      ]);
      const stored = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const storedRefs = new Set(stored.map((t: any) => t.referenceId).filter(Boolean));
      const missingCredits = (synced.syncedCredits || []).filter((c: any) => !storedRefs.has(c.referenceId));
      const list = [...stored, ...missingCredits].sort((a: any, b: any) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );
      res.json({ success: true, data: list });
    } catch (e) { next(e); }
  });

  r.get('/phlebo/wallet/withdrawals', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const snap = await db.collection('withdrawalRequests').where('phleboId', '==', id).get();
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ success: true, data: list });
    } catch (e) { next(e); }
  });

  async function handleSubmitWithdrawal(params: {
    beneficiaryType: 'PHLEBOTOMIST' | 'LARGE_LAB';
    id: string;
    name: string;
    requestedAmountPaise: number;
    paymentMethod?: 'BANK_ACCOUNT' | 'UPI';
  }) {
    const { beneficiaryType, id, name, requestedAmountPaise, paymentMethod = 'BANK_ACCOUNT' } = params;
    if (!id) throw new AppError('Beneficiary ID not found.', 400, 'INVALID_BENEFICIARY');
    if (!Number.isFinite(requestedAmountPaise) || requestedAmountPaise <= 0) {
      throw new AppError('Enter a valid withdrawal amount.', 400, 'INVALID_AMOUNT');
    }

    const cfgSnap = await db.collection('settings').doc('withdrawalConfig').get();
    const cfg = cfgSnap.exists ? cfgSnap.data()! : { minWithdrawalPaise: 10000, cycleDays: 7 };
    const minPaise = Number(cfg.minWithdrawalPaise ?? 10000);
    if (requestedAmountPaise < minPaise) {
      throw new AppError(`Minimum withdrawal amount is ₹${(minPaise / 100).toFixed(0)}.`, 400, 'BELOW_MINIMUM');
    }

    const walletRef = db.collection('wallets').doc(id);
    const wdId = `WD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const txId = `WTX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();

    return await db.runTransaction(async (tx) => {
      const wSnap = await tx.get(walletRef);
      const wData = wSnap.exists ? wSnap.data()! : { availableBalancePaise: 0, pendingWithdrawalPaise: 0, totalEarnedPaise: 0, totalWithdrawnPaise: 0 };
      const avail = Number(wData.availableBalancePaise || 0);
      if (avail < requestedAmountPaise) {
        throw new AppError(`Insufficient available balance (₹${(avail / 100).toFixed(2)}).`, 400, 'INSUFFICIENT_BALANCE');
      }

      const nextAvail = avail - requestedAmountPaise;
      const nextPending = Number(wData.pendingWithdrawalPaise || 0) + requestedAmountPaise;

      tx.set(walletRef, {
        ...wData,
        id,
        beneficiaryType,
        ...(beneficiaryType === 'PHLEBOTOMIST' ? { phleboId: id } : { largeLabId: id }),
        availableBalancePaise: nextAvail,
        withdrawalEligibleBalancePaise: nextAvail,
        pendingWithdrawalPaise: nextPending,
        updatedAt: now,
      }, { merge: true });

      const wdDoc = {
        id: wdId,
        beneficiaryType,
        phleboId: id,
        ...(beneficiaryType === 'LARGE_LAB' ? { largeLabId: id } : {}),
        beneficiaryName: name,
        requestedAmountPaise,
        paymentMethod,
        status: 'PENDING_ADMIN_SETTLEMENT',
        createdAt: now,
        updatedAt: now,
      };
      tx.set(db.collection('withdrawalRequests').doc(wdId), wdDoc);

      tx.set(db.collection('walletTransactions').doc(txId), {
        id: txId,
        phleboId: id,
        ...(beneficiaryType === 'LARGE_LAB' ? { largeLabId: id } : {}),
        beneficiaryType,
        type: 'WITHDRAWAL_REQUEST',
        direction: 'DEBIT',
        amountPaise: requestedAmountPaise,
        description: `Withdrawal request ${wdId} (${paymentMethod})`,
        referenceId: wdId,
        createdAt: now,
      });

      return {
        request: wdDoc,
        wallet: {
          ...wData,
          id,
          availableBalancePaise: nextAvail,
          withdrawalEligibleBalancePaise: nextAvail,
          pendingWithdrawalPaise: nextPending,
        },
        message: 'Withdrawal request submitted for settlement.',
      };
    });
  }

  r.post('/phlebo/wallet/withdrawals', requireAuth, requireRoles(UserRole.PHLEBOTOMIST, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.user?.phlebotomistId || req.user?.uid || '';
      const result = await handleSubmitWithdrawal({
        beneficiaryType: 'PHLEBOTOMIST',
        id,
        name: req.user?.displayName || req.user?.email || id,
        requestedAmountPaise: Number(req.body?.requestedAmountPaise),
        paymentMethod: req.body?.paymentMethod,
      });
      res.status(201).json({ success: true, data: result, message: result.message });
    } catch (e) { next(e); }
  });

  // Large Lab automatic wallet & withdrawals
  r.get('/large-lab/wallet', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = req.user?.labId || req.user?.uid || '';
      const [wSnap, cfgSnap, payoutsSnap] = await Promise.all([
        db.collection('wallets').doc(labId).get(),
        db.collection('settings').doc('withdrawalConfig').get(),
        db.collection('payouts').where('largeLabId', '==', labId).get().catch(() => ({ empty: true, docs: [] as any[] })),
      ]);

      let wallet: any = wSnap.exists ? { id: wSnap.id, ...wSnap.data() } : null;
      if (!wallet) {
        let totalEarnedPaise = 0;
        let totalSettledPaise = 0;
        payoutsSnap.docs.forEach((d: any) => {
          const p = d.data() || {};
          const amtPaise = Math.round(Number(p.amountInr || p.netAmountInr || 0) * 100);
          totalEarnedPaise += amtPaise;
          if (p.status === 'PAID' || p.status === 'SETTLED') {
            totalSettledPaise += amtPaise;
          }
        });
        const availableBalancePaise = Math.max(0, totalEarnedPaise - totalSettledPaise);
        wallet = {
          id: labId,
          largeLabId: labId,
          beneficiaryType: 'LARGE_LAB',
          availableBalancePaise,
          withdrawalEligibleBalancePaise: availableBalancePaise,
          pendingWithdrawalPaise: 0,
          totalEarnedPaise,
          totalSettledPaise,
          totalWithdrawnPaise: totalSettledPaise,
          thisWeekEarningsPaise: 0,
          thisMonthEarningsPaise: totalEarnedPaise,
          autoSynced: true,
        };
      }
      const config = cfgSnap.exists ? cfgSnap.data() : { minWithdrawalPaise: 10000, cycleDays: 7, platformFeePct: 10 };
      res.json({ success: true, data: { wallet, config } });
    } catch (e) { next(e); }
  });

  r.get('/large-lab/wallet/transactions', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = req.user?.labId || req.user?.uid || '';
      const snap = await db.collection('walletTransactions').where('phleboId', '==', labId).get();
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ success: true, data: list });
    } catch (e) { next(e); }
  });

  r.get('/large-lab/wallet/withdrawals', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = req.user?.labId || req.user?.uid || '';
      const snap = await db.collection('withdrawalRequests').where('phleboId', '==', labId).get();
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ success: true, data: list });
    } catch (e) { next(e); }
  });

  r.post('/large-lab/wallet/withdrawals', requireAuth, requireRoles(UserRole.LARGE_LAB, UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const labId = req.user?.labId || req.user?.uid || '';
      const result = await handleSubmitWithdrawal({
        beneficiaryType: 'LARGE_LAB',
        id: labId,
        name: req.user?.displayName || req.user?.email || labId,
        requestedAmountPaise: Number(req.body?.requestedAmountPaise),
        paymentMethod: req.body?.paymentMethod,
      });
      res.status(201).json({ success: true, data: result, message: result.message });
    } catch (e) { next(e); }
  });

  r.get('/admin/finance/missing-bank-logos', requireAuth, requireRoles(UserRole.ADMIN), async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const snap = await db.collection('bank_logo_review_queue').orderBy('lastSeenAt', 'desc').limit(100).get();
      res.json({ success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (e) { next(e); }
  });

  return r;
}
