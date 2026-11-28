import crypto from 'crypto';
import { hashCanonicalJson, parseUserId, type UserId } from '@nimphy/domain';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapDatabase,
  createDatabasePool,
  createPgCaseRepository,
  createPgCaseRepositoryForTransaction,
  createPgIdempotencyRepository,
  findOrCreateUserByIdpSubject,
  purgePendingBusinessCase,
  runMigrations,
  withTransaction,
} from '../../packages/persistence/src/index';
import {
  createManagedTestPool,
  dropDatabaseCleanly,
  getBaseDatabaseUrl,
  MIGRATIONS_DIR,
  type ManagedTestPool,
} from './test-helper';

describe('Database Integration — Cases, Revisions, Evidence, Idempotency, Purge (STEP-012)', () => {
  const baseDbUrl = getBaseDatabaseUrl();
  const suffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const testDbName = `nimphy_test_cases_${suffix}`.slice(0, 63);
  const appUsername = `nimphy_cases_app_${suffix}`.slice(0, 63);
  const purgeUsername = `nimphy_cases_purge_${suffix}`.slice(0, 63);
  const testPassword = 'test_cases_secret_password';

  let adminPool: Pool;
  let appManaged: ManagedTestPool;
  let appPool: Pool;
  let purgeManaged: ManagedTestPool;
  let purgePool: Pool;

  let userAId: UserId;
  let userBId: UserId;

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

      await adminClient.query(`
        CREATE ROLE "${appUsername}" WITH LOGIN PASSWORD '${testPassword}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;

        CREATE ROLE "${purgeUsername}" WITH LOGIN PASSWORD '${testPassword}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
        GRANT nimphy_purge TO "${purgeUsername}" WITH INHERIT FALSE, SET TRUE;
      `);
    } finally {
      adminClient.release();
    }

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
          nimphy_purge: ['nimphy_purge_login', purgeUsername],
        },
      });
      await targetAdminClient.query(
        `GRANT CONNECT ON DATABASE "${testDbName}" TO "${appUsername}", "${purgeUsername}";`,
      );
    } finally {
      targetAdminClient.release();
    }

    await runMigrations(targetAdminPool, {
      migrationsDir: MIGRATIONS_DIR,
      targetRole: 'nimphy_migrator',
    });
    await targetAdminPool.end();

    const appUrl = new URL(baseDbUrl);
    appUrl.pathname = `/${testDbName}`;
    appUrl.username = appUsername;
    appUrl.password = testPassword;
    appManaged = createManagedTestPool({ connectionString: appUrl.toString(), role: 'nimphy_app' });
    appPool = appManaged.pool;

    const purgeUrl = new URL(baseDbUrl);
    purgeUrl.pathname = `/${testDbName}`;
    purgeUrl.username = purgeUsername;
    purgeUrl.password = testPassword;
    purgeManaged = createManagedTestPool({
      connectionString: purgeUrl.toString(),
      role: 'nimphy_purge',
    });
    purgePool = purgeManaged.pool;

    const resA = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'sub_user_a',
      email: 'a@example.com',
    });
    const resB = await findOrCreateUserByIdpSubject(appPool, {
      idpSubject: 'sub_user_b',
      email: 'b@example.com',
    });
    userAId = parseUserId(resA.user.id);
    userBId = parseUserId(resB.user.id);
  });

  afterAll(async () => {
    try {
      await appManaged?.close();
      await purgeManaged?.close();
      appManaged?.assertZeroErrors();
      purgeManaged?.assertZeroErrors();
    } finally {
      if (adminPool) {
        const adminClient = await adminPool.connect();
        try {
          await dropDatabaseCleanly(adminClient, testDbName);
          await adminClient.query(`DROP ROLE IF EXISTS "${appUsername}", "${purgeUsername}";`);
        } finally {
          adminClient.release();
        }
        await adminPool.end();
      }
    }
  });

  it('creates, lists with cursor pagination, updates, and enforces ownership isolation in Postgres', async () => {
    const repo = createPgCaseRepository(appPool);

    const c1 = await repo.createCase({
      userId: userAId,
      title: 'Case 1',
      correlationId: 'corr-c1',
    });
    const c2 = await repo.createCase({
      userId: userAId,
      title: 'Case 2',
      correlationId: 'corr-c2',
    });
    const c3 = await repo.createCase({
      userId: userAId,
      title: 'Case 3',
      correlationId: 'corr-c3',
    });
    await repo.createCase({ userId: userBId, title: 'User B Case', correlationId: 'corr-b1' });

    // Audit row written for case.created
    const auditRes = await appPool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_id = $1 AND action = 'case.created'`,
      [c1.id],
    );
    expect(auditRes.rows).toHaveLength(1);

    // Cursor pagination (page size 2)
    const page1 = await repo.listCases({ userId: userAId, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.items.map((i) => i.id)).toEqual([c3.id, c2.id]);

    const last1 = page1.items[page1.items.length - 1]!;
    const page2 = await repo.listCases({
      userId: userAId,
      limit: 2,
      cursor: { updatedAt: last1.updatedAt, id: last1.id },
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
    expect(page2.items[0]?.id).toBe(c1.id);

    // Cross-user read & update return null
    expect(await repo.getCaseWithLatestRevision({ userId: userBId, caseId: c1.id })).toBeNull();
    expect(
      await repo.updateCase({
        userId: userBId,
        caseId: c1.id,
        title: 'Tamper',
        correlationId: 'corr-tamper',
      }),
    ).toBeNull();

    // Owner archives and restores with audit events
    const archived = await repo.updateCase({
      userId: userAId,
      caseId: c1.id,
      status: 'archived',
      correlationId: 'corr-arch',
    });
    expect(archived?.status).toBe('archived');

    const restored = await repo.updateCase({
      userId: userAId,
      caseId: c1.id,
      status: 'active',
      correlationId: 'corr-rest',
    });
    expect(restored?.status).toBe('active');

    const lifecycleAudits = await appPool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_id = $1 AND action IN ('case.archived', 'case.restored') ORDER BY id ASC`,
      [c1.id],
    );
    expect(lifecycleAudits.rows.map((r) => r.action)).toEqual(['case.archived', 'case.restored']);
  });

  it('saves immutable revisions under concurrent requests, attaches evidence, and rolls back on failure', async () => {
    const repo = createPgCaseRepository(appPool);
    const created = await repo.createCase({
      userId: userAId,
      title: 'Concurrent Revisions Case',
      correlationId: 'corr-rev',
    });

    const sampleInputs = {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      fileSizeMb: '2.5',
      listPrice: { value: { amountMinor: 999, currency: 'USD' }, provenance: 'user_input' },
      fixedCosts: [],
      scenarios: {
        low: { units: 100, listPriceMinor: 999 },
        base: { units: 300, listPriceMinor: 999 },
        high: { units: 600, listPriceMinor: 999 },
      },
    };
    const inputsHash = hashCanonicalJson(sampleInputs);

    // Fire 3 concurrent saveRevision calls on the same case
    const savedRevs = await Promise.all([
      repo.saveRevision({
        userId: userAId,
        caseId: created.id,
        inputs: sampleInputs,
        inputsSchemaVersion: 1,
        inputsHash,
        correlationId: 'corr-r1',
      }),
      repo.saveRevision({
        userId: userAId,
        caseId: created.id,
        inputs: sampleInputs,
        inputsSchemaVersion: 1,
        inputsHash,
        correlationId: 'corr-r2',
      }),
      repo.saveRevision({
        userId: userAId,
        caseId: created.id,
        inputs: sampleInputs,
        inputsSchemaVersion: 1,
        inputsHash,
        correlationId: 'corr-r3',
      }),
    ]);

    const revNos = savedRevs.map((r) => r?.revisionNo).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(revNos).toEqual([1, 2, 3]);

    // Attach evidence to revision 1
    const ev = await repo.attachEvidence({
      userId: userAId,
      caseId: created.id,
      revisionNo: 1,
      fieldPath: 'listPrice',
      provenance: 'official_fact',
      kind: 'note',
      summary: 'Verified pricing',
      sourceRef: null,
      capturedAt: '2026-11-27',
    });
    expect(ev?.revisionId).toBeTruthy();

    const loaded = await repo.getRevision({
      userId: userAId,
      caseId: created.id,
      revisionNo: 1,
    });
    expect(loaded?.evidenceItems).toHaveLength(1);

    // Transaction rollback check: invalid correlationId (>200 chars) fails audit write and rolls back revision insert
    await expect(
      repo.saveRevision({
        userId: userAId,
        caseId: created.id,
        inputs: sampleInputs,
        inputsSchemaVersion: 1,
        inputsHash,
        correlationId: 'x'.repeat(201),
      }),
    ).rejects.toThrow();

    const afterRollback = await repo.getCaseWithLatestRevision({
      userId: userAId,
      caseId: created.id,
    });
    expect(afterRollback?.latestRevision?.revisionNo).toBe(3);
  });

  it('enforces two-phase deletion (phase 1 hide 404, phase 2 purge under nimphy_purge)', async () => {
    const repo = createPgCaseRepository(appPool);
    const created = await repo.createCase({
      userId: userAId,
      title: 'To Be Deleted',
      correlationId: 'corr-del-0',
    });

    const sampleInputs = { marketplace: 'TEST_MARKETPLACE', format: 'ebook' };
    await repo.saveRevision({
      userId: userAId,
      caseId: created.id,
      inputs: sampleInputs,
      inputsSchemaVersion: 1,
      inputsHash: hashCanonicalJson(sampleInputs),
      correlationId: 'corr-del-rev',
    });

    // Phase 1
    const del1 = await repo.requestCaseDeletion({
      userId: userAId,
      caseId: created.id,
      correlationId: 'corr-del-1',
    });
    expect(del1.requested).toBe(true);

    // Invisible everywhere after phase 1
    expect(
      await repo.getCaseWithLatestRevision({ userId: userAId, caseId: created.id }),
    ).toBeNull();
    expect(
      await repo.getRevision({ userId: userAId, caseId: created.id, revisionNo: 1 }),
    ).toBeNull();
    expect(
      await repo.requestCaseDeletion({
        userId: userAId,
        caseId: created.id,
        correlationId: 'corr-del-2',
      }),
    ).toEqual({ requested: false });

    // nimphy_app cannot purge directly
    await expect(purgePendingBusinessCase(appPool, created.id)).rejects.toThrow();

    // Phase 2 under nimphy_purge succeeds and cascades revisions
    const purged = await purgePendingBusinessCase(purgePool, created.id);
    expect(purged).toEqual({ purged: true, notFound: false });

    // Repeat purge returns notFound: true
    const repeatPurge = await purgePendingBusinessCase(purgePool, created.id);
    expect(repeatPurge).toEqual({ purged: false, notFound: true });
  });

  it('enforces idempotency_keys claim, replay, conflict, release, and per-user isolation', async () => {
    const idemRepo = createPgIdempotencyRepository(appPool);
    const hash1 = hashCanonicalJson({ title: 'Case A' });
    const hash2 = hashCanonicalJson({ title: 'Case B' });

    const c1 = await idemRepo.claim({
      userId: userAId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
      requestHash: hash1,
    });
    expect(c1).toEqual({ status: 'claimed' });

    // In-progress conflict
    const inProg = await idemRepo.claim({
      userId: userAId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
      requestHash: hash1,
    });
    expect(inProg).toEqual({ status: 'conflict', reason: 'in_progress' });

    await idemRepo.complete({
      userId: userAId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
      responseStatus: 201,
      responseBody: { id: 'abc', title: 'Case A' },
    });

    const replay = await idemRepo.claim({
      userId: userAId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
      requestHash: hash1,
    });
    expect(replay).toEqual({
      status: 'replay',
      responseStatus: 201,
      responseBody: { id: 'abc', title: 'Case A' },
    });

    const mismatch = await idemRepo.claim({
      userId: userAId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
      requestHash: hash2,
    });
    expect(mismatch).toEqual({ status: 'conflict', reason: 'payload_mismatch' });

    // User B with same key is isolated
    const userBClaim = await idemRepo.claim({
      userId: userBId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
      requestHash: hash2,
    });
    expect(userBClaim).toEqual({ status: 'claimed' });

    await idemRepo.release({
      userId: userBId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
    });
    const userBReclaim = await idemRepo.claim({
      userId: userBId,
      endpoint: 'POST /api/v1/cases',
      key: 'k-1',
      requestHash: hash2,
    });
    expect(userBReclaim).toEqual({ status: 'claimed' });
  });

  it('rolls back mutation and idempotency key when completion fails, allowing safe retry', async () => {
    const endpoint = 'POST /api/v1/cases';
    const key = 'tx-complete-fail-1';
    const requestHash = hashCanonicalJson({ title: 'Atomic Rollback Case' });

    await expect(
      withTransaction(appPool, async (client) => {
        const txCaseRepo = createPgCaseRepositoryForTransaction(client);
        const txIdemRepo = createPgIdempotencyRepository(client);

        const claim = await txIdemRepo.claim({ userId: userAId, endpoint, key, requestHash });
        expect(claim).toEqual({ status: 'claimed' });

        await txCaseRepo.createCase({
          userId: userAId,
          title: 'Atomic Rollback Case',
          correlationId: 'corr-atomic-fail',
        });

        throw new Error('Simulated idempotency complete() failure');
      }),
    ).rejects.toThrow('Simulated idempotency complete() failure');

    // Neither the business_case, audit_log, nor idempotency_keys row may exist
    const casesAfterFail = await appPool.query(
      `SELECT id FROM business_cases WHERE user_id = $1 AND title = 'Atomic Rollback Case'`,
      [userAId],
    );
    expect(casesAfterFail.rows).toHaveLength(0);

    const idemAfterFail = await appPool.query(
      `SELECT key FROM idempotency_keys WHERE user_id = $1 AND endpoint = $2 AND key = $3`,
      [userAId, endpoint, key],
    );
    expect(idemAfterFail.rows).toHaveLength(0);

    // Retry with same key succeeds and creates exactly 1 case
    const retryResult = await withTransaction(appPool, async (client) => {
      const txCaseRepo = createPgCaseRepositoryForTransaction(client);
      const txIdemRepo = createPgIdempotencyRepository(client);

      const claim = await txIdemRepo.claim({ userId: userAId, endpoint, key, requestHash });
      expect(claim).toEqual({ status: 'claimed' });

      const created = await txCaseRepo.createCase({
        userId: userAId,
        title: 'Atomic Rollback Case',
        correlationId: 'corr-atomic-retry',
      });
      await txIdemRepo.complete({
        userId: userAId,
        endpoint,
        key,
        responseStatus: 201,
        responseBody: { id: created.id, title: created.title },
      });
      return created;
    });

    const casesAfterRetry = await appPool.query(
      `SELECT id FROM business_cases WHERE user_id = $1 AND title = 'Atomic Rollback Case'`,
      [userAId],
    );
    expect(casesAfterRetry.rows).toHaveLength(1);
    expect(casesAfterRetry.rows[0]?.id).toBe(retryResult.id);
  });

  it('coalesces concurrent same-key same-payload transactions and replays without duplicate mutation', async () => {
    const endpoint = 'POST /api/v1/cases';
    const key = 'tx-concurrent-1';
    const requestHash = hashCanonicalJson({ title: 'Concurrent Idempotent Case' });

    let markFirstClaimed!: () => void;
    const firstClaimed = new Promise<void>((res) => {
      markFirstClaimed = res;
    });
    let releaseFirst!: () => void;
    const gate = new Promise<void>((res) => {
      releaseFirst = res;
    });

    const runRequest = async (isFirst: boolean) =>
      withTransaction(appPool, async (client) => {
        const txCaseRepo = createPgCaseRepositoryForTransaction(client);
        const txIdemRepo = createPgIdempotencyRepository(client);

        const claim = await txIdemRepo.claim({ userId: userAId, endpoint, key, requestHash });
        if (isFirst) {
          markFirstClaimed();
          await gate;
        }

        if (claim.status === 'replay') {
          return { status: claim.responseStatus, body: claim.responseBody, replayed: true };
        }
        if (claim.status === 'conflict') {
          throw new Error(`Unexpected conflict: ${claim.reason}`);
        }

        const created = await txCaseRepo.createCase({
          userId: userAId,
          title: 'Concurrent Idempotent Case',
          correlationId: 'corr-concurrent-1',
        });
        const responseBody = { id: created.id, title: created.title };
        await txIdemRepo.complete({
          userId: userAId,
          endpoint,
          key,
          responseStatus: 201,
          responseBody,
        });
        return { status: 201, body: responseBody, replayed: false };
      });

    const p1 = runRequest(true);
    await firstClaimed;
    const p2 = runRequest(false);
    setTimeout(() => releaseFirst(), 50);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r2.status).toBe(201);
    expect(r2.body).toEqual(r1.body);

    const casesCreated = await appPool.query(
      `SELECT id FROM business_cases WHERE user_id = $1 AND title = 'Concurrent Idempotent Case'`,
      [userAId],
    );
    expect(casesCreated.rows).toHaveLength(1);
  });

  it('rejects same-key different-payload and safely retries after pre-commit mutation failure', async () => {
    const endpoint = 'POST /api/v1/cases';
    const key = 'tx-fail-before-commit-1';
    const hashA = hashCanonicalJson({ title: 'Pre-Commit Fail Case' });
    const hashB = hashCanonicalJson({ title: 'Different Payload Case' });

    // Failure before commit (audit correlationId > 200 chars) rolls back claim + mutation
    await expect(
      withTransaction(appPool, async (client) => {
        const txCaseRepo = createPgCaseRepositoryForTransaction(client);
        const txIdemRepo = createPgIdempotencyRepository(client);

        const claim = await txIdemRepo.claim({
          userId: userAId,
          endpoint,
          key,
          requestHash: hashA,
        });
        expect(claim).toEqual({ status: 'claimed' });

        await txCaseRepo.createCase({
          userId: userAId,
          title: 'Pre-Commit Fail Case',
          correlationId: 'x'.repeat(201),
        });
      }),
    ).rejects.toThrow();

    // Retry with same key succeeds
    const succeeded = await withTransaction(appPool, async (client) => {
      const txCaseRepo = createPgCaseRepositoryForTransaction(client);
      const txIdemRepo = createPgIdempotencyRepository(client);

      const claim = await txIdemRepo.claim({
        userId: userAId,
        endpoint,
        key,
        requestHash: hashA,
      });
      expect(claim).toEqual({ status: 'claimed' });

      const created = await txCaseRepo.createCase({
        userId: userAId,
        title: 'Pre-Commit Fail Case',
        correlationId: 'corr-precommit-ok',
      });
      await txIdemRepo.complete({
        userId: userAId,
        endpoint,
        key,
        responseStatus: 201,
        responseBody: { id: created.id, title: created.title },
      });
      return created;
    });

    // Completed request replays original response
    const replay = await withTransaction(appPool, async (client) => {
      const txIdemRepo = createPgIdempotencyRepository(client);
      return txIdemRepo.claim({ userId: userAId, endpoint, key, requestHash: hashA });
    });
    expect(replay).toEqual({
      status: 'replay',
      responseStatus: 201,
      responseBody: { id: succeeded.id, title: succeeded.title },
    });

    // Same key with different payload returns payload_mismatch conflict
    const mismatch = await withTransaction(appPool, async (client) => {
      const txIdemRepo = createPgIdempotencyRepository(client);
      return txIdemRepo.claim({ userId: userAId, endpoint, key, requestHash: hashB });
    });
    expect(mismatch).toEqual({ status: 'conflict', reason: 'payload_mismatch' });
  });
});
