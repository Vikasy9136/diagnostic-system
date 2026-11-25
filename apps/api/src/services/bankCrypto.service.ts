import crypto from 'node:crypto';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

export interface EncryptedFieldEnvelope {
  ciphertext: string; // base64
  iv: string; // base64 (12 bytes)
  authTag: string; // base64 (16 bytes)
  keyVersion: string;
  alg: 'aes-256-gcm';
}

let devEphemeralKey: Buffer | null = null;

function resolveEncryptionKey(): { key: Buffer; keyVersion: string } {
  const raw = config.security.bankEncryptionKey;
  const keyVersion = config.security.bankEncryptionKeyVersion || 'v1';

  if (raw) {
    // Support 64-char hex, 32-byte base64, or passphrase-derived 256-bit key
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return { key: Buffer.from(raw, 'hex'), keyVersion };
    }
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === 32) {
      return { key: b64, keyVersion };
    }
    return {
      key: crypto.createHash('sha256').update(raw, 'utf8').digest(),
      keyVersion,
    };
  }

  if (config.env === 'production') {
    throw new AppError(
      'BANK_ENCRYPTION_KEY is not configured in server environment. Cannot store sensitive financial data.',
      503,
      'ENCRYPTION_KEY_NOT_CONFIGURED'
    );
  }

  if (!devEphemeralKey) {
    // Ephemeral dev-only key in memory (never written to Firestore or code)
    devEphemeralKey = crypto.randomBytes(32);
    console.warn(
      '[bankCrypto] BANK_ENCRYPTION_KEY not set in non-production; using ephemeral in-memory AES-256-GCM key.'
    );
  }
  return { key: devEphemeralKey, keyVersion: `dev-${keyVersion}` };
}

export function encryptSensitiveField(plaintext: string): EncryptedFieldEnvelope {
  const clean = plaintext.trim();
  if (!clean) {
    throw new AppError('Cannot encrypt empty sensitive value.', 400, 'BAD_REQUEST');
  }
  const { key, keyVersion } = resolveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion,
    alg: 'aes-256-gcm',
  };
}

export function decryptSensitiveField(envelope: EncryptedFieldEnvelope): string {
  const { key } = resolveEncryptionKey();
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s+/g, '');
  if (digits.length <= 4) return '******';
  return `${'*'.repeat(Math.max(6, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskUpiId(upiId: string): string {
  const clean = upiId.trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '***';
  const user = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx);
  const visible = user.slice(0, Math.min(3, user.length));
  return `${visible}***${domain}`;
}

export function isValidBankAccountNumber(accountNumber: string): boolean {
  const clean = accountNumber.replace(/\s+/g, '');
  return /^[0-9]{9,18}$/.test(clean);
}

export function isValidIfscCode(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
}

export function isValidUpiVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,32}$/.test(vpa.trim());
}
