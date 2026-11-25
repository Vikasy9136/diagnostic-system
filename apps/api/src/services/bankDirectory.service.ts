import { type BankDirectoryEntry, type IfscLookupResult } from '@diagnostic/shared';
import { AppError } from '../middleware/errorHandler';
import { isValidIfscCode } from './bankCrypto.service';

const MAINTAINED_BANKS: BankDirectoryEntry[] = [
  { code: 'SBIN', name: 'State Bank of India', shortName: 'SBI', ifscPrefix: 'SBIN', popular: true, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'HDFC', name: 'HDFC Bank', shortName: 'HDFC', ifscPrefix: 'HDFC', popular: true, accentColor: '#1E3A8A', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'ICIC', name: 'ICICI Bank', shortName: 'ICICI', ifscPrefix: 'ICIC', popular: true, accentColor: '#EA580C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'UTIB', name: 'Axis Bank', shortName: 'Axis', ifscPrefix: 'UTIB', popular: true, accentColor: '#9F1239', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', shortName: 'Kotak', ifscPrefix: 'KKBK', popular: true, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'PUNB', name: 'Punjab National Bank', shortName: 'PNB', ifscPrefix: 'PUNB', popular: true, accentColor: '#B91C1C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'BARB', name: 'Bank of Baroda', shortName: 'BOB', ifscPrefix: 'BARB', popular: true, accentColor: '#F97316', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'CNRB', name: 'Canara Bank', shortName: 'Canara', ifscPrefix: 'CNRB', popular: true, accentColor: '#0284C7', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'UBIN', name: 'Union Bank of India', shortName: 'Union Bank', ifscPrefix: 'UBIN', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IDIB', name: 'Indian Bank', shortName: 'Indian Bank', ifscPrefix: 'IDIB', popular: false, accentColor: '#0369A1', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IDFB', name: 'IDFC FIRST Bank', shortName: 'IDFC FIRST', ifscPrefix: 'IDFB', popular: true, accentColor: '#991B1B', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'INDB', name: 'IndusInd Bank', shortName: 'IndusInd', ifscPrefix: 'INDB', popular: false, accentColor: '#7F1D1D', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'YESB', name: 'Yes Bank', shortName: 'Yes Bank', ifscPrefix: 'YESB', popular: false, accentColor: '#1E40AF', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'FDRL', name: 'Federal Bank', shortName: 'Federal', ifscPrefix: 'FDRL', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'AUBL', name: 'AU Small Finance Bank', shortName: 'AU Bank', ifscPrefix: 'AUBL', popular: false, accentColor: '#6D28D9', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'BDBL', name: 'Bandhan Bank', shortName: 'Bandhan', ifscPrefix: 'BDBL', popular: false, accentColor: '#BE123C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'BKID', name: 'Bank of India', shortName: 'BOI', ifscPrefix: 'BKID', popular: false, accentColor: '#0284C7', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'CBIN', name: 'Central Bank of India', shortName: 'CBI', ifscPrefix: 'CBIN', popular: false, accentColor: '#1E3A8A', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IOBA', name: 'Indian Overseas Bank', shortName: 'IOB', ifscPrefix: 'IOBA', popular: false, accentColor: '#0369A1', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'RATN', name: 'RBL Bank', shortName: 'RBL', ifscPrefix: 'RATN', popular: false, accentColor: '#1E3A8A', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'SIBL', name: 'South Indian Bank', shortName: 'SIB', ifscPrefix: 'SIBL', popular: false, accentColor: '#B91C1C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'UCBA', name: 'UCO Bank', shortName: 'UCO', ifscPrefix: 'UCBA', popular: false, accentColor: '#0284C7', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'KARB', name: 'Karnataka Bank', shortName: 'Karnataka', ifscPrefix: 'KARB', popular: false, accentColor: '#7C2D12', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'KVBL', name: 'Karur Vysya Bank', shortName: 'KVB', ifscPrefix: 'KVBL', popular: false, accentColor: '#15803D', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'CIUB', name: 'City Union Bank', shortName: 'CUB', ifscPrefix: 'CIUB', popular: false, accentColor: '#047857', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'DBSS', name: 'DBS Bank India', shortName: 'DBS', ifscPrefix: 'DBSS', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'SCBL', name: 'Standard Chartered Bank', shortName: 'StanChart', ifscPrefix: 'SCBL', popular: false, accentColor: '#0F766E', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'HSBC', name: 'HSBC Bank India', shortName: 'HSBC', ifscPrefix: 'HSBC', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'AIRP', name: 'Airtel Payments Bank', shortName: 'Airtel PB', ifscPrefix: 'AIRP', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'JIOP', name: 'Jio Payments Bank', shortName: 'Jio PB', ifscPrefix: 'JIOP', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'PYTM', name: 'Paytm Payments Bank', shortName: 'Paytm PB', ifscPrefix: 'PYTM', popular: false, accentColor: '#0284C7', upiSupported: false, impsSupported: true, neftSupported: true },
];

const ifscCache = new Map<string, { data: IfscLookupResult; expiresAt: number }>();

export function listSupportedBanks(query?: string): {
  popular: BankDirectoryEntry[];
  all: BankDirectoryEntry[];
} {
  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? MAINTAINED_BANKS.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.shortName.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q) ||
          b.ifscPrefix.toLowerCase().includes(q)
      )
    : MAINTAINED_BANKS;

  const popular = filtered.filter((b) => b.popular);
  const all = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  return { popular, all };
}

export async function lookupIfscDetails(rawIfsc: string): Promise<IfscLookupResult> {
  const ifsc = rawIfsc.trim().toUpperCase();
  if (!isValidIfscCode(ifsc)) {
    throw new AppError(
      'Invalid IFSC code format. Expected 11 characters (e.g., SBIN0001234).',
      400,
      'IFSC_INVALID'
    );
  }

  const cached = ifscCache.get(ifsc);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (res.status === 404) {
      throw new AppError(`IFSC code "${ifsc}" was not found in RBI/NPCI directory.`, 404, 'IFSC_INVALID');
    }
    if (!res.ok) {
      throw new AppError(
        'IFSC lookup service temporarily unavailable. Please retry.',
        503,
        'IFSC_SERVICE_UNAVAILABLE'
      );
    }

    const body = (await res.json()) as Record<string, unknown>;
    const result: IfscLookupResult = {
      valid: true,
      ifsc: String(body.IFSC || ifsc),
      bank: String(body.BANK || ''),
      bankCode: String(body.BANKCODE || ifsc.slice(0, 4)),
      branch: String(body.BRANCH || ''),
      address: String(body.ADDRESS || ''),
      city: String(body.CITY || ''),
      district: String(body.DISTRICT || ''),
      state: String(body.STATE || ''),
      micr: body.MICR ? String(body.MICR) : undefined,
      imps: Boolean(body.IMPS ?? true),
      neft: Boolean(body.NEFT ?? true),
      rtgs: Boolean(body.RTGS ?? false),
      upi: Boolean(body.UPI ?? false),
    };

    if (!result.bank || !result.branch) {
      throw new AppError(
        'IFSC lookup returned incomplete bank/branch metadata.',
        502,
        'IFSC_SERVICE_UNAVAILABLE'
      );
    }

    ifscCache.set(ifsc, { data: result, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'Unable to reach IFSC verification service. Please check network and retry.',
      503,
      'IFSC_SERVICE_UNAVAILABLE'
    );
  } finally {
    clearTimeout(timer);
  }
}
