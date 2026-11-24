import path from 'path';
import { createDatabasePool, sanitizeErrorMessage } from '../db/pool';
import { runMigrations } from './runner';

export async function runCli(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required to run migrations.');
    process.exit(1);
  }

  const pool = createDatabasePool({ connectionString: databaseUrl });
  const migrationsDir = path.resolve(__dirname, '../../migrations');

  console.log(`Starting database migrations from: ${migrationsDir}`);
  try {
    const report = await runMigrations(pool, { migrationsDir });
    console.log(
      `Migration run completed successfully. Applied: ${report.appliedCount}, Skipped: ${report.skippedCount}, Total: ${report.totalMigrations}`,
    );
    for (const m of report.migrations) {
      console.log(
        ` - [${m.status.toUpperCase()}] ${m.version}: ${m.name} (${m.checksum.slice(0, 10)}...)`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Migration execution failed:`, sanitizeErrorMessage(msg));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (
  require.main === module ||
  process.argv[1]?.endsWith('cli.ts') ||
  process.argv[1]?.endsWith('cli.js')
) {
  runCli();
}
