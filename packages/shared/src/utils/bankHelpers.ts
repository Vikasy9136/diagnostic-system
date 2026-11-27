import { type BankDirectoryEntry } from '../types/payout.js';

export type BankLogoVerificationStatus =
  | 'VERIFIED_OFFICIAL'
  | 'VERIFIED_COMMONS'
  | 'NEUTRAL_FALLBACK'
  | 'PENDING_REVIEW';

export interface BankRegistryEntry {
  bankId: string;
  officialBankName: string;
  shortName: string;
  aliases: string[];
  ifscPrefixes: string[];
  logoAsset: string;
  logoAssetPath: string;
  logoSource: string;
  licenseOrProvenance: string;
  sourceVerificationStatus: BankLogoVerificationStatus;
  activeStatus: boolean;
  popular: boolean;
  accentColor: string;
  upiSupported: boolean;
  impsSupported: boolean;
  neftSupported: boolean;
}

export interface BankBrandMeta {
  code: string;
  shortName: string;
  accentColor: string;
  bgTint: string;
  logoFolder: string;
  logoAsset: string;
  logoAssetPath: string;
  officialBankName: string;
  sourceVerificationStatus: BankLogoVerificationStatus;
  isFallback: boolean;
}

const REGISTRY_ROWS: Array<{
  bankId: string;
  officialBankName: string;
  shortName: string;
  aliases: string[];
  ifscPrefixes: string[];
  logoAsset: string;
  logoSource: string;
  licenseOrProvenance: string;
  sourceVerificationStatus: BankLogoVerificationStatus;
  popular: boolean;
  accentColor: string;
  upiSupported?: boolean;
}> = [
  { bankId: 'SBIN', officialBankName: 'State Bank of India', shortName: 'SBI', aliases: ['sbi', 'state bank', 'state bank of india'], ifscPrefixes: ['SBIN'], logoAsset: 'sbi.png', logoSource: 'Wikimedia Commons (File:SBI-logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#1D4ED8' },
  { bankId: 'HDFC', officialBankName: 'HDFC Bank', shortName: 'HDFC', aliases: ['hdfc', 'hdfc bank', 'hdfc bank ltd', 'hdfc bank limited'], ifscPrefixes: ['HDFC'], logoAsset: 'hdfc.png', logoSource: 'Wikimedia Commons (File:HDFC_Bank_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#1E3A8A' },
  { bankId: 'ICIC', officialBankName: 'ICICI Bank', shortName: 'ICICI', aliases: ['icici', 'icici bank', 'icici bank ltd', 'icici bank limited'], ifscPrefixes: ['ICIC'], logoAsset: 'icici.png', logoSource: 'Wikimedia Commons (File:ICICI_Bank_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#EA580C' },
  { bankId: 'UTIB', officialBankName: 'Axis Bank', shortName: 'AXIS', aliases: ['axis', 'axis bank', 'axis bank ltd', 'uti bank'], ifscPrefixes: ['UTIB'], logoAsset: 'axis.png', logoSource: 'Wikimedia Commons (File:Axis_Bank_logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#9F1239' },
  { bankId: 'KKBK', officialBankName: 'Kotak Mahindra Bank', shortName: 'KOTAK', aliases: ['kotak', 'kotak mahindra', 'kotak mahindra bank', 'kotak mahindra bank limited'], ifscPrefixes: ['KKBK'], logoAsset: 'kotak.png', logoSource: 'Official Kotak Mahindra Bank Website (kotak.com)', licenseOrProvenance: 'Official corporate brand asset (kotak.com)', sourceVerificationStatus: 'VERIFIED_OFFICIAL', popular: true, accentColor: '#DC2626' },
  { bankId: 'PUNB', officialBankName: 'Punjab National Bank', shortName: 'PNB', aliases: ['pnb', 'punjab national', 'punjab national bank'], ifscPrefixes: ['PUNB'], logoAsset: 'pnb.png', logoSource: 'Wikimedia Commons (File:Punjab_National_Bank_new_logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#B91C1C' },
  { bankId: 'BARB', officialBankName: 'Bank of Baroda', shortName: 'BOB', aliases: ['bob', 'bank of baroda', 'baroda'], ifscPrefixes: ['BARB'], logoAsset: 'bob.png', logoSource: 'Wikimedia Commons (File:Bank_of_Baroda_Logo_since_Dec_19.png)', licenseOrProvenance: 'CC BY-SA 4.0', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#F97316' },
  { bankId: 'CNRB', officialBankName: 'Canara Bank', shortName: 'CANARA', aliases: ['canara', 'canara bank'], ifscPrefixes: ['CNRB'], logoAsset: 'canara.png', logoSource: 'Wikimedia Commons (File:Canara_Bank_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#0284C7' },
  { bankId: 'IDFB', officialBankName: 'IDFC FIRST Bank', shortName: 'IDFC', aliases: ['idfc', 'idfc first', 'idfc first bank', 'idfc first bank ltd'], ifscPrefixes: ['IDFB'], logoAsset: 'idfc-first.png', logoSource: 'Wikimedia Commons (File:Logo_of_IDFC_First_Bank.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: true, accentColor: '#991B1B' },
  { bankId: 'UBIN', officialBankName: 'Union Bank of India', shortName: 'UNION', aliases: ['union', 'union bank', 'union bank of india'], ifscPrefixes: ['UBIN'], logoAsset: 'union-bank.png', logoSource: 'Wikimedia Commons (File:Union_Bank_of_India_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#1D4ED8' },
  { bankId: 'IDIB', officialBankName: 'Indian Bank', shortName: 'INDIAN', aliases: ['indian bank'], ifscPrefixes: ['IDIB'], logoAsset: 'indian-bank.png', logoSource: 'Wikimedia Commons (File:Indian-Indian-Bank-logo.jpg)', licenseOrProvenance: 'CC BY-SA 4.0', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#0369A1' },
  { bankId: 'BKID', officialBankName: 'Bank of India', shortName: 'BOI', aliases: ['boi', 'bank of india'], ifscPrefixes: ['BKID'], logoAsset: 'bank-of-india.png', logoSource: 'Wikimedia Commons (File:Bank_of_India.png)', licenseOrProvenance: 'CC0', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#0284C7' },
  { bankId: 'CBIN', officialBankName: 'Central Bank of India', shortName: 'CBI', aliases: ['cbi', 'central bank', 'central bank of india'], ifscPrefixes: ['CBIN'], logoAsset: 'central-bank.png', logoSource: 'Wikipedia (File:Central_Bank_of_India.svg)', licenseOrProvenance: 'Corporate logo / Trademark (Wikipedia)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#1E3A8A' },
  { bankId: 'UCBA', officialBankName: 'UCO Bank', shortName: 'UCO', aliases: ['uco', 'uco bank'], ifscPrefixes: ['UCBA'], logoAsset: 'uco-bank.png', logoSource: 'Wikimedia Commons (File:UCO-Bank_logo.jpg)', licenseOrProvenance: 'CC0', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#0284C7' },
  { bankId: 'MAHB', officialBankName: 'Bank of Maharashtra', shortName: 'BOM', aliases: ['bom', 'bank of maharashtra', 'maharashtra bank'], ifscPrefixes: ['MAHB'], logoAsset: 'bank-of-maharashtra.png', logoSource: 'Wikimedia Commons (File:Bank_of_Maharashtra_logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#1D4ED8' },
  { bankId: 'IOBA', officialBankName: 'Indian Overseas Bank', shortName: 'IOB', aliases: ['iob', 'indian overseas', 'indian overseas bank'], ifscPrefixes: ['IOBA'], logoAsset: 'indian-overseas-bank.png', logoSource: 'Wikimedia Commons (File:Indian_Overseas_Bank_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#0369A1' },
  { bankId: 'IBKL', officialBankName: 'IDBI Bank', shortName: 'IDBI', aliases: ['idbi', 'idbi bank', 'idbi bank ltd'], ifscPrefixes: ['IBKL'], logoAsset: 'idbi.png', logoSource: 'Official IDBI Bank Website (idbibank.in)', licenseOrProvenance: 'Official corporate brand asset (idbibank.in)', sourceVerificationStatus: 'VERIFIED_OFFICIAL', popular: false, accentColor: '#0F766E' },
  { bankId: 'INDB', officialBankName: 'IndusInd Bank', shortName: 'INDUS', aliases: ['indusind', 'indusind bank'], ifscPrefixes: ['INDB'], logoAsset: 'indusind.png', logoSource: 'Wikimedia Commons (File:IndusInd_Bank_SVG_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#7F1D1D' },
  { bankId: 'YESB', officialBankName: 'Yes Bank', shortName: 'YES', aliases: ['yes', 'yes bank', 'yes bank ltd'], ifscPrefixes: ['YESB'], logoAsset: 'yes-bank.png', logoSource: 'Wikimedia Commons (File:Yes_Bank_SVG_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#1E40AF' },
  { bankId: 'FDRL', officialBankName: 'Federal Bank', shortName: 'FEDERAL', aliases: ['federal', 'federal bank', 'the federal bank ltd'], ifscPrefixes: ['FDRL'], logoAsset: 'federal-bank.png', logoSource: 'Wikimedia Commons (File:Federal_bank_India.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#1D4ED8' },
  { bankId: 'AUBL', officialBankName: 'AU Small Finance Bank', shortName: 'AU', aliases: ['au', 'au bank', 'au small finance', 'au small finance bank'], ifscPrefixes: ['AUBL'], logoAsset: 'au-small-finance.png', logoSource: 'Wikimedia Commons (File:Aubank.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#6D28D9' },
  { bankId: 'BDBL', officialBankName: 'Bandhan Bank', shortName: 'BANDHAN', aliases: ['bandhan', 'bandhan bank'], ifscPrefixes: ['BDBL'], logoAsset: 'bandhan-bank.png', logoSource: 'Official Bandhan Bank Website (bandhanbank.com)', licenseOrProvenance: 'Official corporate brand asset (bandhanbank.com)', sourceVerificationStatus: 'VERIFIED_OFFICIAL', popular: false, accentColor: '#BE123C' },
  { bankId: 'RATN', officialBankName: 'RBL Bank', shortName: 'RBL', aliases: ['rbl', 'rbl bank', 'ratnakar bank'], ifscPrefixes: ['RATN'], logoAsset: 'rbl-bank.png', logoSource: 'Wikimedia Commons (File:RBL_Bank_SVG_Logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#1E3A8A' },
  { bankId: 'SIBL', officialBankName: 'South Indian Bank', shortName: 'SIB', aliases: ['sib', 'south indian', 'south indian bank'], ifscPrefixes: ['SIBL'], logoAsset: 'south-indian-bank.png', logoSource: 'Wikimedia Commons (File:South_indian_bank_logo.png)', licenseOrProvenance: 'CC BY-SA 4.0', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#B91C1C' },
  { bankId: 'KARB', officialBankName: 'Karnataka Bank', shortName: 'KARNATAKA', aliases: ['karnataka', 'karnataka bank'], ifscPrefixes: ['KARB'], logoAsset: 'karnataka-bank.png', logoSource: 'Official Karnataka Bank Website (karnatakabank.com)', licenseOrProvenance: 'Official corporate brand asset (karnatakabank.com)', sourceVerificationStatus: 'VERIFIED_OFFICIAL', popular: false, accentColor: '#7C2D12' },
  { bankId: 'CIUB', officialBankName: 'City Union Bank', shortName: 'CUB', aliases: ['cub', 'city union', 'city union bank'], ifscPrefixes: ['CIUB'], logoAsset: 'city-union-bank.png', logoSource: 'Official City Union Bank Website (cityunionbank.com)', licenseOrProvenance: 'Official corporate brand asset (cityunionbank.com)', sourceVerificationStatus: 'VERIFIED_OFFICIAL', popular: false, accentColor: '#047857' },
  { bankId: 'PSIB', officialBankName: 'Punjab & Sind Bank', shortName: 'PSB', aliases: ['psb', 'punjab & sind bank', 'punjab and sind bank'], ifscPrefixes: ['PSIB'], logoAsset: 'punjab-sind-bank.png', logoSource: 'Wikimedia Commons (File:Punjab_&_Sind_Bank.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#15803D' },
  { bankId: 'KVBL', officialBankName: 'Karur Vysya Bank', shortName: 'KVB', aliases: ['kvb', 'karur vysya', 'karur vysya bank'], ifscPrefixes: ['KVBL'], logoAsset: 'karur-vysya-bank.png', logoSource: 'Wikimedia Commons (File:Karur_Vysya_Bank.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#15803D' },
  { bankId: 'DBSS', officialBankName: 'DBS Bank India', shortName: 'DBS', aliases: ['dbs', 'dbs bank', 'dbs bank india'], ifscPrefixes: ['DBSS'], logoAsset: 'dbs.png', logoSource: 'Official DBS Bank India Website (dbs.com)', licenseOrProvenance: 'Official corporate brand asset (dbs.com)', sourceVerificationStatus: 'VERIFIED_OFFICIAL', popular: false, accentColor: '#DC2626' },
  { bankId: 'SCBL', officialBankName: 'Standard Chartered Bank', shortName: 'SCB', aliases: ['scb', 'standard chartered', 'standard chartered bank'], ifscPrefixes: ['SCBL'], logoAsset: 'standard-chartered.png', logoSource: 'Wikimedia Commons (File:Standard_Chartered_(2021).svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#0F766E' },
  { bankId: 'HSBC', officialBankName: 'HSBC Bank India', shortName: 'HSBC', aliases: ['hsbc', 'hsbc bank', 'hsbc bank india'], ifscPrefixes: ['HSBC'], logoAsset: 'hsbc.png', logoSource: 'Wikimedia Commons (File:HSBC_logo_(2018).svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#DC2626' },
  { bankId: 'AIRP', officialBankName: 'Airtel Payments Bank', shortName: 'AIRTEL', aliases: ['airtel', 'airtel payments bank'], ifscPrefixes: ['AIRP'], logoAsset: 'airtel-payments-bank.png', logoSource: 'Wikimedia Commons (File:Airtel_Payments_Bank_logo.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#DC2626' },
  { bankId: 'JIOP', officialBankName: 'Jio Payments Bank', shortName: 'JIO', aliases: ['jio', 'jio payments bank'], ifscPrefixes: ['JIOP'], logoAsset: 'jio-payments-bank.png', logoSource: 'Wikimedia Commons (File:Jio-pay.svg)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#1D4ED8' },
  { bankId: 'PYTM', officialBankName: 'Paytm Payments Bank', shortName: 'PAYTM', aliases: ['paytm', 'paytm payments bank'], ifscPrefixes: ['PYTM'], logoAsset: 'paytm-payments-bank.png', logoSource: 'Wikimedia Commons (File:Paytm_logo.png)', licenseOrProvenance: 'Public domain (PD-textlogo / trademark)', sourceVerificationStatus: 'VERIFIED_COMMONS', popular: false, accentColor: '#0284C7', upiSupported: false },
];

export const CENTRAL_BANK_REGISTRY: BankRegistryEntry[] = REGISTRY_ROWS.map((row) => ({
  bankId: row.bankId,
  officialBankName: row.officialBankName,
  shortName: row.shortName,
  aliases: row.aliases,
  ifscPrefixes: row.ifscPrefixes,
  logoAsset: row.logoAsset,
  logoAssetPath: `packages/shared/assets/banks/${row.logoAsset}`,
  logoSource: row.logoSource,
  licenseOrProvenance: row.licenseOrProvenance,
  sourceVerificationStatus: row.sourceVerificationStatus,
  activeStatus: true,
  popular: row.popular,
  accentColor: row.accentColor,
  upiSupported: row.upiSupported ?? true,
  impsSupported: true,
  neftSupported: true,
}));

export const SUPPORTED_BANKS_DIRECTORY: BankDirectoryEntry[] = CENTRAL_BANK_REGISTRY.map((entry) => ({
  code: entry.bankId,
  name: entry.officialBankName,
  shortName: entry.shortName,
  ifscPrefix: entry.ifscPrefixes[0],
  popular: entry.popular,
  accentColor: entry.accentColor,
  upiSupported: entry.upiSupported,
  impsSupported: entry.impsSupported,
  neftSupported: entry.neftSupported,
}));

function normalizeBankToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function resolveBankFromRegistry(input?: {
  ifsc?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
}): BankRegistryEntry | null {
  const ifscPrefix = (input?.ifsc || '').trim().toUpperCase().slice(0, 4);
  const code = (input?.bankCode || '').trim().toUpperCase().slice(0, 4);

  for (const candidatePrefix of [ifscPrefix, code]) {
    if (candidatePrefix && /^[A-Z]{4}$/.test(candidatePrefix)) {
      const exactCodeMatch = CENTRAL_BANK_REGISTRY.find(
        (b) => b.activeStatus && (b.bankId === candidatePrefix || b.ifscPrefixes.includes(candidatePrefix))
      );
      if (exactCodeMatch) return exactCodeMatch;
    }
  }

  const normName = normalizeBankToken(input?.bankName || '');
  if (normName) {
    const exactNameMatch = CENTRAL_BANK_REGISTRY.find(
      (b) =>
        b.activeStatus &&
        (normalizeBankToken(b.officialBankName) === normName ||
          normalizeBankToken(b.shortName) === normName ||
          b.aliases.some((alias) => normalizeBankToken(alias) === normName))
    );
    if (exactNameMatch) return exactNameMatch;
  }

  return null;
}

export function filterSupportedBanks(query?: string): {
  popular: BankDirectoryEntry[];
  all: BankDirectoryEntry[];
} {
  const q = (query || '').trim().toLowerCase();
  const registryMatches = q
    ? CENTRAL_BANK_REGISTRY.filter(
        (b) =>
          b.activeStatus &&
          (b.officialBankName.toLowerCase().includes(q) ||
            b.shortName.toLowerCase().includes(q) ||
            b.bankId.toLowerCase().includes(q) ||
            b.ifscPrefixes.some((p) => p.toLowerCase().includes(q)) ||
            b.aliases.some((alias) => alias.includes(q) || q.includes(alias)))
      ).map((b) => b.bankId)
    : null;

  const filtered = registryMatches
    ? SUPPORTED_BANKS_DIRECTORY.filter((b) => registryMatches.includes(b.code))
    : SUPPORTED_BANKS_DIRECTORY;

  return {
    popular: filtered.filter((b) => b.popular),
    all: [...filtered].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function getBankBrandMeta(bankCodeOrIfscOrName?: string): BankBrandMeta {
  const raw = (bankCodeOrIfscOrName || '').trim();
  const upper4 = raw.toUpperCase().slice(0, 4);
  const resolved = resolveBankFromRegistry({
    ifsc: /^[A-Z]{4}0?[A-Z0-9]*$/i.test(raw) ? raw : undefined,
    bankCode: /^[A-Z]{4}$/i.test(upper4) ? upper4 : undefined,
    bankName: raw,
  });

  if (resolved) {
    return {
      code: resolved.bankId,
      shortName: resolved.shortName,
      accentColor: resolved.accentColor,
      bgTint: '#F8FAFC',
      logoFolder: resolved.logoAsset.replace(/\.png$/i, ''),
      logoAsset: resolved.logoAsset,
      logoAssetPath: resolved.logoAssetPath,
      officialBankName: resolved.officialBankName,
      sourceVerificationStatus: resolved.sourceVerificationStatus,
      isFallback: false,
    };
  }

  return {
    code: upper4 || 'BANK',
    shortName: upper4 || 'BANK',
    accentColor: '#0D9488',
    bgTint: '#F0FDFA',
    logoFolder: 'other-banks',
    logoAsset: 'other-banks.png',
    logoAssetPath: 'packages/shared/assets/banks/other-banks.png',
    officialBankName: raw || 'Other Bank',
    sourceVerificationStatus: 'NEUTRAL_FALLBACK',
    isFallback: true,
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
