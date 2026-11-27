import { type BankDirectoryEntry } from '../types/payout.js';

export interface BankBrandMeta {
  code: string;
  shortName: string;
  accentColor: string;
  bgTint: string;
  logoFolder: string;
  logoAssetPath: string;
}

const BANK_FOLDER_MAP: Record<string, string> = {
  SBIN: 'sbi',
  HDFC: 'hdfc',
  ICIC: 'icici',
  UTIB: 'axis',
  KKBK: 'kotak',
  PUNB: 'pnb',
  BARB: 'bob',
  CNRB: 'canara',
  UBIN: 'union-bank',
  IBKL: 'idbi',
  INDB: 'indusind',
  YESB: 'yes-bank',
  FDRL: 'federal-bank',
  IDFB: 'idfc-first',
  AUBL: 'au-small-finance',
  BKID: 'bank-of-india',
  IDIB: 'indian-bank',
  CBIN: 'central-bank',
  UCBA: 'uco-bank',
  MAHB: 'bank-of-maharashtra',
  IOBA: 'indian-overseas-bank',
};

const BANK_ALIASES: Record<string, string[]> = {
  SBIN: ['sbi', 'state bank', 'state bank of india'],
  HDFC: ['hdfc', 'hdfc bank'],
  ICIC: ['icici', 'icici bank'],
  UTIB: ['axis', 'axis bank', 'uti'],
  KKBK: ['kotak', 'kotak mahindra'],
  PUNB: ['pnb', 'punjab national'],
  BARB: ['bob', 'bank of baroda', 'baroda'],
  CNRB: ['canara'],
  UBIN: ['union', 'union bank'],
  IBKL: ['idbi'],
  INDB: ['indusind'],
  YESB: ['yes', 'yes bank'],
  FDRL: ['federal'],
  IDFB: ['idfc', 'idfc first'],
  AUBL: ['au', 'au small finance'],
  BKID: ['boi', 'bank of india'],
  IDIB: ['indian bank'],
  CBIN: ['cbi', 'central bank'],
  UCBA: ['uco'],
  MAHB: ['bom', 'maharashtra'],
  IOBA: ['iob', 'indian overseas'],
};

export const SUPPORTED_BANKS_DIRECTORY: BankDirectoryEntry[] = [
  { code: 'SBIN', name: 'State Bank of India', shortName: 'SBI', ifscPrefix: 'SBIN', popular: true, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'HDFC', name: 'HDFC Bank', shortName: 'HDFC', ifscPrefix: 'HDFC', popular: true, accentColor: '#1E3A8A', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'ICIC', name: 'ICICI Bank', shortName: 'ICICI', ifscPrefix: 'ICIC', popular: true, accentColor: '#EA580C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'UTIB', name: 'Axis Bank', shortName: 'AXIS', ifscPrefix: 'UTIB', popular: true, accentColor: '#9F1239', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', shortName: 'KOTAK', ifscPrefix: 'KKBK', popular: true, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'PUNB', name: 'Punjab National Bank', shortName: 'PNB', ifscPrefix: 'PUNB', popular: true, accentColor: '#B91C1C', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'BARB', name: 'Bank of Baroda', shortName: 'BOB', ifscPrefix: 'BARB', popular: true, accentColor: '#F97316', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'CNRB', name: 'Canara Bank', shortName: 'CANARA', ifscPrefix: 'CNRB', popular: true, accentColor: '#0284C7', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IDFB', name: 'IDFC FIRST Bank', shortName: 'IDFC', ifscPrefix: 'IDFB', popular: true, accentColor: '#991B1B', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'IBKL', name: 'IDBI Bank', shortName: 'IDBI', ifscPrefix: 'IBKL', popular: false, accentColor: '#0F766E', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'MAHB', name: 'Bank of Maharashtra', shortName: 'BOM', ifscPrefix: 'MAHB', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
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
  { code: 'DBSS', name: 'DBS Bank India', shortName: 'DBS', ifscPrefix: 'DBSS', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'SCBL', name: 'Standard Chartered Bank', shortName: 'SCB', ifscPrefix: 'SCBL', popular: false, accentColor: '#0F766E', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'HSBC', name: 'HSBC Bank India', shortName: 'HSBC', ifscPrefix: 'HSBC', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'AIRP', name: 'Airtel Payments Bank', shortName: 'AIRTEL', ifscPrefix: 'AIRP', popular: false, accentColor: '#DC2626', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'JIOP', name: 'Jio Payments Bank', shortName: 'JIO', ifscPrefix: 'JIOP', popular: false, accentColor: '#1D4ED8', upiSupported: true, impsSupported: true, neftSupported: true },
  { code: 'PYTM', name: 'Paytm Payments Bank', shortName: 'PAYTM', ifscPrefix: 'PYTM', popular: false, accentColor: '#0284C7', upiSupported: false, impsSupported: true, neftSupported: true },
];

export function filterSupportedBanks(query?: string): {
  popular: BankDirectoryEntry[];
  all: BankDirectoryEntry[];
} {
  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? SUPPORTED_BANKS_DIRECTORY.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.shortName.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q) ||
          b.ifscPrefix.toLowerCase().includes(q) ||
          (BANK_ALIASES[b.code] || []).some((alias) => alias.includes(q) || q.includes(alias))
      )
    : SUPPORTED_BANKS_DIRECTORY;
  return {
    popular: filtered.filter((b) => b.popular),
    all: [...filtered].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function getBankBrandMeta(bankCodeOrIfscOrName?: string): BankBrandMeta {
  const raw = (bankCodeOrIfscOrName || '').trim();
  const prefix = raw.toUpperCase().slice(0, 4);
  const byCode = SUPPORTED_BANKS_DIRECTORY.find((b) => b.code === prefix || b.ifscPrefix === prefix);
  if (byCode) {
    const folder = BANK_FOLDER_MAP[byCode.code] || 'other-banks';
    return {
      code: byCode.code,
      shortName: byCode.shortName,
      accentColor: byCode.accentColor,
      bgTint: '#F8FAFC',
      logoFolder: folder,
      logoAssetPath: `packages/shared/assets/banks/${folder}/logo.svg`,
    };
  }
  const lower = raw.toLowerCase();
  const byName = lower
    ? SUPPORTED_BANKS_DIRECTORY.find(
        (b) =>
          b.name.toLowerCase().includes(lower) ||
          lower.includes(b.shortName.toLowerCase()) ||
          lower.includes(b.name.toLowerCase()) ||
          (BANK_ALIASES[b.code] || []).some((alias) => lower.includes(alias))
      )
    : undefined;
  if (byName) {
    const folder = BANK_FOLDER_MAP[byName.code] || 'other-banks';
    return {
      code: byName.code,
      shortName: byName.shortName,
      accentColor: byName.accentColor,
      bgTint: '#F8FAFC',
      logoFolder: folder,
      logoAssetPath: `packages/shared/assets/banks/${folder}/logo.svg`,
    };
  }
  return {
    code: prefix || 'BANK',
    shortName: prefix || 'BANK',
    accentColor: '#0D9488',
    bgTint: '#F0FDFA',
    logoFolder: 'other-banks',
    logoAssetPath: 'packages/shared/assets/banks/other-banks/logo.svg',
  };
}

export function buildUpiIntentUri(params: { upiId: string; payeeName?: string }): string {
  const pa = encodeURIComponent(params.upiId.trim().toLowerCase());
  const pn = encodeURIComponent((params.payeeName || 'LabSetu Beneficiary').trim());
  return `upi://pay?pa=${pa}&pn=${pn}&cu=INR`;
}

export function parseUpiIntentUri(uri: string): { upiId?: string; payeeName?: string } {
  const clean = (uri || '').trim();
  if (!clean.toLowerCase().startsWith('upi://pay')) return {};
  const qIndex = clean.indexOf('?');
  if (qIndex < 0) return {};
  const query = clean.slice(qIndex + 1);
  const params = new URLSearchParams(query);
  const pa = params.get('pa')?.trim().toLowerCase();
  const pn = params.get('pn')?.trim();
  return {
    upiId: pa || undefined,
    payeeName: pn || undefined,
  };
}
