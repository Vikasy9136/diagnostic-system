import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  filterSupportedBanks,
  getBankBrandMeta,
  SUPPORTED_BANKS_DIRECTORY,
} from '@diagnostic/shared';

test('Bank Logo Directory: All bank logo SVG assets exist and alias/IFSC search works', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');

  for (const bank of SUPPORTED_BANKS_DIRECTORY) {
    const meta = getBankBrandMeta(bank.code);
    const fullPath = path.join(repoRoot, meta.logoAssetPath);
    assert.ok(fs.existsSync(fullPath), `Missing bank logo SVG at ${fullPath}`);
  }

  // Alias search checks
  const bob = filterSupportedBanks('bob');
  assert.ok(bob.all.some((b) => b.code === 'BARB'), 'Alias "bob" should match Bank of Baroda');

  const sbi = filterSupportedBanks('state bank');
  assert.ok(sbi.popular.some((b) => b.code === 'SBIN'), 'Alias "state bank" should match SBI');

  // Unknown bank falls back to neutral other-banks/logo.svg
  const fallback = getBankBrandMeta('ZZZZ0000123');
  assert.equal(fallback.logoFolder, 'other-banks');
  assert.ok(fs.existsSync(path.join(repoRoot, fallback.logoAssetPath)));
});
