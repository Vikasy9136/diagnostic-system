import { type LabCenterType, StorageTemperature, UserRole } from '../types/index.js';
import { TEMPERATURE_LIMITS } from './constants.js';

/**
 * Checks whether a measured temperature satisfies the required cold-chain range
 */
export function isTemperatureCompliant(
  temperatureCelsius: number,
  requirement: StorageTemperature
): boolean {
  const limits = TEMPERATURE_LIMITS[requirement];
  if (!limits) return false;
  return temperatureCelsius >= limits.min && temperatureCelsius <= limits.max;
}

/**
 * Validates specimen barcode structure (e.g. SMP-202611-ABC12)
 */
export function isValidSpecimenBarcode(barcode: string): boolean {
  if (!barcode || typeof barcode !== 'string') return false;
  const regex = /^SMP-[A-Z0-9]{4,16}$/i;
  return regex.test(barcode.trim());
}

/**
 * Validates pickup order number structure (e.g. ORD-202611-ABC12)
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  if (!orderNumber || typeof orderNumber !== 'string') return false;
  const regex = /^ORD-[A-Z0-9]{4,16}$/i;
  return regex.test(orderNumber.trim());
}

export function normalizeIdentifierCode(input: string): string {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isEmailIdentifier(input: string): boolean {
  return String(input || '').trim().includes('@');
}

export function maskEmailAddress(email: string): string {
  const clean = String(email || '').trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const shownLocal = local.length <= 2 ? `${local[0]}***` : `${local.slice(0, 2)}***`;
  const dotIdx = domain.lastIndexOf('.');
  const domainName = dotIdx > 0 ? domain.slice(0, dotIdx) : domain;
  const domainTld = dotIdx > 0 ? domain.slice(dotIdx) : '';
  const shownDomain =
    domainName.length <= 2 ? `${domainName[0] || '*'}**` : `${domainName.slice(0, 2)}***`;
  return `${shownLocal}@${shownDomain}${domainTld}`;
}

export function getRoleAssignedIdPrefix(params: {
  role: UserRole;
  centerType?: LabCenterType | string;
  isEmployee?: boolean;
}): string {
  if (params.role === UserRole.SMALL_LAB) return 'LAB-SM-';
  if (params.role === UserRole.LARGE_LAB) {
    return params.centerType === 'COLLECTION_CENTER' ? 'LAB-CC-' : 'LAB-LG-';
  }
  if (params.role === UserRole.PHLEBOTOMIST) return 'PHL-';
  return params.isEmployee ? 'EMP-' : 'USR-ADM-';
}

export function generateRoleAssignedId(params: {
  role: UserRole;
  centerType?: LabCenterType | string;
  isEmployee?: boolean;
  existingCodes?: string[];
  preferredCode?: string;
}): string {
  const preferred = params.preferredCode ? normalizeIdentifierCode(params.preferredCode) : '';
  if (preferred && /^[A-Z]{2,8}-[A-Z0-9-]{2,16}$/.test(preferred)) {
    return preferred;
  }

  const prefix = getRoleAssignedIdPrefix(params);
  const used = new Set(
    (params.existingCodes || []).map((c) => normalizeIdentifierCode(c)).filter(Boolean)
  );

  let maxNum = 1000;
  for (const code of used) {
    if (code.startsWith(prefix)) {
      const tail = code.slice(prefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (Number.isFinite(parsed) && parsed > maxNum && parsed < 999999) {
        maxNum = parsed;
      }
    }
  }

  let candidateNum = maxNum + 1;
  while (used.has(`${prefix}${candidateNum}`)) {
    candidateNum += 1;
  }
  return `${prefix}${candidateNum}`;
}

export function generateStrongInitialPassword(length = 12): string {
  const safeLen = Math.max(8, Math.min(24, length));
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$!*';
  const all = upper + lower + digits + symbols;

  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  while (chars.length < safeLen) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

/**
 * Deeply sanitizes any JavaScript object or array before passing to Firestore setDoc(), updateDoc(), or addDoc().
 * Recursively strips keys with undefined values so Firestore does not throw:
 * "Function setDoc() called with invalid data. Unsupported field value: undefined"
 */
export function deepCleanFirestorePayload<T>(val: T): T {
  if (val === null || val === undefined) {
    return undefined as unknown as T;
  }
  if (val instanceof Date) {
    return val.toISOString() as unknown as T;
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => deepCleanFirestorePayload(item))
      .filter((item) => item !== undefined) as unknown as T;
  }
  if (typeof val === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        const cleaned = deepCleanFirestorePayload(v);
        if (cleaned !== undefined) {
          clean[key] = cleaned;
        }
      }
    }
    return clean as T;
  }
  return val;
}


