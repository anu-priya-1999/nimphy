import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findLocalPgBin() {
  const candidates = [
    'C:\\Program Files\\PostgreSQL\\18\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    '/usr/lib/postgresql/16/bin',
    '/usr/lib/postgresql/18/bin',
    '/usr/local/opt/postgresql@16/bin',
  ];

  for (const dir of candidates) {
    const initdbExe =
      process.platform === 'win32' ? path.join(dir, 'initdb.exe') : path.join(dir, 'initdb');
    if (fs.existsSync(initdbExe)) {
      return dir;
    }
  }

  // Check PATH
  const check = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['initdb'], {
    encoding: 'utf8',
  });
  if (check.status === 0 && check.stdout.trim()) {
    return path.dirname(check.stdout.trim().split(/\r?\n/)[0]);
  }

  return null;
}

async function runVitest(databaseUrl) {
  return new Promise((resolve) => {
    const vitestMjs = path.resolve(__dirname, '../node_modules/vitest/vitest.mjs');
    const extraArgs = process.argv.slice(2);
    const child = spawn(
      process.execPath,
      [vitestMjs, 'run', '--config', 'vitest.db.config.ts', ...extraArgs],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
      },
    );

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.log(
      `Running database integration tests against DATABASE_URL: ${process.env.DATABASE_URL.replace(/:[^:]+@/, ':[REDACTED]@')}`,
    );
    const exitCode = await runVitest(process.env.DATABASE_URL);
    process.exit(exitCode);
  }

  // Try finding local PostgreSQL tools to start an ephemeral test cluster
  const pgBinDir = findLocalPgBin();
  if (!pgBinDir) {
    console.error(
      'Error: Database tests require a PostgreSQL instance. Set DATABASE_URL or install PostgreSQL locally.',
    );
    process.exit(1);
  }

  const testPort = 5433;
  const tempDbDir = path.join(os.tmpdir(), `nimphy-pg-test-${Date.now()}`);
  const initdbExe = path.join(pgBinDir, process.platform === 'win32' ? 'initdb.exe' : 'initdb');
  const pgCtlExe = path.join(pgBinDir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');

  console.log(`No DATABASE_URL set. Starting ephemeral PostgreSQL instance on port ${testPort}...`);
  console.log(`Data directory: ${tempDbDir}`);

  try {
    // 1. initdb
    const initRes = spawnSync(
      initdbExe,
      ['-D', tempDbDir, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8'],
      { stdio: 'inherit' },
    );
    if (initRes.status !== 0) {
      console.error('Failed to initialize ephemeral database cluster with initdb.');
      process.exit(1);
    }

    // 2. pg_ctl start
    const startRes = spawnSync(pgCtlExe, ['start', '-D', tempDbDir, '-o', `-p ${testPort}`, '-w'], {
      stdio: 'inherit',
    });
    if (startRes.status !== 0) {
      console.error('Failed to start ephemeral database with pg_ctl.');
      process.exit(1);
    }

    const testDbUrl = `postgresql://postgres@127.0.0.1:${testPort}/postgres`;
    console.log(`Ephemeral database started at: ${testDbUrl}`);

    const exitCode = await runVitest(testDbUrl);

    // 3. pg_ctl stop
    console.log('Stopping ephemeral database...');
    spawnSync(pgCtlExe, ['stop', '-D', tempDbDir, '-m', 'fast'], { stdio: 'inherit' });

    // 4. cleanup temp folder
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }

    process.exit(exitCode);
  } catch (err) {
    console.error('Error during ephemeral database lifecycle:', err);
    try {
      spawnSync(pgCtlExe, ['stop', '-D', tempDbDir, '-m', 'fast'], { stdio: 'ignore' });
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

main();
