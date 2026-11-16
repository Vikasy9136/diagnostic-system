import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const RUN_ALL_PORTALS = process.argv.includes('--all');

const API_PORT = Number(process.env.PORT || 5000);
const PORTAL_PORT = Number(process.env.PORTAL_PORT || 3003);

function colorize(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port);
  });
}

function runNpmSync(args, label) {
  console.log(colorize('36', `[SETUP] ${label}...`));
  const result = IS_WIN
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      })
    : spawnSync('npm', args, {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function prefixStream(stream, prefix, isErr = false) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const out = `${prefix} ${line}\n`;
      if (isErr) process.stderr.write(out);
      else process.stdout.write(out);
    }
  });
  stream.on('end', () => {
    if (buffer.trim()) {
      const out = `${prefix} ${buffer}\n`;
      if (isErr) process.stderr.write(out);
      else process.stdout.write(out);
    }
  });
}

function killProcessTree(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) return Promise.resolve();
  if (IS_WIN && proc.pid) {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
  }
  try {
    proc.kill('SIGTERM');
  } catch {
    // ignore
  }
  return Promise.resolve();
}

async function assertPortsFree(checks) {
  const busy = [];
  for (const item of checks) {
    const ok = await isPortAvailable(item.port);
    if (!ok) busy.push(item);
  }
  if (busy.length > 0) {
    console.error('');
    console.error(colorize('31', '[RUNNER] Cannot start because required port(s) are already in use:'));
    for (const item of busy) {
      console.error(`  - Port ${item.port} (${item.name})`);
    }
    console.error(
      'Stop any earlier `dev:api`, `dev:portal`, or Vite/API terminals (Ctrl+C) and run `npm run dev` again.'
    );
    console.error('');
    process.exit(1);
  }
}

async function main() {
  const portChecks = [
    { name: 'Backend API', port: API_PORT },
    { name: 'Unified Portal', port: PORTAL_PORT },
  ];
  if (RUN_ALL_PORTALS) {
    portChecks.push(
      { name: 'Small Lab Portal', port: 3000 },
      { name: 'Large Lab Portal', port: 3001 },
      { name: 'Admin Portal', port: 3002 }
    );
  }
  await assertPortsFree(portChecks);

  // Ensure shared package types/dist are fresh before launching dev servers
  runNpmSync(['run', 'build:shared'], 'Building @diagnostic/shared');

  const childEnv = {
    ...process.env,
    PORT: String(API_PORT),
    PORTAL_PORT: String(PORTAL_PORT),
    VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}`,
    VITE_API_URL: `http://localhost:${API_PORT}/api/v1`,
  };

  const services = [
    {
      name: 'API',
      badge: colorize('35', `[API :${API_PORT}]`),
      args: ['--workspace=@diagnostic/api', 'run', 'dev'],
    },
    {
      name: 'PORTAL',
      badge: colorize('32', `[PORTAL :${PORTAL_PORT}]`),
      args: ['--workspace=@diagnostic/portal', 'run', 'dev'],
    },
  ];

  if (RUN_ALL_PORTALS) {
    services.push(
      {
        name: 'SMALL-LAB',
        badge: colorize('34', '[SMALL-LAB :3000]'),
        args: ['--workspace=@diagnostic/small-lab', 'run', 'dev'],
      },
      {
        name: 'LARGE-LAB',
        badge: colorize('36', '[LARGE-LAB :3001]'),
        args: ['--workspace=@diagnostic/large-lab', 'run', 'dev'],
      },
      {
        name: 'ADMIN',
        badge: colorize('33', '[ADMIN :3002]'),
        args: ['--workspace=@diagnostic/admin', 'run', 'dev'],
      }
    );
  }

  console.log('');
  console.log(colorize('36', '============================================================'));
  console.log(colorize('1', '  LabSetu Diagnostics — Unified Full-Stack Dev Runner'));
  console.log(`  Unified Portal:  https://localhost:${PORTAL_PORT}  (Landing + All Roles, HTTPS SSL)`);
  console.log(`  Backend API:     http://localhost:${API_PORT}/api/v1`);
  if (RUN_ALL_PORTALS) {
    console.log('  Standalone Labs: http://localhost:3000 | :3001 | :3002');
  }
  console.log('  Press Ctrl+C to stop all services cleanly.');
  console.log(colorize('36', '============================================================'));
  console.log('');

  const children = [];
  let shuttingDown = false;

  async function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${colorize('33', '[RUNNER]')} Shutting down services cleanly...`);
    await Promise.all(children.map((c) => killProcessTree(c.proc)));
    process.exit(code);
  }

  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));

  for (const svc of services) {
    const proc = IS_WIN
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm', ...svc.args], {
          cwd: ROOT_DIR,
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn('npm', svc.args, {
          cwd: ROOT_DIR,
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
    children.push({ name: svc.name, proc });
    prefixStream(proc.stdout, svc.badge, false);
    prefixStream(proc.stderr, svc.badge, true);

    proc.on('exit', (code) => {
      if (!shuttingDown) {
        console.error(
          `${svc.badge} Exited unexpectedly with code ${code ?? 'null'}. Stopping remaining services.`
        );
        void shutdown(code && code !== 0 ? code : 1);
      }
    });
  }
}

main().catch((err) => {
  console.error('[RUNNER] Startup error:', err);
  process.exit(1);
});
