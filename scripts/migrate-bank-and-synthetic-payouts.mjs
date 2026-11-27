/**
 * Safe Bank Data & Synthetic Payout Migration Script (Dry-Run First)
 *
 * Usage:
 *   node scripts/migrate-bank-and-synthetic-payouts.mjs           # Dry-run (read-only audit + backup preview)
 *   node scripts/migrate-bank-and-synthetic-payouts.mjs --execute # Executes backup -> encrypt -> verify -> flag synthetic payouts
 *
 * NEVER deletes historical financial records.
 * NEVER removes plaintext bankAccountNumber until AES-256-GCM encryption + decrypt round-trip succeeds.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const EXECUTE = process.argv.includes('--execute');
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json'
);

function resolveKey() {
  const raw = (process.env.BANK_ENCRYPTION_KEY || '').trim();
  const keyVersion = (process.env.BANK_ENCRYPTION_KEY_VERSION || 'v1').trim();
  if (!raw) {
    throw new Error('BANK_ENCRYPTION_KEY is required in .env before encrypting bank records.');
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return { key: Buffer.from(raw, 'hex'), keyVersion };
  }
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) {
    return { key: b64, keyVersion };
  }
  return { key: crypto.createHash('sha256').update(raw, 'utf8').digest(), keyVersion };
}

function encryptAes256Gcm(plaintext, key, keyVersion) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion,
    alg: 'aes-256-gcm',
  };
}

function decryptAes256Gcm(env, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(env.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Service account not found at ${SERVICE_ACCOUNT_PATH}`);
  }
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  console.log(`Mode: ${EXECUTE ? 'EXECUTE (WITH BACKUP)' : 'DRY-RUN (READ-ONLY)'}`);

  const [phSnap, payoutsSnap, stlSnap] = await Promise.all([
    db.collection('phlebotomists').get(),
    db.collection('payouts').get(),
    db.collection('settlements').get(),
  ]);

  const plaintextBankRecords = [];
  for (const doc of phSnap.docs) {
    const data = doc.data();
    const pp = data.payoutProfile || {};
    if (pp.bankAccountNumber || pp.upiId) {
      plaintextBankRecords.push({ phleboId: doc.id, payoutProfile: pp });
    }
  }

  const syntheticPayouts = [];
  for (const doc of payoutsSnap.docs) {
    const p = doc.data();
    const ref = String(p.referenceId || '');
    if (/^(CURPAY|LABPAY)-/i.test(ref) && !p.gatewayPayoutId) {
      syntheticPayouts.push({ id: doc.id, ...p });
    }
  }

  const syntheticSettlements = [];
  for (const doc of stlSnap.docs) {
    const s = doc.data();
    const phRef = String(s.phleboPayoutRef || '');
    const labRef = String(s.labPayoutRef || '');
    if (/^(CURPAY|LABPAY)-/i.test(phRef) || /^(CURPAY|LABPAY)-/i.test(labRef)) {
      syntheticSettlements.push({ id: doc.id, phleboPayoutRef: phRef, labPayoutRef: labRef });
    }
  }

  console.log(`Found ${plaintextBankRecords.length} Phlebo doc(s) with legacy plaintext bank/UPI fields.`);
  console.log(`Found ${syntheticPayouts.length} synthetic payout doc(s) (CURPAY-/LABPAY- without gatewayPayoutId).`);
  console.log(`Found ${syntheticSettlements.length} settlement doc(s) referencing synthetic payout refs.`);

  if (!EXECUTE) {
    console.log('Dry-run complete. No data was modified.');
    return;
  }

  const { key, keyVersion } = resolveKey();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `bank-and-payout-backup-${Date.now()}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify({ createdAt: new Date().toISOString(), plaintextBankRecords, syntheticPayouts, syntheticSettlements }, null, 2),
    'utf8'
  );
  console.log(`Backup written to ${backupFile}`);

  const now = new Date().toISOString();
  for (const rec of plaintextBankRecords) {
    const pp = rec.payoutProfile;
    if (pp.bankAccountNumber) {
      const rawAcct = String(pp.bankAccountNumber).replace(/\s+/g, '');
      const env = encryptAes256Gcm(rawAcct, key, keyVersion);
      if (decryptAes256Gcm(env, key) !== rawAcct) {
        throw new Error(`Encryption verification failed for ${rec.phleboId}`);
      }
      const last4 = rawAcct.slice(-4);
      const masked = `${'*'.repeat(Math.max(6, rawAcct.length - 4))}${last4}`;
      await db.collection('phlebo_bank_accounts').doc(rec.phleboId).set({
        id: rec.phleboId,
        phleboId: rec.phleboId,
        bankName: pp.bankName || 'Migrated Bank',
        ifsc: pp.ifscCode || '',
        accountHolderName: pp.accountHolderName || '',
        encryptedAccountNumber: env,
        maskedAccountNumber: masked,
        last4,
        verificationStatus: 'REVERIFICATION_REQUIRED',
        keyVersion,
        isDefault: true,
        migratedFromLegacyAt: now,
        updatedAt: now,
      }, { merge: true });
    }
    if (pp.upiId) {
      const rawUpi = String(pp.upiId).trim().toLowerCase();
      const env = encryptAes256Gcm(rawUpi, key, keyVersion);
      if (decryptAes256Gcm(env, key) !== rawUpi) {
        throw new Error(`UPI encryption verification failed for ${rec.phleboId}`);
      }
      const atIdx = rawUpi.indexOf('@');
      const maskedUpi = atIdx > 0 ? `${rawUpi.slice(0, Math.min(3, atIdx))}***${rawUpi.slice(atIdx)}` : '***';
      await db.collection('phlebo_upi_accounts').doc(rec.phleboId).set({
        id: rec.phleboId,
        phleboId: rec.phleboId,
        encryptedUpiId: env,
        maskedUpiId: maskedUpi,
        vpaHandle: atIdx > 0 ? rawUpi.slice(atIdx + 1) : '',
        verificationStatus: 'REVERIFICATION_REQUIRED',
        keyVersion,
        isDefault: !pp.bankAccountNumber,
        migratedFromLegacyAt: now,
        updatedAt: now,
      }, { merge: true });
    }
    // Remove plaintext bankAccountNumber & upiId only after verified encryption
    await db.collection('phlebotomists').doc(rec.phleboId).update({
      'payoutProfile.bankAccountNumber': admin.firestore.FieldValue.delete(),
      'payoutProfile.upiId': admin.firestore.FieldValue.delete(),
      'payoutProfile.migratedToEncryptedVaultAt': now,
    });
  }

  for (const sp of syntheticPayouts) {
    await db.collection('payouts').doc(sp.id).set({
      reconciliationStatus: 'NEEDS_RECONCILIATION',
      syntheticUnverified: true,
      flaggedForReconciliationAt: now,
    }, { merge: true });
  }

  for (const ss of syntheticSettlements) {
    await db.collection('settlements').doc(ss.id).set({
      reconciliationStatus: 'NEEDS_RECONCILIATION',
      syntheticPayoutFlaggedAt: now,
    }, { merge: true });
  }

  console.log('Migration executed safely.');
}

main().catch((err) => {
  console.error('Migration aborted:', err);
  process.exit(1);
});
