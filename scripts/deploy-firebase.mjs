import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';

function run(command, args, extraEnv = {}) {
  const result = IS_WIN
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: ROOT_DIR,
        env: { ...process.env, ...extraEnv },
        stdio: 'inherit',
      })
    : spawnSync(command, args, {
        cwd: ROOT_DIR,
        env: { ...process.env, ...extraEnv },
        stdio: 'inherit',
      });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('node', ['scripts/sync-hosting.mjs']);
run(
  'firebase',
  [
    'deploy',
    '--only',
    'firestore,storage,hosting,functions',
    '--project',
    'labsetu-diagnostics',
    '--config',
    'firebase/firebase.json',
    '--force',
  ],
  { FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '60' }
);
