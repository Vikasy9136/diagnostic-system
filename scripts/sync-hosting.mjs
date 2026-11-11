import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SOURCE_DIR = path.join(ROOT_DIR, 'apps', 'web', 'portal', 'dist');
const TARGET_DIR = path.join(ROOT_DIR, 'firebase', 'hosting-dist');

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`Missing built web bundle at ${SOURCE_DIR}. Run "npm --workspace=@diagnostic/portal run build" first.`);
  process.exit(1);
}

fs.rmSync(TARGET_DIR, { recursive: true, force: true });
fs.cpSync(SOURCE_DIR, TARGET_DIR, { recursive: true });
console.log(`Synced Hosting bundle: ${SOURCE_DIR} -> ${TARGET_DIR}`);

