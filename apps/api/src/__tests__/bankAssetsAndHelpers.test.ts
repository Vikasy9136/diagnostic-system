import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CENTRAL_BANK_REGISTRY,
  filterSupportedBanks,
  getBankBrandMeta,
  resolveBankFromRegistry,
  SUPPORTED_BANKS_DIRECTORY,
} from '@diagnostic/shared';

test('Bank Logo Directory: All authentic bank PNG assets, manifest, and central registry validate cleanly', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const manifestPath = path.join(repoRoot, 'packages/shared/assets/banks/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Missing bank logo manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    assets: Array<{ bankId: string; filename: string; width: number; height: number }>;
  };
  assert.ok(manifest.assets.length >= 35, 'Expected 34 bank PNGs + neutral fallback in manifest.json');

  for (const bank of CENTRAL_BANK_REGISTRY) {
    assert.ok(bank.bankId && bank.officialBankName && bank.logoAsset && bank.logoSource);
    assert.ok(Array.isArray(bank.aliases) && bank.aliases.length > 0);
    assert.ok(Array.isArray(bank.ifscPrefixes) && bank.ifscPrefixes.length > 0);
    assert.equal(bank.activeStatus, true);

    const meta = getBankBrandMeta(bank.bankId);
    const fullPath = path.join(repoRoot, meta.logoAssetPath);
    assert.ok(fs.existsSync(fullPath), `Missing bank logo PNG at ${fullPath}`);
    const buf = fs.readFileSync(fullPath);
    assert.equal(buf.toString('hex', 0, 8), '89504e470d0a1a0a', `Invalid PNG header for ${fullPath}`);
    assert.ok(buf.readUInt32BE(16) >= 16 && buf.readUInt32BE(20) >= 16);
  }

  for (const bank of SUPPORTED_BANKS_DIRECTORY) {
    const resolved = resolveBankFromRegistry({ bankCode: bank.code });
    assert.ok(resolved, `Expected registry match for ${bank.code}`);
  }

  // Required key banks check
  for (const code of ['SBIN', 'HDFC', 'ICIC', 'UTIB', 'KKBK', 'PUNB', 'BARB', 'CNRB', 'UBIN', 'PSIB']) {
    const meta = getBankBrandMeta(code);
    assert.equal(meta.isFallback, false, `Expected non-fallback logo for ${code}`);
  }

  // Alias search checks
  const bob = filterSupportedBanks('bob');
  assert.ok(bob.all.some((b) => b.code === 'BARB'), 'Alias "bob" should match Bank of Baroda');

  const sbi = filterSupportedBanks('state bank');
  assert.ok(sbi.popular.some((b) => b.code === 'SBIN'), 'Alias "state bank" should match SBI');

  // Unknown bank falls back to neutral other-banks.png
  const fallback = getBankBrandMeta('ZZZZ0000123');
  assert.equal(fallback.isFallback, true);
  assert.equal(fallback.logoAsset, 'other-banks.png');
  assert.ok(fs.existsSync(path.join(repoRoot, fallback.logoAssetPath)));
});
