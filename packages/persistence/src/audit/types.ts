export type AuditActorKind = 'user' | 'system' | 'operator' | 'webhook';

export type AuditEntityType =
  | 'user'
  | 'business_case'
  | 'case_revision'
  | 'calculation_run'
  | 'rule_pack'
  | 'system';

export const AUDIT_ACTION_REGISTRY = {
  'auth.signed_in': ['ip_hash', 'user_agent'],
  'auth.signed_out': ['reason'],
  'case.created': ['case_id', 'template_id'],
  'case.archived': ['case_id'],
  'case.restored': ['case_id'],
  'case.deletion_requested': ['case_id', 'phase'],
  'case.purged': ['case_id', 'duration_ms'],
  'revision.saved': ['case_id', 'revision_no', 'inputs_hash'],
  'calculation.run_completed': ['revision_id', 'rule_pack_id', 'engine_version', 'results_hash'],
  'rule_pack.published': ['pack_key', 'version', 'content_hash'],
  'account.deletion_requested': ['user_id', 'phase'],
  'account.tombstoned': ['user_id'],
  'account.purged': ['user_id'],
  'export.downloaded': ['case_id', 'format', 'content_hash'],
  'admin.action': ['action_type', 'target_id', 'reason_code'],
} as const;

export type AuditActionCode = keyof typeof AUDIT_ACTION_REGISTRY;

export interface AuditEventInput {
  actorUserId?: string | null;
  actorKind: AuditActorKind;
  action: string;
  entityType?: AuditEntityType | null;
  entityId?: string | null;
  correlationId?: string | null;
  details?: Record<string, string | number | boolean | null>;
}

export interface AuditRecord {
  id: string;
  at: Date;
  actorUserId: string | null;
  actorKind: AuditActorKind;
  action: string;
  entityType: string | null;
  entityId: string | null;
  correlationId: string | null;
  details: Record<string, unknown> | null;
}
