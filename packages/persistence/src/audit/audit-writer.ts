import type { SqlQueryClient } from '../db/types';
import {
  AUDIT_ACTION_REGISTRY,
  type AuditActionCode,
  type AuditActorKind,
  type AuditEntityType,
  type AuditEventInput,
  type AuditRecord,
} from './types';

const ALLOWED_ACTOR_KINDS: ReadonlySet<AuditActorKind> = new Set([
  'user',
  'system',
  'operator',
  'webhook',
]);

const ALLOWED_ENTITY_TYPES: ReadonlySet<AuditEntityType> = new Set([
  'user',
  'business_case',
  'case_revision',
  'calculation_run',
  'rule_pack',
  'system',
]);

const PROHIBITED_DETAIL_KEY_PATTERNS = [
  /email/i,
  /name/i,
  /title/i,
  /password/i,
  /secret/i,
  /token/i,
  /prompt/i,
  /completion/i,
  /card/i,
  /payload/i,
  /raw/i,
  /body/i,
];

export class AuditValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditValidationError';
  }
}

export function validateAuditEvent(event: AuditEventInput): void {
  // 1. Validate actorKind
  if (!ALLOWED_ACTOR_KINDS.has(event.actorKind)) {
    throw new AuditValidationError(
      `Invalid actor_kind "${event.actorKind}". Must be one of: ${Array.from(ALLOWED_ACTOR_KINDS).join(', ')}`,
    );
  }

  // 2. Validate action code against allow-list registry
  if (!(event.action in AUDIT_ACTION_REGISTRY)) {
    throw new AuditValidationError(
      `Unknown audit action code "${event.action}". Action is not registered in the audit allow-list.`,
    );
  }

  // 3. Validate entityType if provided
  if (event.entityType != null && !ALLOWED_ENTITY_TYPES.has(event.entityType)) {
    throw new AuditValidationError(
      `Invalid entity_type "${event.entityType}". Must be one of: ${Array.from(ALLOWED_ENTITY_TYPES).join(', ')}`,
    );
  }

  // 4. Validate string identifier length limits
  if (event.entityId != null && event.entityId.length > 200) {
    throw new AuditValidationError('entity_id exceeds maximum length of 200 characters.');
  }
  if (event.correlationId != null && event.correlationId.length > 200) {
    throw new AuditValidationError('correlation_id exceeds maximum length of 200 characters.');
  }

  // 5. Validate details against per-action allow-list
  if (event.details != null) {
    if (typeof event.details !== 'object' || Array.isArray(event.details)) {
      throw new AuditValidationError('Audit details must be a non-array JSON object.');
    }

    const actionCode = event.action as AuditActionCode;
    const allowedKeys = new Set<string>(AUDIT_ACTION_REGISTRY[actionCode]);

    for (const [key, value] of Object.entries(event.details)) {
      // Check for disallowed keys
      if (!allowedKeys.has(key)) {
        throw new AuditValidationError(
          `Disallowed detail key "${key}" for action "${event.action}". Allowed keys are: ${Array.from(allowedKeys).join(', ')}`,
        );
      }

      // Check for sensitive / PII key patterns
      for (const pattern of PROHIBITED_DETAIL_KEY_PATTERNS) {
        if (pattern.test(key)) {
          throw new AuditValidationError(
            `Prohibited detail key "${key}" detected. Audit log must never contain PII or secret fields.`,
          );
        }
      }

      // Values must be primitive or null (no nested objects or arrays)
      if (
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new AuditValidationError(
          `Invalid detail value type for key "${key}". Values must be primitive scalars (string, number, boolean) or null.`,
        );
      }

      // Validate string length on detail values
      if (typeof value === 'string' && value.length > 2000) {
        throw new AuditValidationError(
          `Audit detail value for key "${key}" exceeds maximum length of 2000 characters.`,
        );
      }
    }
  }
}

export async function writeAuditEvent(
  client: SqlQueryClient,
  event: AuditEventInput,
): Promise<AuditRecord> {
  validateAuditEvent(event);

  const queryText = `
    SELECT id, at, actor_user_id, actor_kind, action, entity_type, entity_id, correlation_id, details
    FROM nimphy_write_audit_log($1, $2, $3, $4, $5, $6, $7);
  `;

  const values = [
    event.actorUserId ?? null,
    event.actorKind,
    event.action,
    event.entityType ?? null,
    event.entityId ?? null,
    event.correlationId ?? null,
    event.details ? JSON.stringify(event.details) : null,
  ];

  const result = await client.query(queryText, values);
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to insert audit log record: no row returned.');
  }

  return {
    id: String(row.id),
    at: row.at instanceof Date ? row.at : new Date(row.at),
    actorUserId: row.actor_user_id,
    actorKind: row.actor_kind,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    correlationId: row.correlation_id,
    details: row.details,
  };
}
