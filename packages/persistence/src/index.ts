/**
 * @nimphy/persistence
 * Database client, schema migrations, and audit logging infrastructure (STEP-010).
 *
 * Adheres strictly to:
 * - P-01: Pure core, deterministic boundary.
 * - P-02: Simplicity first (modular monolith, lightweight runner without premature ORM).
 * - P-04: Immutability for evidence (triggers, non-updatable audit and revisions).
 * - P-06: Least privilege (separate app and purge roles).
 */

export const PERSISTENCE_MODULE_NAME = 'persistence';
export const PERSISTENCE_MODULE_VERSION = '0.1.0';

// Database Pool & Connection Lifecycle
export { createDatabasePool, closeDatabasePool, sanitizeErrorMessage } from './db/pool';
export type { DatabaseConfig, DatabasePool, DatabaseClient, SqlQueryClient } from './db/types';

// Migrations Runner & Types
export { runMigrations, loadMigrationFiles, computeSha256Checksum } from './migrations/runner';
export {
  bootstrapDatabase,
  BOOTSTRAP_ROLES_SQL,
  getBootstrapRolesSql,
  getBootstrapDatabaseSql,
  type RoleDriftPolicy,
  type BootstrapRolesOptions,
  type BootstrapOptions,
} from './migrations/bootstrap';
export type {
  MigrationFile,
  AppliedMigrationRecord,
  MigrationReport,
  MigrationSummaryItem,
  RunMigrationsOptions,
} from './migrations/types';

// Audit Log Writer & Contracts
export { writeAuditEvent, validateAuditEvent, AuditValidationError } from './audit/audit-writer';
export {
  AUDIT_ACTION_REGISTRY,
  type AuditActorKind,
  type AuditEntityType,
  type AuditActionCode,
  type AuditEventInput,
  type AuditRecord,
} from './audit/types';

// User Identity Mapping Repository (STEP-011)
export {
  findUserByIdpSubject,
  findOrCreateUserByIdpSubject,
  createPgUserRepository,
} from './users/user-repository';
export type {
  AppUserStatus,
  AppUserRecord,
  ProvisionUserInput,
  ProvisionUserResult,
  UserRepository,
} from './users/types';
