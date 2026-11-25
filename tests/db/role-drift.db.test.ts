import crypto from 'crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapDatabase } from '../../packages/persistence/src/index';
import { dropDatabaseCleanly, getBaseDatabaseUrl } from './test-helper';

describe('Database Foundation — Bootstrap Role Drift & Membership Security Audit', () => {
  const baseDbUrl = getBaseDatabaseUrl();
  const testDbName = `nimphy_test_roledrift_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  let adminPool: Pool;
  let targetAdminPool: Pool;

  const migratorUsername = 'nimphy_migrator_login';
  const appUsername = 'nimphy_app_login';
  const purgeUsername = 'nimphy_purge_login';

  beforeAll(async () => {
    // 1. Administrative setup on default 'postgres' database
    const adminUrl = new URL(baseDbUrl);
    adminUrl.pathname = '/postgres';
    adminPool = new Pool({ connectionString: adminUrl.toString() });

    const adminClient = await adminPool.connect();
    try {
      // Create isolated test database
      await adminClient.query(`CREATE DATABASE "${testDbName}";`);

      // Ensure standard functional roles exist with secure attributes
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
        END $$;
      `);

      // Ensure designated login roles exist
      await adminClient.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${migratorUsername}') THEN
            CREATE ROLE "${migratorUsername}" WITH LOGIN PASSWORD 'migrator_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${appUsername}') THEN
            CREATE ROLE "${appUsername}" WITH LOGIN PASSWORD 'app_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${purgeUsername}') THEN
            CREATE ROLE "${purgeUsername}" WITH LOGIN PASSWORD 'purge_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;
        END $$;
      `);

      // Assign controlled memberships
      await adminClient.query(`
        GRANT nimphy_migrator TO "${migratorUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_purge TO "${purgeUsername}" WITH INHERIT FALSE, SET TRUE;
      `);
    } finally {
      adminClient.release();
    }

    // 2. Pool to target database
    const targetDbAdminUrl = new URL(baseDbUrl);
    targetDbAdminUrl.pathname = `/${testDbName}`;
    targetAdminPool = new Pool({ connectionString: targetDbAdminUrl.toString() });
  });

  afterEach(async () => {
    // Reset functional roles and service logins to secure attributes and baseline memberships
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`
        ALTER ROLE nimphy_migrator WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        ALTER ROLE nimphy_app WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        ALTER ROLE nimphy_purge WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;

        ALTER ROLE "${migratorUsername}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        ALTER ROLE "${appUsername}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        ALTER ROLE "${purgeUsername}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;

        GRANT nimphy_migrator TO "${migratorUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_purge TO "${purgeUsername}" WITH INHERIT FALSE, SET TRUE;
      `);
    } finally {
      adminClient.release();
    }
  });

  afterAll(async () => {
    const teardownErrors: unknown[] = [];
    if (targetAdminPool) {
      try {
        await targetAdminPool.end();
      } catch (err) {
        teardownErrors.push(err);
      }
    }

    if (adminPool) {
      let adminClient = null;
      try {
        adminClient = await adminPool.connect();
        try {
          await dropDatabaseCleanly(adminClient, testDbName);
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
      const msgs = teardownErrors
        .map((e) => (e instanceof Error ? e.message : String(e)))
        .join('; ');
      throw new Error(`Role-drift teardown failed with ${teardownErrors.length} error(s): ${msgs}`);
    }
  });

  it('rejects pre-existing nimphy_migrator with LOGIN in fail-closed mode', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query('ALTER ROLE nimphy_migrator WITH LOGIN;');

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(
          bootstrapDatabase(targetClient, { dbName: testDbName, onRoleDrift: 'fail_closed' }),
        ).rejects.toThrow(
          /functional role "nimphy_migrator" has unexpected insecure attribute\(s\):.*LOGIN/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      adminClient.release();
    }
  });

  it('rejects pre-existing nimphy_migrator with SUPERUSER in fail-closed mode', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query('ALTER ROLE nimphy_migrator WITH SUPERUSER;');

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(
          bootstrapDatabase(targetClient, { dbName: testDbName, onRoleDrift: 'fail_closed' }),
        ).rejects.toThrow(
          /functional role "nimphy_migrator" has unexpected insecure attribute\(s\):.*SUPERUSER/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      adminClient.release();
    }
  });

  it('rejects pre-existing nimphy_app with CREATEROLE in fail-closed mode', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query('ALTER ROLE nimphy_app WITH CREATEROLE;');

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(
          bootstrapDatabase(targetClient, { dbName: testDbName, onRoleDrift: 'fail_closed' }),
        ).rejects.toThrow(
          /functional role "nimphy_app" has unexpected insecure attribute\(s\):.*CREATEROLE/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      adminClient.release();
    }
  });

  it('rejects pre-existing nimphy_purge with BYPASSRLS in fail-closed mode', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query('ALTER ROLE nimphy_purge WITH BYPASSRLS;');

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(
          bootstrapDatabase(targetClient, { dbName: testDbName, onRoleDrift: 'fail_closed' }),
        ).rejects.toThrow(
          /functional role "nimphy_purge" has unexpected insecure attribute\(s\):.*BYPASSRLS/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      adminClient.release();
    }
  });

  it('safely normalizes pre-existing insecure attributes when onRoleDrift is "normalize"', async () => {
    const adminClient = await adminPool.connect();
    try {
      // Deliberately set multiple insecure attributes across all three roles
      await adminClient.query(`
        ALTER ROLE nimphy_migrator WITH LOGIN;
        ALTER ROLE nimphy_app WITH CREATEROLE;
        ALTER ROLE nimphy_purge WITH BYPASSRLS;
      `);

      const targetClient = await targetAdminPool.connect();
      try {
        // Run bootstrap with explicit normalization policy
        await expect(
          bootstrapDatabase(targetClient, { dbName: testDbName, onRoleDrift: 'normalize' }),
        ).resolves.not.toThrow();

        // Verify that all roles have been restored to exact secure attributes in pg_roles
        const rolesRes = await targetClient.query<{
          rolname: string;
          rolcanlogin: boolean;
          rolsuper: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
          rolbypassrls: boolean;
          rolreplication: boolean;
        }>(`
          SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
          FROM pg_roles
          WHERE rolname IN ('nimphy_migrator', 'nimphy_app', 'nimphy_purge')
          ORDER BY rolname;
        `);

        expect(rolesRes.rows).toHaveLength(3);
        for (const role of rolesRes.rows) {
          expect(role.rolcanlogin).toBe(false);
          expect(role.rolsuper).toBe(false);
          expect(role.rolcreatedb).toBe(false);
          expect(role.rolcreaterole).toBe(false);
          expect(role.rolbypassrls).toBe(false);
          expect(role.rolreplication).toBe(false);
        }
      } finally {
        targetClient.release();
      }
    } finally {
      adminClient.release();
    }
  });

  it('rejects functional role inheriting unexpected privileged parent role (Direction 1)', async () => {
    const adminClient = await adminPool.connect();
    const parentRole = `test_privileged_parent_${Date.now()}`;
    try {
      await adminClient.query(`CREATE ROLE "${parentRole}";`);
      await adminClient.query(`GRANT "${parentRole}" TO nimphy_migrator;`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `functional role "nimphy_migrator" inherits unexpected parent role "${parentRole}"`,
          ),
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE "${parentRole}" FROM nimphy_migrator;`);
      await adminClient.query(`DROP ROLE IF EXISTS "${parentRole}";`);
      adminClient.release();
    }
  });

  it('rejects unauthorized principal assuming functional role (Direction 2)', async () => {
    const adminClient = await adminPool.connect();
    const intruder = `test_unauthorized_intruder_${Date.now()}`;
    try {
      await adminClient.query(`CREATE ROLE "${intruder}" WITH LOGIN PASSWORD 'pwd';`);
      await adminClient.query(`GRANT nimphy_app TO "${intruder}" WITH INHERIT FALSE, SET TRUE;`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `functional role "nimphy_app" has unauthorized member principal "${intruder}"`,
          ),
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE nimphy_app FROM "${intruder}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${intruder}";`);
      adminClient.release();
    }
  });

  it('rejects member granted admin_option = true on functional role', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`GRANT nimphy_migrator TO "${migratorUsername}" WITH ADMIN OPTION;`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /has admin_option = true \(role administration must not be delegated\)/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(
        `REVOKE ADMIN OPTION FOR nimphy_migrator FROM "${migratorUsername}";`,
      );
      adminClient.release();
    }
  });

  it('rejects member granted inherit_option = true in PG 16+', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`GRANT nimphy_app TO "${appUsername}" WITH INHERIT TRUE;`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /has inherit_option = true \(expected INHERIT FALSE\)/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;`);
      adminClient.release();
    }
  });

  it('succeeds and is idempotent on rerun with correctly provisioned roles', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      // First execution
      await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).resolves.not.toThrow();

      // Second execution: must succeed cleanly without error
      await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).resolves.not.toThrow();
    } finally {
      targetClient.release();
    }
  });

  it('verifies final pg_roles attributes and pg_auth_members membership graph', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      await bootstrapDatabase(targetClient, { dbName: testDbName });

      // 1. Verify pg_roles attributes
      const rolesRes = await targetClient.query<{
        rolname: string;
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolbypassrls: boolean;
        rolreplication: boolean;
      }>(`
        SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
        FROM pg_roles
        WHERE rolname IN ('nimphy_migrator', 'nimphy_app', 'nimphy_purge')
        ORDER BY rolname;
      `);

      expect(rolesRes.rows).toEqual([
        {
          rolname: 'nimphy_app',
          rolcanlogin: false,
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolbypassrls: false,
          rolreplication: false,
        },
        {
          rolname: 'nimphy_migrator',
          rolcanlogin: false,
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolbypassrls: false,
          rolreplication: false,
        },
        {
          rolname: 'nimphy_purge',
          rolcanlogin: false,
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolbypassrls: false,
          rolreplication: false,
        },
      ]);

      // 2. Verify pg_auth_members membership graph
      const membersRes = await targetClient.query<{
        functional_role: string;
        member_name: string;
        admin_option: boolean;
        inherit_option: boolean;
        set_option: boolean;
      }>(`
        SELECT
          r.rolname AS functional_role,
          m.rolname AS member_name,
          pam.admin_option,
          pam.inherit_option,
          pam.set_option
        FROM pg_auth_members pam
        JOIN pg_roles r ON r.oid = pam.roleid
        JOIN pg_roles m ON m.oid = pam.member
        WHERE r.rolname IN ('nimphy_migrator', 'nimphy_app', 'nimphy_purge')
        ORDER BY r.rolname, m.rolname;
      `);

      // Filter to the designated service logins
      const serviceMembers = membersRes.rows.filter((row) =>
        ['nimphy_migrator_login', 'nimphy_app_login', 'nimphy_purge_login'].includes(
          row.member_name,
        ),
      );

      expect(serviceMembers).toEqual([
        {
          functional_role: 'nimphy_app',
          member_name: 'nimphy_app_login',
          admin_option: false,
          inherit_option: false,
          set_option: true,
        },
        {
          functional_role: 'nimphy_migrator',
          member_name: 'nimphy_migrator_login',
          admin_option: false,
          inherit_option: false,
          set_option: true,
        },
        {
          functional_role: 'nimphy_purge',
          member_name: 'nimphy_purge_login',
          admin_option: false,
          inherit_option: false,
          set_option: true,
        },
      ]);
    } finally {
      targetClient.release();
    }
  });

  it('does not modify or inspect unrelated database roles', async () => {
    const adminClient = await adminPool.connect();
    const unrelatedRole = `test_unrelated_service_${Date.now()}`;
    try {
      // Create an unrelated role with custom attributes (LOGIN, CREATEDB)
      await adminClient.query(`
        CREATE ROLE "${unrelatedRole}" WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
      `);

      const targetClient = await targetAdminPool.connect();
      try {
        // Run bootstrap
        await expect(
          bootstrapDatabase(targetClient, { dbName: testDbName }),
        ).resolves.not.toThrow();

        // Verify that unrelated role's attributes are completely untouched
        const unrelRes = await targetClient.query<{
          rolname: string;
          rolcanlogin: boolean;
          rolcreatedb: boolean;
        }>(`
          SELECT rolname, rolcanlogin, rolcreatedb
          FROM pg_roles
          WHERE rolname = '${unrelatedRole}';
        `);

        expect(unrelRes.rows[0]?.rolcanlogin).toBe(true);
        expect(unrelRes.rows[0]?.rolcreatedb).toBe(true);
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`DROP ROLE IF EXISTS "${unrelatedRole}";`);
      adminClient.release();
    }
  });

  it('rejects nimphy_app_login granted an unrelated role with INHERIT TRUE', async () => {
    const adminClient = await adminPool.connect();
    const unrelatedRole = `test_unrelated_role_inherit_${Date.now()}`;
    try {
      await adminClient.query(`CREATE ROLE "${unrelatedRole}";`);
      await adminClient.query(`GRANT "${unrelatedRole}" TO "${appUsername}" WITH INHERIT TRUE;`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `service login "${appUsername}" has unexpected direct role membership: "${unrelatedRole}"`,
          ),
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE "${unrelatedRole}" FROM "${appUsername}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${unrelatedRole}";`);
      adminClient.release();
    }
  });

  it('rejects nimphy_app_login granted an unrelated role with SET TRUE', async () => {
    const adminClient = await adminPool.connect();
    const unrelatedRole = `test_unrelated_role_set_${Date.now()}`;
    try {
      await adminClient.query(`CREATE ROLE "${unrelatedRole}";`);
      await adminClient.query(
        `GRANT "${unrelatedRole}" TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;`,
      );

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `service login "${appUsername}" has unexpected direct role membership: "${unrelatedRole}"`,
          ),
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE "${unrelatedRole}" FROM "${appUsername}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${unrelatedRole}";`);
      adminClient.release();
    }
  });

  it('rejects an intermediate role providing a transitive membership path to service login', async () => {
    const adminClient = await adminPool.connect();
    const intermediateRole = `test_intermediate_group_${Date.now()}`;
    const targetPrivRole = `test_target_admin_role_${Date.now()}`;
    try {
      await adminClient.query(`CREATE ROLE "${intermediateRole}";`);
      await adminClient.query(`CREATE ROLE "${targetPrivRole}";`);

      // app login -> intermediate role -> target priv role
      await adminClient.query(
        `GRANT "${intermediateRole}" TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;`,
      );
      await adminClient.query(`GRANT "${targetPrivRole}" TO "${intermediateRole}";`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `service login "${appUsername}" has unexpected direct role membership: "${intermediateRole}"`,
          ),
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE "${intermediateRole}" FROM "${appUsername}";`);
      await adminClient.query(`REVOKE "${targetPrivRole}" FROM "${intermediateRole}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${intermediateRole}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${targetPrivRole}";`);
      adminClient.release();
    }
  });

  it('rejects expected functional membership configured with SET FALSE', async () => {
    const adminClient = await adminPool.connect();
    try {
      // Re-grant membership with SET FALSE
      await adminClient.query(`
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET FALSE;
      `);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `membership of "${appUsername}" in functional role "nimphy_app" has set_option = false \\(expected SET TRUE\\)`,
          ),
        );
      } finally {
        targetClient.release();
      }
    } finally {
      // Restore legitimate membership with SET TRUE
      await adminClient.query(`
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;
      `);
      adminClient.release();
    }
  });

  it('rejects service login with CREATEROLE in fail-closed mode', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`ALTER ROLE "${appUsername}" WITH CREATEROLE;`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `service login "${appUsername}" has unexpected administrative attribute\\(s\\):.*CREATEROLE`,
          ),
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`ALTER ROLE "${appUsername}" WITH NOCREATEROLE;`);
      adminClient.release();
    }
  });

  it('rejects service login with CREATEDB, SUPERUSER, or BYPASSRLS in fail-closed mode', async () => {
    const adminClient = await adminPool.connect();
    try {
      // 1. Test CREATEDB on migrator
      await adminClient.query(`ALTER ROLE "${migratorUsername}" WITH CREATEDB;`);
      const targetClient1 = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient1, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `service login "${migratorUsername}" has unexpected administrative attribute\\(s\\):.*CREATEDB`,
          ),
        );
      } finally {
        targetClient1.release();
      }
      await adminClient.query(`ALTER ROLE "${migratorUsername}" WITH NOCREATEDB;`);

      // 2. Test SUPERUSER on purge
      await adminClient.query(`ALTER ROLE "${purgeUsername}" WITH SUPERUSER;`);
      const targetClient2 = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient2, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `service login "${purgeUsername}" has unexpected administrative attribute\\(s\\):.*SUPERUSER`,
          ),
        );
      } finally {
        targetClient2.release();
      }
      await adminClient.query(`ALTER ROLE "${purgeUsername}" WITH NOSUPERUSER;`);

      // 3. Test BYPASSRLS on app
      await adminClient.query(`ALTER ROLE "${appUsername}" WITH BYPASSRLS;`);
      const targetClient3 = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient3, { dbName: testDbName })).rejects.toThrow(
          new RegExp(
            `service login "${appUsername}" has unexpected administrative attribute\\(s\\):.*BYPASSRLS`,
          ),
        );
      } finally {
        targetClient3.release();
      }
      await adminClient.query(`ALTER ROLE "${appUsername}" WITH NOBYPASSRLS;`);
    } finally {
      adminClient.release();
    }
  });

  it('prohibits cross-role assumptions between service logins', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      // Inspect all paths in pg_auth_members for the 3 service logins
      const crossRes = await targetClient.query<{
        login_name: string;
        assumable_functional_role: string;
      }>(`
        SELECT m.rolname AS login_name, r.rolname AS assumable_functional_role
        FROM pg_auth_members pam
        JOIN pg_roles m ON m.oid = pam.member
        JOIN pg_roles r ON r.oid = pam.roleid
        WHERE m.rolname IN ('${migratorUsername}', '${appUsername}', '${purgeUsername}')
          AND r.rolname IN ('nimphy_migrator', 'nimphy_app', 'nimphy_purge')
        ORDER BY m.rolname, r.rolname;
      `);

      // Exactly 3 rows: migrator_login -> nimphy_migrator, app_login -> nimphy_app, purge_login -> nimphy_purge
      expect(crossRes.rows).toEqual([
        { login_name: appUsername, assumable_functional_role: 'nimphy_app' },
        { login_name: migratorUsername, assumable_functional_role: 'nimphy_migrator' },
        { login_name: purgeUsername, assumable_functional_role: 'nimphy_purge' },
      ]);
    } finally {
      targetClient.release();
    }
  });

  it('rejects a role named nimphy_app_login_attacker from assuming nimphy_app (exact allow-list regression)', async () => {
    const adminClient = await adminPool.connect();
    const attackerRole = 'nimphy_app_login_attacker';
    try {
      await adminClient.query(
        `CREATE ROLE "${attackerRole}" WITH LOGIN PASSWORD 'pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;`,
      );
      await adminClient.query(
        `GRANT nimphy_app TO "${attackerRole}" WITH INHERIT FALSE, SET TRUE;`,
      );

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /functional role "nimphy_app" has unauthorized member principal "nimphy_app_login_attacker"/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE nimphy_app FROM "${attackerRole}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${attackerRole}";`);
      adminClient.release();
    }
  });

  it('rejects a role named nimphy_migrator_login_extra from assuming nimphy_migrator (exact allow-list regression)', async () => {
    const adminClient = await adminPool.connect();
    const extraRole = 'nimphy_migrator_login_extra';
    try {
      await adminClient.query(
        `CREATE ROLE "${extraRole}" WITH LOGIN PASSWORD 'pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;`,
      );
      await adminClient.query(
        `GRANT nimphy_migrator TO "${extraRole}" WITH INHERIT FALSE, SET TRUE;`,
      );

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /functional role "nimphy_migrator" has unauthorized member principal "nimphy_migrator_login_extra"/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE nimphy_migrator FROM "${extraRole}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${extraRole}";`);
      adminClient.release();
    }
  });

  it('rejects a role named nimphy_purge_login_test from assuming nimphy_purge (exact allow-list regression)', async () => {
    const adminClient = await adminPool.connect();
    const testPurgeRole = 'nimphy_purge_login_test';
    try {
      await adminClient.query(
        `CREATE ROLE "${testPurgeRole}" WITH LOGIN PASSWORD 'pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;`,
      );
      await adminClient.query(
        `GRANT nimphy_purge TO "${testPurgeRole}" WITH INHERIT FALSE, SET TRUE;`,
      );

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /functional role "nimphy_purge" has unauthorized member principal "nimphy_purge_login_test"/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE nimphy_purge FROM "${testPurgeRole}";`);
      await adminClient.query(`DROP ROLE IF EXISTS "${testPurgeRole}";`);
      adminClient.release();
    }
  });

  it('rejects a designated service login configured with NOLOGIN in fail-closed mode', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`ALTER ROLE "${appUsername}" WITH NOLOGIN;`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /service login "nimphy_app_login" has unexpected administrative attribute\(s\):.*NOLOGIN/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`ALTER ROLE "${appUsername}" WITH LOGIN;`);
      adminClient.release();
    }
  });

  it('rejects bootstrap when designated nimphy_migrator_login does not exist in pg_roles', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      await expect(
        bootstrapDatabase(targetClient, {
          dbName: testDbName,
          allowedMembers: {
            nimphy_migrator: ['nonexistent_migrator_login'],
            nimphy_app: [appUsername],
            nimphy_purge: [purgeUsername],
          },
        }),
      ).rejects.toThrow(
        /designated service login "nonexistent_migrator_login" does not exist in pg_roles/,
      );
    } finally {
      targetClient.release();
    }
  });

  it('rejects bootstrap when designated nimphy_app_login does not exist in pg_roles', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      await expect(
        bootstrapDatabase(targetClient, {
          dbName: testDbName,
          allowedMembers: {
            nimphy_migrator: [migratorUsername],
            nimphy_app: ['nonexistent_app_login'],
            nimphy_purge: [purgeUsername],
          },
        }),
      ).rejects.toThrow(
        /designated service login "nonexistent_app_login" does not exist in pg_roles/,
      );
    } finally {
      targetClient.release();
    }
  });

  it('rejects bootstrap when designated nimphy_purge_login does not exist in pg_roles', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      await expect(
        bootstrapDatabase(targetClient, {
          dbName: testDbName,
          allowedMembers: {
            nimphy_migrator: [migratorUsername],
            nimphy_app: [appUsername],
            nimphy_purge: ['nonexistent_purge_login'],
          },
        }),
      ).rejects.toThrow(
        /designated service login "nonexistent_purge_login" does not exist in pg_roles/,
      );
    } finally {
      targetClient.release();
    }
  });

  it('rejects bootstrap when an existing designated login has its required functional-role membership revoked', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`REVOKE nimphy_app FROM "${appUsername}";`);

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /designated service login "nimphy_app_login" is missing required direct membership in functional role "nimphy_app"/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;`);
      adminClient.release();
    }
  });

  it('rejects bootstrap when an existing login is connected to the wrong functional role', async () => {
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(`REVOKE nimphy_app FROM "${appUsername}";`);
      await adminClient.query(
        `GRANT nimphy_purge TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;`,
      );

      const targetClient = await targetAdminPool.connect();
      try {
        await expect(bootstrapDatabase(targetClient, { dbName: testDbName })).rejects.toThrow(
          /functional role "nimphy_purge" has unauthorized member principal "nimphy_app_login"|designated service login "nimphy_app_login" is missing required direct membership in functional role "nimphy_app"/,
        );
      } finally {
        targetClient.release();
      }
    } finally {
      await adminClient.query(`REVOKE nimphy_purge FROM "${appUsername}";`);
      await adminClient.query(`GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;`);
      adminClient.release();
    }
  });

  it('rejects duplicate configured login names in allow-lists', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      await expect(
        bootstrapDatabase(targetClient, {
          dbName: testDbName,
          allowedMembers: {
            nimphy_migrator: [migratorUsername, migratorUsername],
            nimphy_app: [appUsername],
            nimphy_purge: [purgeUsername],
          },
        }),
      ).rejects.toThrow(
        /duplicate login principal "nimphy_migrator_login" in migrator login allow-list/,
      );
    } finally {
      targetClient.release();
    }
  });

  it('rejects overlapping configured login names across functional role allow-lists', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      await expect(
        bootstrapDatabase(targetClient, {
          dbName: testDbName,
          allowedMembers: {
            nimphy_migrator: [migratorUsername],
            nimphy_app: [migratorUsername],
            nimphy_purge: [purgeUsername],
          },
        }),
      ).rejects.toThrow(
        /overlapping login principal "nimphy_migrator_login" configured across multiple functional role allow-lists/,
      );
    } finally {
      targetClient.release();
    }
  });

  it('successfully bootstraps when the complete membership graph is valid and intact', async () => {
    const targetClient = await targetAdminPool.connect();
    try {
      await expect(
        bootstrapDatabase(targetClient, {
          dbName: testDbName,
          allowedMembers: {
            nimphy_migrator: [migratorUsername],
            nimphy_app: [appUsername],
            nimphy_purge: [purgeUsername],
          },
        }),
      ).resolves.toBeUndefined();
    } finally {
      targetClient.release();
    }
  });
});
