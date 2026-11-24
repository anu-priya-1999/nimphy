import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AuditValidationError,
  createDatabasePool,
  runMigrations,
  validateAuditEvent,
  writeAuditEvent,
} from '../../packages/persistence/src/index';
import { createIsolatedTestDb, MIGRATIONS_DIR } from './test-helper';

describe('Database Foundation — Audit Writer Tests', () => {
  let testDbUrl: string;
  let dropTestDb: () => Promise<void>;
  let pool: Pool;

  beforeAll(async () => {
    const isolated = await createIsolatedTestDb('audit');
    testDbUrl = isolated.testDbUrl;
    dropTestDb = isolated.dropTestDb;
    pool = createDatabasePool({ connectionString: testDbUrl });
    await runMigrations(pool, { migrationsDir: MIGRATIONS_DIR });
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (dropTestDb) await dropTestDb();
  });

  it('persists a valid structured audit event and returns database identity and timestamp', async () => {
    const client = await pool.connect();
    try {
      const record = await writeAuditEvent(client, {
        actorUserId: '00000000-0000-0000-0000-000000000001',
        actorKind: 'user',
        action: 'case.created',
        entityType: 'business_case',
        entityId: 'case_uuid_123',
        correlationId: 'req_abc123',
        details: {
          case_id: 'case_uuid_123',
          template_id: 'kdp_standard',
        },
      });

      expect(record.id).toBeDefined();
      expect(Number(record.id)).toBeGreaterThan(0);
      expect(record.at).toBeInstanceOf(Date);
      expect(record.action).toBe('case.created');
      expect(record.actorKind).toBe('user');
      expect(record.entityType).toBe('business_case');
      expect(record.entityId).toBe('case_uuid_123');
      expect(record.correlationId).toBe('req_abc123');
      expect(record.details).toEqual({
        case_id: 'case_uuid_123',
        template_id: 'kdp_standard',
      });
    } finally {
      client.release();
    }
  });

  it('rejects an invalid actor kind', () => {
    expect(() =>
      validateAuditEvent({
        // @ts-expect-error invalid actorKind
        actorKind: 'superadmin',
        action: 'case.created',
      }),
    ).toThrowError(AuditValidationError);
  });

  it('rejects an unknown action code not in the allow-list registry', () => {
    expect(() =>
      validateAuditEvent({
        actorKind: 'system',
        action: 'unknown.action.code',
      }),
    ).toThrowError(AuditValidationError);
  });

  it('rejects an invalid entity type', () => {
    expect(() =>
      validateAuditEvent({
        actorKind: 'system',
        action: 'case.created',
        // @ts-expect-error invalid entityType
        entityType: 'order_payment',
      }),
    ).toThrowError(AuditValidationError);
  });

  it('rejects disallowed detail keys for an action', () => {
    expect(() =>
      validateAuditEvent({
        actorKind: 'user',
        action: 'case.archived',
        details: {
          case_id: 'case_1',
          unexpected_key: 'foo',
        },
      }),
    ).toThrowError(AuditValidationError);
  });

  it('rejects prohibited PII or sensitive keys (email, name, title, password, secret, prompt)', () => {
    const prohibitedKeys = [
      'user_email',
      'full_name',
      'case_title',
      'password',
      'api_secret',
      'user_prompt',
      'raw_payload',
    ];

    for (const key of prohibitedKeys) {
      expect(() =>
        validateAuditEvent({
          actorKind: 'user',
          action: 'auth.signed_in',
          details: {
            ip_hash: 'abc',
            [key]: 'sensitive_data',
          },
        }),
      ).toThrowError(AuditValidationError);
    }
  });

  it('rejects non-primitive detail values (nested objects, arrays)', () => {
    expect(() =>
      validateAuditEvent({
        actorKind: 'operator',
        action: 'admin.action',
        details: {
          action_type: 'kill_switch',
          // @ts-expect-error nested object
          reason_code: { nested: 'object' },
        },
      }),
    ).toThrowError(AuditValidationError);

    expect(() =>
      validateAuditEvent({
        actorKind: 'operator',
        action: 'admin.action',
        details: {
          action_type: 'kill_switch',
          // @ts-expect-error nested array
          reason_code: ['array', 'value'],
        },
      }),
    ).toThrowError(AuditValidationError);
  });

  it('allows application role (nimphy_app) to write audit events via writeAuditEvent but not update or delete', async () => {
    const client = await pool.connect();
    try {
      await client.query('SET ROLE nimphy_app;');

      const record = await writeAuditEvent(client, {
        actorKind: 'system',
        action: 'revision.saved',
        entityType: 'case_revision',
        entityId: 'rev_999',
        details: {
          case_id: 'case_100',
          revision_no: 2,
          inputs_hash: 'sha256_dummy',
        },
      });

      expect(record.id).toBeDefined();

      // Directly modifying audit row fails
      await expect(
        client.query("UPDATE audit_log SET details = '{}' WHERE id = $1;", [record.id]),
      ).rejects.toThrow();

      await expect(
        client.query('DELETE FROM audit_log WHERE id = $1;', [record.id]),
      ).rejects.toThrow();
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('strictly prohibits direct INSERT on audit_log by application role (nimphy_app)', async () => {
    const client = await pool.connect();
    try {
      await client.query('SET ROLE nimphy_app;');

      // Direct INSERT attempt must be blocked at database permission level
      await expect(
        client.query(
          "INSERT INTO audit_log (actor_kind, action) VALUES ('system', 'case.created');",
        ),
      ).rejects.toThrow(/permission denied for table audit_log/i);
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('database write function rejects unauthorized action code and disallowed detail keys', async () => {
    const client = await pool.connect();
    try {
      await client.query('SET ROLE nimphy_app;');

      // Unknown action rejected by DB function
      await expect(
        client.query(
          "SELECT * FROM nimphy_write_audit_log(null, 'system', 'evil.unregistered_action', null, null, null, null);",
        ),
      ).rejects.toThrow(/disallowed audit action/i);

      // Disallowed detail key for valid action rejected by DB function
      await expect(
        client.query(
          "SELECT * FROM nimphy_write_audit_log(null, 'system', 'case.archived', null, null, null, '{\"unauthorized_key\": \"value\"}');",
        ),
      ).rejects.toThrow(/Disallowed key "unauthorized_key" for action "case.archived"/i);

      // Non-scalar detail value rejected by DB function
      await expect(
        client.query(
          'SELECT * FROM nimphy_write_audit_log(null, \'system\', \'admin.action\', null, null, null, \'{"action_type": "kill", "target_id": "1", "reason_code": {"nested": "obj"}}\');',
        ),
      ).rejects.toThrow(/must have scalar primitive value/i);
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('demonstrates that sensitive-looking values under allowed keys are accepted by schema, proving value sanitization is an application responsibility', async () => {
    const client = await pool.connect();
    try {
      await client.query('SET ROLE nimphy_app;');

      // Detail keys are allow-listed ('reason' for 'auth.signed_out'), but value contains sensitive text
      const sensitiveDetails = {
        reason:
          'User user@example.com signed out with token eyJhbGciOiJIUzI1Ni... and password SecretPass123! Prompt: system instructions',
      };

      // Both TypeScript writer and DB function allow this because allow-list checks keys and scalar bounds, not free-text value semantics
      const record = await writeAuditEvent(client, {
        actorKind: 'user',
        action: 'auth.signed_out',
        details: sensitiveDetails,
      });

      expect(record.id).toBeDefined();
      expect(record.details).toEqual(sensitiveDetails);

      // Verify that prohibited KEYS (like 'password' or 'token') are strictly rejected
      expect(() =>
        validateAuditEvent({
          actorKind: 'user',
          action: 'auth.signed_out',
          details: {
            // @ts-expect-error prohibited key
            password: 'SecretPass123!',
          },
        }),
      ).toThrowError(AuditValidationError);
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });
});
