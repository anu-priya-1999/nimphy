import { parseUserId } from '@nimphy/domain';
import type { SqlQueryClient } from '../db/types';
import type {
  AppUserRecord,
  AppUserStatus,
  ProvisionUserInput,
  ProvisionUserResult,
  UserRepository,
} from './types';

interface AppUserRow {
  id: string;
  idp_subject: string | null;
  email: string | null;
  status: string;
  created_at: Date | string;
}

const VALID_USER_STATUSES = new Set<AppUserStatus>(['active', 'pending_deletion', 'deleted']);

function normalizeIdpSubject(idpSubject: string): string {
  const trimmed = idpSubject.trim();
  if (trimmed.length === 0) {
    throw new Error('idpSubject must be a non-empty string');
  }
  return trimmed;
}

function normalizeEmail(email: string | null): string | null {
  if (email === null) return null;
  const trimmed = email.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function mapAppUserRow(row: AppUserRow): AppUserRecord {
  if (!VALID_USER_STATUSES.has(row.status as AppUserStatus)) {
    throw new Error(`Unexpected app_users.status value: ${row.status}`);
  }

  return {
    id: parseUserId(row.id),
    idpSubject: row.idp_subject,
    email: row.email,
    status: row.status as AppUserStatus,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

/**
 * Look up a local user exclusively by their external IdP subject (`app_users.idp_subject`).
 * Never matches or merges accounts by email.
 */
export async function findUserByIdpSubject(
  client: SqlQueryClient,
  idpSubject: string,
): Promise<AppUserRecord | null> {
  const normalizedSubject = normalizeIdpSubject(idpSubject);
  const result = await client.query<AppUserRow>(
    `SELECT id, idp_subject, email, status, created_at
     FROM app_users
     WHERE idp_subject = $1
     LIMIT 1`,
    [normalizedSubject],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapAppUserRow(row);
}

/**
 * Atomically find or provision a local `app_users` row for a verified Clerk subject.
 * Uses `ON CONFLICT (idp_subject) WHERE idp_subject IS NOT NULL DO NOTHING` to handle
 * concurrent first-time sign-ins safely without duplicating rows or overwriting status.
 */
export async function findOrCreateUserByIdpSubject(
  client: SqlQueryClient,
  input: ProvisionUserInput,
): Promise<ProvisionUserResult> {
  const normalizedSubject = normalizeIdpSubject(input.idpSubject);
  const normalizedEmail = normalizeEmail(input.email);

  const inserted = await client.query<AppUserRow>(
    `INSERT INTO app_users (idp_subject, email, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (idp_subject) WHERE idp_subject IS NOT NULL DO NOTHING
     RETURNING id, idp_subject, email, status, created_at`,
    [normalizedSubject, normalizedEmail],
  );

  const insertedRow = inserted.rows[0];
  if (insertedRow) {
    return {
      user: mapAppUserRow(insertedRow),
      created: true,
    };
  }

  const existing = await findUserByIdpSubject(client, normalizedSubject);
  if (!existing) {
    throw new Error(
      `Failed to resolve app_users row after conflict for subject ${normalizedSubject}`,
    );
  }

  return {
    user: existing,
    created: false,
  };
}

export function createPgUserRepository(client: SqlQueryClient): UserRepository {
  return {
    findByIdpSubject: (idpSubject: string) => findUserByIdpSubject(client, idpSubject),
    findOrCreateByIdpSubject: (input: ProvisionUserInput) =>
      findOrCreateUserByIdpSubject(client, input),
  };
}
