import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(__dirname, '../../../../firebase/firestore.rules');
const rulesText = fs.readFileSync(rulesPath, 'utf8');

function extractMatchBlock(collectionName: string): string {
  const startMarker = `match /${collectionName}/`;
  const idx = rulesText.indexOf(startMarker);
  assert.ok(idx !== -1, `Missing match block for ${collectionName}`);
  const rest = rulesText.slice(idx);
  const nextMatchIdx = rest.indexOf('\n    match /', 10);
  return nextMatchIdx === -1 ? rest : rest.slice(0, nextMatchIdx);
}

test('Security Rule 1: Phlebo can read own profile, cannot read another Phlebo profile', () => {
  const block = extractMatchBlock('phlebotomists');
  assert.ok(
    !block.includes('allow read: if isAuthenticated() && isAccountActive();'),
    'Unrestricted read on phlebotomists must be removed'
  );
  assert.match(block, /isPhlebotomist\(\)/);
  assert.match(block, /phleboId == request\.auth\.uid/);
  assert.match(block, /getPhlebotomistId\(\) == phleboId/);
});

test('Security Rule 2 & 3: Small Lab and Large Lab are denied reading Phlebo profiles & bank details', () => {
  const phBlock = extractMatchBlock('phlebotomists');
  assert.ok(!phBlock.includes('isSmallLab()'), 'Small Lab must NOT have read access to phlebotomists');
  assert.ok(!phBlock.includes('isLargeLab()'), 'Large Lab must NOT have read access to phlebotomists');

  const bankBlock = extractMatchBlock('phlebo_bank_accounts');
  assert.match(bankBlock, /allow read, write: if false;/);

  const upiBlock = extractMatchBlock('phlebo_upi_accounts');
  assert.match(upiBlock, /allow read, write: if false;/);
});

test('Security Rule 4: Operations employee without financial/phlebo-network permissions is denied sensitive bank details', () => {
  const phBlock = extractMatchBlock('phlebotomists');
  assert.ok(
    !phBlock.includes('VIEW_OPERATIONS_DASHBOARD'),
    'General operations permission must not grant blanket read to phlebotomists'
  );
  const bankBlock = extractMatchBlock('phlebo_bank_accounts');
  assert.match(bankBlock, /allow read, write: if false;/);
});

test('Security Rule 5: Phlebo cannot self-update payoutProfile, pending fees, or KYC status from client', () => {
  const phBlock = extractMatchBlock('phlebotomists');
  assert.match(phBlock, /affectedKeys\(\)\.hasAny\(/);
  assert.match(phBlock, /'payoutProfile'/);
  assert.match(phBlock, /'pendingPlatformFeeDueInr'/);
  assert.match(phBlock, /'kycVerified'/);
});

test('Security Rule 6: Unauthorised user cannot modify settlement amounts', () => {
  const stlBlock = extractMatchBlock('settlements');
  assert.ok(
    !stlBlock.includes('allow update: if isAuthenticated() && isAccountActive();'),
    'Unrestricted update on settlements must be removed'
  );
  assert.match(stlBlock, /allow update: if isAdmin\(\)/);
  assert.match(stlBlock, /CONFIGURE_COMMISSIONS_PAYOUTS/);
});

test('Security Rule 7: Unauthorised user cannot change payout status (payouts & payout_ledger are server-write only)', () => {
  const payoutsBlock = extractMatchBlock('payouts');
  assert.match(payoutsBlock, /allow write: if false;/);

  const ledgerBlock = extractMatchBlock('payout_ledger');
  assert.match(ledgerBlock, /allow write: if false;/);

  const errBlock = extractMatchBlock('payout_error_logs');
  assert.match(errBlock, /allow write: if false;/);

  const auditBlock = extractMatchBlock('payout_audit_logs');
  assert.match(auditBlock, /allow write: if false;/);
});

test('Security Rule 8: Wallets, transactions, withdrawals & private QR are server-write only & tenant-isolated', () => {
  const walletsBlock = extractMatchBlock('wallets');
  assert.match(walletsBlock, /allow write: if false;/);
  assert.match(walletsBlock, /isPhlebotomist\(\)/);

  const txBlock = extractMatchBlock('walletTransactions');
  assert.match(txBlock, /allow write: if false;/);

  const wdBlock = extractMatchBlock('withdrawalRequests');
  assert.match(wdBlock, /allow write: if false;/);

  const ppBlock = extractMatchBlock('payoutProfiles');
  assert.match(ppBlock, /allow read, write: if false;/);

  const stlBlock = extractMatchBlock('manualSettlements');
  assert.match(stlBlock, /allow write: if false;/);

  const storageRulesPath = path.resolve(__dirname, '../../../../firebase/storage.rules');
  const storageRules = fs.readFileSync(storageRulesPath, 'utf8');
  assert.match(storageRules, /match \/private-phlebo-qr\/\{phleboId\}\/\{fileName\}[\s\S]*allow read, write: if false;/);
});
