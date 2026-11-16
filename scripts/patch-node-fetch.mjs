import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_FILES = [
  path.join(ROOT_DIR, 'node_modules', 'node-fetch', 'lib', 'index.js'),
  path.join(ROOT_DIR, 'node_modules', 'node-fetch', 'lib', 'index.mjs'),
  path.join(ROOT_DIR, 'node_modules', 'node-fetch', 'lib', 'index.es.js'),
  path.join(ROOT_DIR, 'firebase', 'functions', 'node_modules', 'node-fetch', 'lib', 'index.js'),
  path.join(ROOT_DIR, 'firebase', 'functions', 'node_modules', 'node-fetch', 'lib', 'index.mjs'),
  path.join(ROOT_DIR, 'firebase', 'functions', 'node_modules', 'node-fetch', 'lib', 'index.es.js'),
];

const OLD_SNIPPET = 'if (hasDataListener && !hadError) {';
const NEW_SNIPPET = 'if (hasDataListener && !hadError && !response.complete) {';

let patchedCount = 0;

for (const filePath of TARGET_FILES) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(OLD_SNIPPET)) continue;
  const updated = content.replaceAll(OLD_SNIPPET, NEW_SNIPPET);
  if (updated !== content) {
    fs.writeFileSync(filePath, updated, 'utf8');
    patchedCount += 1;
  }
}

if (patchedCount > 0) {
  console.log(`[postinstall] Patched node-fetch Node 20+/24 keep-alive check in ${patchedCount} file(s).`);
}

