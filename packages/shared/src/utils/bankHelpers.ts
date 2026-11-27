export interface BankBrandMeta {
  code: string;
  shortName: string;
  accentColor: string;
  bgTint: string;
}

const BANK_BRAND_MAP: Record<string, BankBrandMeta> = {
  SBIN: { code: 'SBIN', shortName: 'SBI', accentColor: '#1D4ED8', bgTint: '#EFF6FF' },
  HDFC: { code: 'HDFC', shortName: 'HDFC', accentColor: '#1E3A8A', bgTint: '#EFF6FF' },
  ICIC: { code: 'ICIC', shortName: 'ICICI', accentColor: '#EA580C', bgTint: '#FFF7ED' },
  UTIB: { code: 'UTIB', shortName: 'AXIS', accentColor: '#9F1239', bgTint: '#FFF1F2' },
  KKBK: { code: 'KKBK', shortName: 'KOTAK', accentColor: '#DC2626', bgTint: '#FEF2F2' },
  PUNB: { code: 'PUNB', shortName: 'PNB', accentColor: '#B91C1C', bgTint: '#FEF2F2' },
  BARB: { code: 'BARB', shortName: 'BOB', accentColor: '#F97316', bgTint: '#FFF7ED' },
  CNRB: { code: 'CNRB', shortName: 'CANARA', accentColor: '#0284C7', bgTint: '#F0F9FF' },
  UBIN: { code: 'UBIN', shortName: 'UNION', accentColor: '#1D4ED8', bgTint: '#EFF6FF' },
  IDIB: { code: 'IDIB', shortName: 'INDIAN', accentColor: '#0369A1', bgTint: '#F0F9FF' },
  IDFB: { code: 'IDFB', shortName: 'IDFC', accentColor: '#991B1B', bgTint: '#FEF2F2' },
  INDB: { code: 'INDB', shortName: 'INDUS', accentColor: '#7F1D1D', bgTint: '#FEF2F2' },
  YESB: { code: 'YESB', shortName: 'YES', accentColor: '#1E40AF', bgTint: '#EFF6FF' },
  FDRL: { code: 'FDRL', shortName: 'FEDERAL', accentColor: '#1D4ED8', bgTint: '#EFF6FF' },
  AUBL: { code: 'AUBL', shortName: 'AU', accentColor: '#6D28D9', bgTint: '#F5F3FF' },
  BDBL: { code: 'BDBL', shortName: 'BANDHAN', accentColor: '#BE123C', bgTint: '#FFF1F2' },
  BKID: { code: 'BKID', shortName: 'BOI', accentColor: '#0284C7', bgTint: '#F0F9FF' },
};

export function getBankBrandMeta(bankCodeOrIfsc?: string): BankBrandMeta {
  const code = (bankCodeOrIfsc || '').trim().toUpperCase().slice(0, 4);
  if (code && BANK_BRAND_MAP[code]) {
    return BANK_BRAND_MAP[code];
  }
  return {
    code: code || 'BANK',
    shortName: code || 'BANK',
    accentColor: '#0D9488',
    bgTint: '#F0FDFA',
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
