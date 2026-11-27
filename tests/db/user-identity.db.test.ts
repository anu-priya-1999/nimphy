import crypto from 'crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapDatabase,
  createDatabasePool,
  findOrCreateUserByIdpSubject,
  findUserByIdpSubject,
  runMigrations,
} from '../../packages/persistence/src/index';
import {
  createManagedTestPool,
  dropDatabaseCleanly,
  getBaseDatabaseUrl,
  MIGRATIONS_DIR,
  type ManagedTestPool,
} from './test-helper';

describe('Database Identity Mapping — app_users Repository under nimphy_app (STEP-011)', () => {
  const baseDbUrl = getBaseDatabaseUrl();
  const suffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const testDbName = `nimphy_test_identity_${suffix}`.slice(0, 63);
  const appUsername = `nimphy_identity_app_${suffix}`.slice(0, 63);
  const appPassword = 'test_identity_app_secret_password';

  let adminPool: Pool;
  let appManaged: ManagedTestPool;
  let appPool: Pool;
  let unactivatedManaged: ManagedTestPool;
  let unactivatedPool: Pool;
  let wrongRoleManaged: ManagedTestPool;
  let wrongRolePool: Pool;

  beforeAll(async () => {
    const adminUrl = new URL(baseDbUrl);
    adminUrl.pathname = '/postgres';
    adminPool = new Pool({ connectionString: adminUrl.toString() });

    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`CREATE DATABASE "${testDbName}";`);
      await adminClient.query(`
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

      // Non-superuser application login with INHERIT FALSE and SET TRUE for nimphy_app
      await adminClient.query(`
        CREATE ROLE "${appUsername}" WITH LOGIN PASSWORD '${appPassword}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;
      `);
    } finally {
      adminClient.release();
    }

    // Bootstrap and migrate target test database using admin connection
    const targetDbAdminUrl = new URL(baseDbUrl);
    targetDbAdminUrl.pathname = `/${testDbName}`;
    const targetAdminPool = createDatabasePool({ connectionString: targetDbAdminUrl.toString() });
    const targetAdminClient = await targetAdminPool.connect();
    try {
      await bootstrapDatabase(targetAdminClient, {
        dbName: testDbName,
        grantToCurrentUser: true,
        allowedMembers: {
          nimphy_migrator: ['nimphy_migrator_login'],
          nimphy_app: ['nimphy_app_login', appUsername],
          nimphy_purge: ['nimphy_purge_login'],
        },
      });
      await targetAdminClient.query(
        `GRANT CONNECT ON DATABASE "${testDbName}" TO "${appUsername}";`,
      );
    } finally {
      targetAdminClient.release();
    }

    try {
      await runMigrations(targetAdminPool, { migrationsDir: MIGRATIONS_DIR });
    } finally {
      await targetAdminPool.end();
    }

    const appUrlObj = new URL(targetDbAdminUrl.toString());
    appUrlObj.username = appUsername;
    appUrlObj.password = appPassword;
    const appDbUrl = appUrlObj.toString();

    // Production-equivalent web pool: non-superuser login activating nimphy_app
    appManaged = createManagedTestPool({ connectionString: appDbUrl, role: 'nimphy_app' });
    appPool = appManaged.pool;

    // Unactivated pool using the exact same login without SET ROLE nimphy_app
    unactivatedManaged = createManagedTestPool({ connectionString: appDbUrl });
    unactivatedPool = unactivatedManaged.pool;

    // Misconfigured pool requesting an unauthorized role
    wrongRoleManaged = createManagedTestPool({
      connectionString: appDbUrl,
      role: 'nimphy_migrator',
    });
    wrongRolePool = wrongRoleManaged.pool;
  });

  afterAll(async () => {
    const teardownErrors: unknown[] = [];
    const managedPools = [appManaged, unactivatedManaged, wrongRoleManaged];

    for (const managed of managedPools) {
      if (managed) {
        try {
          await managed.close();
        } catch (err) {
          teardownErrors.push(err);
        }
      }
    }

    for (const managed of managedPools) {
      if (managed) {
        try {
          managed.assertZeroErrors();
        } catch (err) {
          teardownErrors.push(err);
        }
      }
    }

    if (adminPool) {
      let adminClient: PoolClient | null = null;
      try {
        adminClient = await adminPool.connect();
        try {
          await dropDatabaseCleanly(adminClient, testDbName);
        } catch (err) {
          teardownErrors.push(err);
        }
        try {
          await adminClient.query(`DROP ROLE IF EXISTS "${appUsername}";`);
        } catch (err) {
          teardownErrors.push(err);
        }
      } catch (err) {
        teardownErrors.push(err);
      } finally {
        if (adminClient) {
          try {
            adminClient.release();
          } catch (err) {
            teardownErrors.push(err);
          }
        }
        try {
          await adminPool.end();
        } catch (err) {
          teardownErrors.push(err);
        }
      }
    }

    if (teardownErrors.length > 0) {
      if (teardownErrors.length === 1) {
        throw teardownErrors[0];
      }
      throw new Error(
        teardownErrors.map((e) => (e instanceof Error ? e.message : String(e))).join('; '),
      );
    }
  });

  it('activates nimphy_app on pooled connections without admin privileges and prevents role-state leakage', async () => {
    // 1. Login identity has no administrative privileges
    const roleCheck = await appPool.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      current_user: string;
      session_user: string;
    }>(
      `SELECT r.rolsuper, r.rolcreaterole, r.rolcreatedb, current_user, session_user
       FROM pg_roles r
       WHERE r.rolname = $1`,
      [appUsername],
    );

    expect(roleCheck.rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      current_user: 'nimphy_app',
      session_user: appUsername,
    });

    // 2. Even if a checked-out client resets its role, the next pool acquisition re-activates nimphy_app
    const client = await appPool.connect();
    try {
      const beforeReset = await client.query<{ current_user: string }>('SELECT current_user;');
      expect(beforeReset.rows[0]?.current_user).toBe('nimphy_app');
      await client.query('RESET ROLE;');
      const afterReset = await client.query<{ current_user: string }>('SELECT current_user;');
      expect(afterReset.rows[0]?.current_user).toBe(appUsername);
    } finally {
      client.release();
    }

    const reacquired = await appPool.query<{ current_user: string }>('SELECT current_user;');
    expect(reacquired.rows[0]?.current_user).toBe('nimphy_app');
  });

  it('denies app_users operations without nimphy_app role activation and fails closed on invalid role activation', async () => {
    const rawUser = await unactivatedPool.query<{ current_user: string }>('SELECT current_user;');
    expect(rawUser.rows[0]?.current_user).toBe(appUsername);

    await expect(findUserByIdpSubject(unactivatedPool, 'user_clerk_db_1')).rejects.toThrowError(
      /permission denied for table app_users/i,
    );

    await expect(
      findOrCreateUserByIdpSubject(unactivatedPool, {
        idpSubject: 'user_clerk_denied',
        email: 'denied@example.com',
      }),
    ).rejects.toThrowError(/permission denied for table app_users/i);

    // Wrong role fails at connection initialization before any query executes
    await expect(wrongRolePool.query('SELECT 1;')).rejects.toThrowError(
      /permission denied to set role/i,
    );
    await expect(wrongRolePool.connect()).rejects.toThrowError(/permission denied to set role/i);
  });

  it('provisions a new active user on first sign-in and resolves the same UserId thereafter under nimphy_app', async () => {
    const first = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_db_1',
      email: 'Author@Example.com',
    });

    expect(first.created).toBe(true);
    expect(first.user.status).toBe('active');
    expect(first.user.email).toBe('author@example.com');
    expect(first.user.idpSubject).toBe('user_clerk_db_1');

    const second = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_db_1',
      email: 'Author@Example.com',
    });
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);

    const lookedUp = await findUserByIdpSubject(appPool, 'user_clerk_db_1');
    expect(lookedUp?.id).toBe(first.user.id);
  });

  it('handles concurrent first-time provisioning for the same Clerk subject safely under nimphy_app', async () => {
    const [resA, resB] = await Promise.all([
      findOrCreateUserByIdpSubject(appPool, {
        idpSubject: 'user_clerk_race_1',
        email: 'race@example.com',
      }),
      findOrCreateUserByIdpSubject(appPool, {
        idpSubject: 'user_clerk_race_1',
        email: 'race@example.com',
      }),
    ]);

    expect(resA.user.id).toBe(resB.user.id);
    expect([resA.created, resB.created].filter(Boolean)).toHaveLength(1);

    const countRes = await appPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM app_users WHERE idp_subject = $1`,
      ['user_clerk_race_1'],
    );
    expect(countRes.rows[0]?.count).toBe('1');
  });

  it('never merges accounts with the same email across different Clerk subjects under nimphy_app', async () => {
    const user1 = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_email_1',
      email: 'duplicate@example.com',
    });
    const user2 = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_email_2',
      email: 'duplicate@example.com',
    });

    expect(user1.user.id).not.toBe(user2.user.id);
  });

  it('never reactivates pending_deletion or resurrects tombstoned accounts under nimphy_app', async () => {
    const pending = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_pending',
      email: 'pending@example.com',
    });
    await appPool.query(
      `UPDATE app_users SET status = 'pending_deletion', deletion_requested_at = now() WHERE id = $1`,
      [pending.user.id],
    );

    const retryPending = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_pending',
      email: 'pending@example.com',
    });
    expect(retryPending.created).toBe(false);
    expect(retryPending.user.status).toBe('pending_deletion');

    // Simulate tombstoned account (deleted: idp_subject = NULL, email = NULL, deleted_at NOT NULL)
    const deletedSeed = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_to_tombstone',
      email: 'tombstone@example.com',
    });
    await appPool.query(
      `UPDATE app_users
       SET status = 'deleted', idp_subject = NULL, email = NULL, deleted_at = now()
       WHERE id = $1`,
      [deletedSeed.user.id],
    );

    // A new Clerk user with the same email gets a fresh row, never resurrecting the tombstone
    const freshAfterTombstone = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'user_clerk_after_tombstone',
      email: 'tombstone@example.com',
    });
    expect(freshAfterTombstone.created).toBe(true);
    expect(freshAfterTombstone.user.id).not.toBe(deletedSeed.user.id);
  });
});
