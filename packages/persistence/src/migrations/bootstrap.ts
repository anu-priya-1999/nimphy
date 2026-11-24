import type { Client, Pool, PoolClient } from 'pg';

export type RoleDriftPolicy = 'fail_closed' | 'normalize';

export interface BootstrapRolesOptions {
  onRoleDrift?: RoleDriftPolicy;
  allowedMembers?: {
    nimphy_migrator?: string[];
    nimphy_app?: string[];
    nimphy_purge?: string[];
  };
}

export interface BootstrapOptions extends BootstrapRolesOptions {
  dbName?: string;
  grantToCurrentUser?: boolean;
}

/**
 * Generates SQL statements to provision cluster roles and enforce safe role attributes & memberships.
 *
 * Safe Behavior Policy:
 * - Default: 'fail_closed'. Throws descriptive error if any functional role has unexpected
 *   insecure attributes (LOGIN, SUPERUSER, CREATEROLE, CREATEDB, BYPASSRLS, REPLICATION)
 *   or unexpected parent / member roles.
 * - 'normalize': Resets insecure attributes back to secure defaults via ALTER ROLE.
 * - Does not modify or audit unrelated database roles.
 */
export function getBootstrapRolesSql(options: BootstrapRolesOptions = {}): string {
  const policy = options.onRoleDrift === 'normalize' ? 'normalize' : 'fail_closed';
  const migratorLogins = options.allowedMembers?.nimphy_migrator ?? ['nimphy_migrator_login'];
  const appLogins = options.allowedMembers?.nimphy_app ?? ['nimphy_app_login'];
  const purgeLogins = options.allowedMembers?.nimphy_purge ?? ['nimphy_purge_login'];

  // Validate allow-lists: reject empty, duplicate, or overlapping configurations
  if (migratorLogins.length === 0) {
    throw new Error('Bootstrap failed: migrator login allow-list cannot be empty');
  }
  if (appLogins.length === 0) {
    throw new Error('Bootstrap failed: app login allow-list cannot be empty');
  }
  if (purgeLogins.length === 0) {
    throw new Error('Bootstrap failed: purge login allow-list cannot be empty');
  }

  const findDuplicates = (arr: string[]) => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const item of arr) {
      if (seen.has(item)) dupes.add(item);
      seen.add(item);
    }
    return [...dupes];
  };

  const migratorDupes = findDuplicates(migratorLogins);
  if (migratorDupes.length > 0) {
    throw new Error(
      `Bootstrap failed: duplicate login principal "${migratorDupes[0]}" in migrator login allow-list`,
    );
  }
  const appDupes = findDuplicates(appLogins);
  if (appDupes.length > 0) {
    throw new Error(
      `Bootstrap failed: duplicate login principal "${appDupes[0]}" in app login allow-list`,
    );
  }
  const purgeDupes = findDuplicates(purgeLogins);
  if (purgeDupes.length > 0) {
    throw new Error(
      `Bootstrap failed: duplicate login principal "${purgeDupes[0]}" in purge login allow-list`,
    );
  }

  const appSet = new Set(appLogins);
  const purgeSet = new Set(purgeLogins);

  for (const m of migratorLogins) {
    if (appSet.has(m) || purgeSet.has(m)) {
      throw new Error(
        `Bootstrap failed: overlapping login principal "${m}" configured across multiple functional role allow-lists`,
      );
    }
  }
  for (const a of appLogins) {
    if (purgeSet.has(a)) {
      throw new Error(
        `Bootstrap failed: overlapping login principal "${a}" configured across multiple functional role allow-lists`,
      );
    }
  }

  const toPgArray = (arr: string[]) =>
    `ARRAY[${arr.map((m) => `'${m.replace(/'/g, "''")}'`).join(', ')}]::text[]`;

  return `
DO $$
DECLARE
  r RECORD;
  m RECORD;
  policy text := '${policy}';
  insecure_attrs text[];
  expected_roles text[] := ARRAY['nimphy_migrator', 'nimphy_app', 'nimphy_purge'];
  migrator_logins text[] := ${toPgArray(migratorLogins)};
  app_logins text[] := ${toPgArray(appLogins)};
  purge_logins text[] := ${toPgArray(purgeLogins)};
  allowed_logins text[] := ${toPgArray([...migratorLogins, ...appLogins, ...purgeLogins])};
  role_item text;
  has_inherit_col boolean;
  has_set_col boolean;
  pam_record RECORD;
BEGIN
  -- 0. Validate allow-lists: reject empty, duplicate, or overlapping configurations
  IF array_length(migrator_logins, 1) IS NULL OR array_length(migrator_logins, 1) = 0 THEN
    RAISE EXCEPTION 'Bootstrap failed: migrator login allow-list cannot be empty';
  END IF;
  IF array_length(app_logins, 1) IS NULL OR array_length(app_logins, 1) = 0 THEN
    RAISE EXCEPTION 'Bootstrap failed: app login allow-list cannot be empty';
  END IF;
  IF array_length(purge_logins, 1) IS NULL OR array_length(purge_logins, 1) = 0 THEN
    RAISE EXCEPTION 'Bootstrap failed: purge login allow-list cannot be empty';
  END IF;

  FOR r IN
    SELECT login_name, count(*) AS cnt
    FROM unnest(migrator_logins) AS login_name
    GROUP BY login_name
    HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'Bootstrap failed: duplicate login principal "%" in migrator login allow-list', r.login_name;
  END LOOP;

  FOR r IN
    SELECT login_name, count(*) AS cnt
    FROM unnest(app_logins) AS login_name
    GROUP BY login_name
    HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'Bootstrap failed: duplicate login principal "%" in app login allow-list', r.login_name;
  END LOOP;

  FOR r IN
    SELECT login_name, count(*) AS cnt
    FROM unnest(purge_logins) AS login_name
    GROUP BY login_name
    HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'Bootstrap failed: duplicate login principal "%" in purge login allow-list', r.login_name;
  END LOOP;

  FOR r IN
    SELECT login_name
    FROM (
      SELECT unnest(migrator_logins) AS login_name
      INTERSECT
      SELECT unnest(app_logins) AS login_name
      UNION ALL
      SELECT unnest(migrator_logins) AS login_name
      INTERSECT
      SELECT unnest(purge_logins) AS login_name
      UNION ALL
      SELECT unnest(app_logins) AS login_name
      INTERSECT
      SELECT unnest(purge_logins) AS login_name
    ) AS ov
  LOOP
    RAISE EXCEPTION 'Bootstrap failed: overlapping login principal "%" configured across multiple functional role allow-lists', r.login_name;
  END LOOP;

  -- Check columns for inherit_option and set_option in pg_auth_members
  SELECT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'pg_catalog' AND table_name = 'pg_auth_members' AND column_name = 'inherit_option'
  ) INTO has_inherit_col;

  SELECT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'pg_catalog' AND table_name = 'pg_auth_members' AND column_name = 'set_option'
  ) INTO has_set_col;

  -- 1. Ensure all three functional roles exist
  FOREACH role_item IN ARRAY expected_roles LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_item) THEN
      EXECUTE format('CREATE ROLE %I WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION', role_item);
    END IF;
  END LOOP;

  -- 2. Explicitly require all designated service logins to exist in pg_roles with LOGIN and zero administrative attributes
  FOREACH role_item IN ARRAY allowed_logins LOOP
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
    INTO r
    FROM pg_roles
    WHERE rolname = role_item;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bootstrap failed: designated service login "%" does not exist in pg_roles', role_item;
    END IF;

    insecure_attrs := ARRAY[]::text[];
    IF NOT r.rolcanlogin THEN insecure_attrs := array_append(insecure_attrs, 'NOLOGIN'); END IF;
    IF r.rolsuper THEN insecure_attrs := array_append(insecure_attrs, 'SUPERUSER'); END IF;
    IF r.rolcreatedb THEN insecure_attrs := array_append(insecure_attrs, 'CREATEDB'); END IF;
    IF r.rolcreaterole THEN insecure_attrs := array_append(insecure_attrs, 'CREATEROLE'); END IF;
    IF r.rolbypassrls THEN insecure_attrs := array_append(insecure_attrs, 'BYPASSRLS'); END IF;
    IF r.rolreplication THEN insecure_attrs := array_append(insecure_attrs, 'REPLICATION'); END IF;

    IF array_length(insecure_attrs, 1) > 0 THEN
      RAISE EXCEPTION 'Bootstrap failed: service login "%" has unexpected administrative attribute(s): % (expected LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION)',
        r.rolname, array_to_string(insecure_attrs, ', ');
    END IF;
  END LOOP;

  -- 3. Audit and enforce functional-role attributes
  FOR r IN
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
    FROM pg_roles
    WHERE rolname = ANY(expected_roles)
  LOOP
    insecure_attrs := ARRAY[]::text[];
    IF r.rolcanlogin THEN insecure_attrs := array_append(insecure_attrs, 'LOGIN'); END IF;
    IF r.rolsuper THEN insecure_attrs := array_append(insecure_attrs, 'SUPERUSER'); END IF;
    IF r.rolcreatedb THEN insecure_attrs := array_append(insecure_attrs, 'CREATEDB'); END IF;
    IF r.rolcreaterole THEN insecure_attrs := array_append(insecure_attrs, 'CREATEROLE'); END IF;
    IF r.rolbypassrls THEN insecure_attrs := array_append(insecure_attrs, 'BYPASSRLS'); END IF;
    IF r.rolreplication THEN insecure_attrs := array_append(insecure_attrs, 'REPLICATION'); END IF;

    IF array_length(insecure_attrs, 1) > 0 THEN
      IF policy = 'normalize' THEN
        RAISE NOTICE 'Normalizing insecure attributes on role "%": %', r.rolname, array_to_string(insecure_attrs, ', ');
        EXECUTE format('ALTER ROLE %I WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION', r.rolname);
      ELSE
        RAISE EXCEPTION 'Bootstrap failed: functional role "%" has unexpected insecure attribute(s): % (expected NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION)',
          r.rolname, array_to_string(insecure_attrs, ', ');
      END IF;
    END IF;
  END LOOP;

  -- 3. Audit Direction 1 (Outward): Functional roles must not inherit external or privileged memberships
  FOR m IN
    SELECT m_role.rolname AS functional_role, p_role.rolname AS parent_role
    FROM pg_auth_members pam
    JOIN pg_roles m_role ON m_role.oid = pam.member
    JOIN pg_roles p_role ON p_role.oid = pam.roleid
    WHERE m_role.rolname = ANY(expected_roles)
  LOOP
    RAISE EXCEPTION 'Bootstrap failed: functional role "%" inherits unexpected parent role "%" (functional roles must not inherit external or privileged memberships)',
      m.functional_role, m.parent_role;
  END LOOP;

  -- 4. Audit Direction 2 (Inward): Functional roles must not have unauthorized member principals or admin_option
  FOR m IN
    SELECT f_role.rolname AS functional_role, mem.rolname AS member_name, pam.admin_option
    FROM pg_auth_members pam
    JOIN pg_roles f_role ON f_role.oid = pam.roleid
    JOIN pg_roles mem ON mem.oid = pam.member
    WHERE f_role.rolname = ANY(expected_roles)
  LOOP
    IF m.admin_option THEN
      RAISE EXCEPTION 'Bootstrap failed: member "%" of functional role "%" has admin_option = true (role administration must not be delegated)',
        m.member_name, m.functional_role;
    END IF;

    IF NOT (
      (m.functional_role = 'nimphy_migrator' AND (m.member_name = ANY(migrator_logins) OR m.member_name = current_user)) OR
      (m.functional_role = 'nimphy_app' AND (m.member_name = ANY(app_logins) OR m.member_name = current_user)) OR
      (m.functional_role = 'nimphy_purge' AND (m.member_name = ANY(purge_logins) OR m.member_name = current_user))
    ) THEN
      RAISE EXCEPTION 'Bootstrap failed: functional role "%" has unauthorized member principal "%" (only designated service logins or current administrative user may assume functional roles)',
        m.functional_role, m.member_name;
    END IF;
  END LOOP;

  -- 6. Audit inherit_option in PG 16+ (members must have inherit_option = false)
  IF has_inherit_col THEN
    FOR pam_record IN
      EXECUTE 'SELECT f_role.rolname AS f_role, mem_role.rolname AS m_role FROM pg_auth_members pam JOIN pg_roles f_role ON f_role.oid = pam.roleid JOIN pg_roles mem_role ON mem_role.oid = pam.member WHERE f_role.rolname = ANY($1) AND pam.inherit_option = true'
      USING expected_roles
    LOOP
      RAISE EXCEPTION 'Bootstrap failed: member "%" of functional role "%" has inherit_option = true (expected INHERIT FALSE)',
        pam_record.m_role, pam_record.f_role;
    END LOOP;
  END IF;

  -- 7. Explicitly require each designated service login to possess its intended direct membership in pg_auth_members
  FOREACH role_item IN ARRAY migrator_logins LOOP
    pam_record := NULL;
    IF has_inherit_col AND has_set_col THEN
      EXECUTE '
        SELECT pam.admin_option, pam.inherit_option, pam.set_option
        FROM pg_auth_members pam
        JOIN pg_roles f_role ON f_role.oid = pam.roleid
        JOIN pg_roles mem ON mem.oid = pam.member
        WHERE f_role.rolname = ''nimphy_migrator'' AND mem.rolname = $1'
      INTO pam_record
      USING role_item;
    ELSE
      SELECT pam.admin_option, false AS inherit_option, true AS set_option
      INTO pam_record
      FROM pg_auth_members pam
      JOIN pg_roles f_role ON f_role.oid = pam.roleid
      JOIN pg_roles mem ON mem.oid = pam.member
      WHERE f_role.rolname = 'nimphy_migrator' AND mem.rolname = role_item;
    END IF;

    IF pam_record IS NULL THEN
      RAISE EXCEPTION 'Bootstrap failed: designated service login "%" is missing required direct membership in functional role "nimphy_migrator"', role_item;
    END IF;

    IF pam_record.admin_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_migrator" has admin_option = true (expected ADMIN FALSE)', role_item;
    END IF;

    IF has_inherit_col AND pam_record.inherit_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_migrator" has inherit_option = true (expected INHERIT FALSE)', role_item;
    END IF;

    IF has_set_col AND NOT pam_record.set_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_migrator" has set_option = false (expected SET TRUE)', role_item;
    END IF;
  END LOOP;

  FOREACH role_item IN ARRAY app_logins LOOP
    pam_record := NULL;
    IF has_inherit_col AND has_set_col THEN
      EXECUTE '
        SELECT pam.admin_option, pam.inherit_option, pam.set_option
        FROM pg_auth_members pam
        JOIN pg_roles f_role ON f_role.oid = pam.roleid
        JOIN pg_roles mem ON mem.oid = pam.member
        WHERE f_role.rolname = ''nimphy_app'' AND mem.rolname = $1'
      INTO pam_record
      USING role_item;
    ELSE
      SELECT pam.admin_option, false AS inherit_option, true AS set_option
      INTO pam_record
      FROM pg_auth_members pam
      JOIN pg_roles f_role ON f_role.oid = pam.roleid
      JOIN pg_roles mem ON mem.oid = pam.member
      WHERE f_role.rolname = 'nimphy_app' AND mem.rolname = role_item;
    END IF;

    IF pam_record IS NULL THEN
      RAISE EXCEPTION 'Bootstrap failed: designated service login "%" is missing required direct membership in functional role "nimphy_app"', role_item;
    END IF;

    IF pam_record.admin_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_app" has admin_option = true (expected ADMIN FALSE)', role_item;
    END IF;

    IF has_inherit_col AND pam_record.inherit_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_app" has inherit_option = true (expected INHERIT FALSE)', role_item;
    END IF;

    IF has_set_col AND NOT pam_record.set_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_app" has set_option = false (expected SET TRUE)', role_item;
    END IF;
  END LOOP;

  FOREACH role_item IN ARRAY purge_logins LOOP
    pam_record := NULL;
    IF has_inherit_col AND has_set_col THEN
      EXECUTE '
        SELECT pam.admin_option, pam.inherit_option, pam.set_option
        FROM pg_auth_members pam
        JOIN pg_roles f_role ON f_role.oid = pam.roleid
        JOIN pg_roles mem ON mem.oid = pam.member
        WHERE f_role.rolname = ''nimphy_purge'' AND mem.rolname = $1'
      INTO pam_record
      USING role_item;
    ELSE
      SELECT pam.admin_option, false AS inherit_option, true AS set_option
      INTO pam_record
      FROM pg_auth_members pam
      JOIN pg_roles f_role ON f_role.oid = pam.roleid
      JOIN pg_roles mem ON mem.oid = pam.member
      WHERE f_role.rolname = 'nimphy_purge' AND mem.rolname = role_item;
    END IF;

    IF pam_record IS NULL THEN
      RAISE EXCEPTION 'Bootstrap failed: designated service login "%" is missing required direct membership in functional role "nimphy_purge"', role_item;
    END IF;

    IF pam_record.admin_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_purge" has admin_option = true (expected ADMIN FALSE)', role_item;
    END IF;

    IF has_inherit_col AND pam_record.inherit_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_purge" has inherit_option = true (expected INHERIT FALSE)', role_item;
    END IF;

    IF has_set_col AND NOT pam_record.set_option THEN
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "nimphy_purge" has set_option = false (expected SET TRUE)', role_item;
    END IF;
  END LOOP;

  -- 7. Audit service login principals'' direct and transitive memberships (must only assume intended functional role)
  FOR m IN
    WITH RECURSIVE login_memberships AS (
      SELECT
        l_role.rolname AS login_name,
        g_role.rolname AS granted_role,
        pam.roleid AS granted_role_oid,
        ARRAY[l_role.rolname, g_role.rolname]::text[] AS path,
        1 AS depth
      FROM pg_roles l_role
      JOIN pg_auth_members pam ON pam.member = l_role.oid
      JOIN pg_roles g_role ON g_role.oid = pam.roleid
      WHERE l_role.rolname = ANY(allowed_logins)

      UNION ALL

      SELECT
        lm.login_name,
        parent_role.rolname AS granted_role,
        pam2.roleid AS granted_role_oid,
        lm.path || parent_role.rolname,
        lm.depth + 1
      FROM login_memberships lm
      JOIN pg_auth_members pam2 ON pam2.member = lm.granted_role_oid
      JOIN pg_roles parent_role ON parent_role.oid = pam2.roleid
      WHERE NOT (parent_role.rolname = ANY(lm.path))
    )
    SELECT login_name, granted_role, path, depth
    FROM login_memberships
  LOOP
    IF m.login_name = ANY(migrator_logins) THEN
      IF m.granted_role <> 'nimphy_migrator' THEN
        IF m.depth = 1 THEN
          RAISE EXCEPTION 'Bootstrap failed: service login "%" has unexpected direct role membership: "%" (service logins must be members only of their designated functional role)',
            m.login_name, m.granted_role;
        ELSE
          RAISE EXCEPTION 'Bootstrap failed: service login "%" has unexpected transitive role membership: "%" via path % (service logins must not acquire additional privileges)',
            m.login_name, m.granted_role, array_to_string(m.path, ' -> ');
        END IF;
      END IF;
    ELSIF m.login_name = ANY(app_logins) THEN
      IF m.granted_role <> 'nimphy_app' THEN
        IF m.depth = 1 THEN
          RAISE EXCEPTION 'Bootstrap failed: service login "%" has unexpected direct role membership: "%" (service logins must be members only of their designated functional role)',
            m.login_name, m.granted_role;
        ELSE
          RAISE EXCEPTION 'Bootstrap failed: service login "%" has unexpected transitive role membership: "%" via path % (service logins must not acquire additional privileges)',
            m.login_name, m.granted_role, array_to_string(m.path, ' -> ');
        END IF;
      END IF;
    ELSIF m.login_name = ANY(purge_logins) THEN
      IF m.granted_role <> 'nimphy_purge' THEN
        IF m.depth = 1 THEN
          RAISE EXCEPTION 'Bootstrap failed: service login "%" has unexpected direct role membership: "%" (service logins must be members only of their designated functional role)',
            m.login_name, m.granted_role;
        ELSE
          RAISE EXCEPTION 'Bootstrap failed: service login "%" has unexpected transitive role membership: "%" via path % (service logins must not acquire additional privileges)',
            m.login_name, m.granted_role, array_to_string(m.path, ' -> ');
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 8. Audit set_option in PG 16+ (membership in functional role must have set_option = true)
  SELECT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'pg_catalog' AND table_name = 'pg_auth_members' AND column_name = 'set_option'
  ) INTO has_set_col;

  IF has_set_col THEN
    FOR pam_record IN
      EXECUTE '
        SELECT f_role.rolname AS f_role, mem_role.rolname AS m_role
        FROM pg_auth_members pam
        JOIN pg_roles f_role ON f_role.oid = pam.roleid
        JOIN pg_roles mem_role ON mem_role.oid = pam.member
        WHERE f_role.rolname = ANY($1)
          AND pam.set_option = false
          AND mem_role.rolname = ANY($2)'
      USING expected_roles, allowed_logins
    LOOP
      RAISE EXCEPTION 'Bootstrap failed: membership of "%" in functional role "%" has set_option = false (expected SET TRUE)',
        pam_record.m_role, pam_record.f_role;
    END LOOP;
  END IF;
END $$;
`;
}

/**
 * Default cluster-level roles bootstrap statement using fail_closed policy.
 */
export const BOOTSTRAP_ROLES_SQL = getBootstrapRolesSql();

export function getBootstrapDatabaseSql(dbName?: string): string {
  if (dbName) {
    const escapedDb = dbName.replace(/"/g, '""');
    return `
ALTER SCHEMA public OWNER TO nimphy_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO nimphy_migrator;
GRANT CONNECT, CREATE ON DATABASE "${escapedDb}" TO nimphy_migrator;
`;
  }

  return `
ALTER SCHEMA public OWNER TO nimphy_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO nimphy_migrator;
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO nimphy_migrator', current_database());
END $$;
`;
}

/**
 * Bootstraps roles and database-level ownership for a target database.
 * Must be executed using an administrative connection with superuser or CREATEROLE privileges.
 */
export async function bootstrapDatabase(
  client: Client | PoolClient | Pool,
  options: BootstrapOptions = {},
): Promise<void> {
  // 1. Ensure roles exist at cluster level and audit/enforce attributes & memberships
  await client.query(getBootstrapRolesSql(options));

  // 2. Setup schema public and database permissions
  await client.query(getBootstrapDatabaseSql(options.dbName));

  // 3. In local / test setups, grant role memberships to CURRENT_USER so the session can test SET ROLE
  if (options.grantToCurrentUser) {
    await client.query(`
      GRANT nimphy_migrator TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
      GRANT nimphy_app TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
      GRANT nimphy_purge TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
    `);
  }
}
