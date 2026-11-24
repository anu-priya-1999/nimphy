import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const pg = require(path.resolve(__dirname, '../packages/persistence/node_modules/pg'));
const { Pool } = pg;

function sanitizeErrorMessage(message) {
  return message
    .replace(/postgres(ql)?:\/\/[^:]+:([^@]+)@/gi, 'postgresql://[REDACTED]:[REDACTED]@')
    .replace(
      /(password\s*=\s*)(?:(")(?:[^"\\]|\\.)*(")|(')(?:[^'\\]|\\.)*(')|([^\s;,]+))/gi,
      (_match, p1, q1_open, _q1_close, q2_open) => {
        const quote = q1_open || q2_open || '';
        return `${p1}${quote}[REDACTED]${quote}`;
      },
    )
    .replace(
      /(["']password["']\s*:\s*)(?:(["'])((?:(?!\2)[^\\]|\\.)*)\2|([^\s,}]+))/gi,
      (_match, p1, q_open) => {
        const quote = q_open || '';
        return `${p1}${quote}[REDACTED]${quote}`;
      },
    );
}

export async function bootstrap(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    // 1. Ensure baseline functional roles and default service logins exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_migrator') THEN
          CREATE ROLE nimphy_migrator WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_app') THEN
          CREATE ROLE nimphy_app WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_purge') THEN
          CREATE ROLE nimphy_purge WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;

        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_migrator_login') THEN
          CREATE ROLE nimphy_migrator_login WITH LOGIN PASSWORD 'migrator_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_app_login') THEN
          CREATE ROLE nimphy_app_login WITH LOGIN PASSWORD 'app_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_purge_login') THEN
          CREATE ROLE nimphy_purge_login WITH LOGIN PASSWORD 'purge_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        END IF;

        GRANT nimphy_migrator TO nimphy_migrator_login WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_app TO nimphy_app_login WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_purge TO nimphy_purge_login WITH INHERIT FALSE, SET TRUE;
      END $$;
    `);

    // 2. Setup schema public and database permissions
    await client.query(`
      ALTER SCHEMA public OWNER TO nimphy_migrator;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT ALL ON SCHEMA public TO nimphy_migrator;
      DO $$
      BEGIN
        EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO nimphy_migrator', current_database());
      END $$;
    `);

    // 3. Grant nimphy_migrator to CURRENT_USER with INHERIT FALSE, SET TRUE so administrative deployer/runner can execute SET ROLE nimphy_migrator
    await client.query(`
      DO $$
      BEGIN
        GRANT nimphy_migrator TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_app TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_purge TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
      END $$;
    `);

    console.log('Database bootstrap completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

async function runCli() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required to run bootstrap.');
    process.exit(1);
  }

  try {
    await bootstrap(databaseUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Bootstrap failed:', sanitizeErrorMessage(msg));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
