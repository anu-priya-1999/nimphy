-- Nimphy Migration 001: Initial Schema
-- Forward-only numbered migration creating exactly seven domain tables (STEP-010)
-- Tables: app_users, business_cases, case_revisions, evidence_items, rule_packs, calculation_runs, audit_log

-- Revoke CREATE on schema public from PUBLIC to prevent untrusted object creation in security-definer search_path
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Table 1: app_users
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idp_subject text,                       -- null once tombstoned
  email text,                             -- null once tombstoned
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_deletion', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  purge_attempts int NOT NULL DEFAULT 0,
  purge_last_error text,
  CHECK (status <> 'deleted' OR (idp_subject IS NULL AND email IS NULL AND deleted_at IS NOT NULL))
);

CREATE UNIQUE INDEX app_users_idp_subject_uq ON app_users (idp_subject) WHERE idp_subject IS NOT NULL;
CREATE INDEX app_users_pending_deletion_idx ON app_users (deletion_requested_at) WHERE status = 'pending_deletion';

-- Table 2: business_cases
CREATE TABLE business_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'pending_deletion')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deletion_requested_at timestamptz,
  purge_attempts int NOT NULL DEFAULT 0,
  purge_last_error text
);

CREATE INDEX business_cases_user_updated_idx ON business_cases (user_id, updated_at DESC) WHERE status <> 'pending_deletion';
CREATE INDEX business_cases_pending_deletion_idx ON business_cases (deletion_requested_at) WHERE status = 'pending_deletion';

-- Table 3: case_revisions
CREATE TABLE case_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES business_cases(id) ON DELETE CASCADE,
  revision_no int NOT NULL CHECK (revision_no > 0),
  inputs jsonb NOT NULL,
  inputs_schema_version int NOT NULL,
  inputs_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, revision_no)
);

-- Table 4: evidence_items
CREATE TABLE evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES case_revisions(id) ON DELETE CASCADE,
  field_path text,
  provenance text NOT NULL CHECK (provenance IN ('user_input', 'official_fact', 'estimate', 'assumption')),
  kind text NOT NULL CHECK (kind IN ('quote', 'url', 'note', 'document_ref')),
  summary text NOT NULL CHECK (char_length(summary) <= 2000),
  source_ref text,
  captured_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_items_revision_idx ON evidence_items (revision_id);

-- Table 5: rule_packs
CREATE TABLE rule_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_key text NOT NULL,
  version text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  source_ref text NOT NULL,
  source_retrieved_at date NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_key, version),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Table 6: calculation_runs
CREATE TABLE calculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES case_revisions(id) ON DELETE CASCADE,
  rule_pack_id uuid NOT NULL REFERENCES rule_packs(id) ON DELETE NO ACTION,
  engine_version text NOT NULL,
  scenario_params jsonb NOT NULL,
  results jsonb NOT NULL,
  trace jsonb NOT NULL,
  results_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, rule_pack_id, engine_version, results_hash)
);

CREATE INDEX calculation_runs_revision_created_idx ON calculation_runs (revision_id, created_at DESC);

-- Table 7: audit_log (no foreign keys; ids and codes only)
CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'system', 'operator', 'webhook')),
  action text NOT NULL,
  entity_type text,
  entity_id text,
  correlation_id text,
  details jsonb
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Immutability Triggers
-- -----------------------------------------------------------------------------

-- Trigger 1: case_revisions immutability
CREATE OR REPLACE FUNCTION nimphy_enforce_case_revision_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'case_revisions rows are immutable and cannot be updated' USING ERRCODE = 'P0001';
  ELSIF TG_OP = 'DELETE' THEN
    IF current_setting('nimphy.allow_purge', true) <> 'on' THEN
      RAISE EXCEPTION 'case_revisions rows can only be deleted via the authorized purge procedure' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_case_revisions_immutability
BEFORE UPDATE OR DELETE ON case_revisions
FOR EACH ROW
EXECUTE FUNCTION nimphy_enforce_case_revision_immutability();

-- Trigger 2: calculation_runs immutability
CREATE OR REPLACE FUNCTION nimphy_enforce_calculation_run_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'calculation_runs rows are immutable and cannot be updated' USING ERRCODE = 'P0001';
  ELSIF TG_OP = 'DELETE' THEN
    IF current_setting('nimphy.allow_purge', true) <> 'on' THEN
      RAISE EXCEPTION 'calculation_runs rows can only be deleted via the authorized purge procedure' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_calculation_runs_immutability
BEFORE UPDATE OR DELETE ON calculation_runs
FOR EACH ROW
EXECUTE FUNCTION nimphy_enforce_calculation_run_immutability();

-- Trigger 3: audit_log append-only immutability
CREATE OR REPLACE FUNCTION nimphy_enforce_audit_log_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: updates and deletes are prohibited' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_audit_log_immutability
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION nimphy_enforce_audit_log_immutability();

-- Trigger 4: rule_packs published/retired immutability
CREATE OR REPLACE FUNCTION nimphy_enforce_rule_pack_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('published', 'retired') THEN
      IF NEW.content IS DISTINCT FROM OLD.content OR NEW.content_hash IS DISTINCT FROM OLD.content_hash THEN
        RAISE EXCEPTION 'Content and content_hash cannot be modified on published or retired rule packs' USING ERRCODE = 'P0001';
      END IF;
      IF NEW.pack_key IS DISTINCT FROM OLD.pack_key OR NEW.version IS DISTINCT FROM OLD.version THEN
        RAISE EXCEPTION 'Key and version cannot be modified on published or retired rule packs' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'retired') THEN
      RAISE EXCEPTION 'Published or retired rule packs cannot be deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_rule_packs_immutability
BEFORE UPDATE OR DELETE ON rule_packs
FOR EACH ROW
EXECUTE FUNCTION nimphy_enforce_rule_pack_immutability();

-- -----------------------------------------------------------------------------
-- Dedicated Purge Security Definer Functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION nimphy_purge_business_case(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  -- Lock the target case row before inspecting lifecycle status
  SELECT status INTO v_status
  FROM public.business_cases
  WHERE id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case % not found', p_case_id USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'pending_deletion' THEN
    RAISE EXCEPTION 'Case % is not pending deletion (status is %)', p_case_id, v_status USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('nimphy.allow_purge', 'on', true);
  DELETE FROM public.business_cases WHERE id = p_case_id AND status = 'pending_deletion';
END;
$$;

CREATE OR REPLACE FUNCTION nimphy_purge_app_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  -- 1. Lock the parent user row before checking lifecycle status
  SELECT status INTO v_status
  FROM public.app_users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  IF v_status <> 'pending_deletion' THEN
    RAISE EXCEPTION 'User % is not pending deletion (status is %)', p_user_id, v_status USING ERRCODE = 'P0001';
  END IF;

  -- 2. Lock relevant child business cases in consistent primary-key order
  PERFORM 1
  FROM public.business_cases
  WHERE user_id = p_user_id
  ORDER BY id
  FOR UPDATE;

  -- 3. Ensure user has no active or archived business cases after acquiring row locks
  IF EXISTS (
    SELECT 1
    FROM public.business_cases
    WHERE user_id = p_user_id AND status <> 'pending_deletion'
  ) THEN
    RAISE EXCEPTION 'User % has active business cases that are not pending deletion', p_user_id USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('nimphy.allow_purge', 'on', true);
  DELETE FROM public.app_users WHERE id = p_user_id AND status = 'pending_deletion';
END;
$$;

-- -----------------------------------------------------------------------------
-- Database-Enforced Allow-List Audit Log Writer Function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION nimphy_write_audit_log(
  p_actor_user_id uuid,
  p_actor_kind text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_correlation_id text,
  p_details jsonb
)
RETURNS audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_record audit_log;
  v_key text;
  v_val jsonb;
  v_val_type text;
BEGIN
  -- 1. Validate actor_kind
  IF p_actor_kind NOT IN ('user', 'system', 'operator', 'webhook') THEN
    RAISE EXCEPTION 'Invalid actor_kind "%"', p_actor_kind USING ERRCODE = '22023';
  END IF;

  -- 2. Validate entity_type (if provided)
  IF p_entity_type IS NOT NULL AND p_entity_type NOT IN ('user', 'business_case', 'case_revision', 'calculation_run', 'rule_pack', 'system') THEN
    RAISE EXCEPTION 'Invalid entity_type "%"', p_entity_type USING ERRCODE = '22023';
  END IF;

  -- 3. Validate string lengths on identifier fields
  IF p_entity_id IS NOT NULL AND char_length(p_entity_id) > 200 THEN
    RAISE EXCEPTION 'entity_id exceeds maximum length of 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_correlation_id IS NOT NULL AND char_length(p_correlation_id) > 200 THEN
    RAISE EXCEPTION 'correlation_id exceeds maximum length of 200 characters' USING ERRCODE = '22023';
  END IF;

  -- 4. Validate action code and action-specific detail keys
  IF p_details IS NOT NULL THEN
    IF jsonb_typeof(p_details) <> 'object' THEN
      RAISE EXCEPTION 'Audit details must be a non-null JSON object' USING ERRCODE = '22023';
    END IF;

    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_details) LOOP
      -- Prohibit PII/secret key patterns
      IF v_key ~* '(email|name|title|password|secret|token|prompt|completion|card|payload|raw|body)' THEN
        RAISE EXCEPTION 'Prohibited detail key "%" in audit log', v_key USING ERRCODE = '22023';
      END IF;

      -- Validate value types: only scalar (string, number, boolean, null)
      v_val_type := jsonb_typeof(v_val);
      IF v_val_type NOT IN ('string', 'number', 'boolean', 'null') THEN
        RAISE EXCEPTION 'Audit detail key "%" must have scalar primitive value, got %', v_key, v_val_type USING ERRCODE = '22023';
      END IF;

      -- Validate reasonable length on string values
      IF v_val_type = 'string' AND char_length(v_val #>> '{}') > 2000 THEN
        RAISE EXCEPTION 'Audit detail value for key "%" exceeds 2000 characters', v_key USING ERRCODE = '22023';
      END IF;

      -- Action-specific allowed keys validation:
      CASE p_action
        WHEN 'auth.signed_in' THEN
          IF v_key NOT IN ('ip_hash', 'user_agent') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'auth.signed_out' THEN
          IF v_key NOT IN ('reason') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'case.created' THEN
          IF v_key NOT IN ('case_id', 'template_id') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'case.archived' THEN
          IF v_key NOT IN ('case_id') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'case.restored' THEN
          IF v_key NOT IN ('case_id') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'case.deletion_requested' THEN
          IF v_key NOT IN ('case_id', 'phase') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'case.purged' THEN
          IF v_key NOT IN ('case_id', 'duration_ms') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'revision.saved' THEN
          IF v_key NOT IN ('case_id', 'revision_no', 'inputs_hash') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'calculation.run_completed' THEN
          IF v_key NOT IN ('revision_id', 'rule_pack_id', 'engine_version', 'results_hash') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'rule_pack.published' THEN
          IF v_key NOT IN ('pack_key', 'version', 'content_hash') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'account.deletion_requested' THEN
          IF v_key NOT IN ('user_id', 'phase') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'account.tombstoned' THEN
          IF v_key NOT IN ('user_id') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'account.purged' THEN
          IF v_key NOT IN ('user_id') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'export.downloaded' THEN
          IF v_key NOT IN ('case_id', 'format', 'content_hash') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        WHEN 'admin.action' THEN
          IF v_key NOT IN ('action_type', 'target_id', 'reason_code') THEN
            RAISE EXCEPTION 'Disallowed key "%" for action "%"', v_key, p_action USING ERRCODE = '22023';
          END IF;
        ELSE
          RAISE EXCEPTION 'Unknown or disallowed audit action "%"', p_action USING ERRCODE = '22023';
      END CASE;
    END LOOP;
  ELSE
    IF p_action NOT IN (
      'auth.signed_in', 'auth.signed_out',
      'case.created', 'case.archived', 'case.restored', 'case.deletion_requested', 'case.purged',
      'revision.saved', 'calculation.run_completed', 'rule_pack.published',
      'account.deletion_requested', 'account.tombstoned', 'account.purged',
      'export.downloaded', 'admin.action'
    ) THEN
      RAISE EXCEPTION 'Unknown or disallowed audit action "%"', p_action USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.audit_log (
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    correlation_id,
    details
  ) VALUES (
    p_actor_user_id,
    p_actor_kind,
    p_action,
    p_entity_type,
    p_entity_id,
    p_correlation_id,
    p_details
  )
  RETURNING * INTO v_new_record;

  RETURN v_new_record;
END;
$$;

-- -----------------------------------------------------------------------------
-- Least-Privilege Grants & Revocations
-- -----------------------------------------------------------------------------

-- Grants for application and purge roles
GRANT USAGE ON SCHEMA public TO nimphy_app;
GRANT USAGE ON SCHEMA public TO nimphy_purge;

GRANT SELECT, INSERT, UPDATE ON app_users TO nimphy_app;
REVOKE DELETE ON app_users FROM nimphy_app;

GRANT SELECT, INSERT, UPDATE ON business_cases TO nimphy_app;
REVOKE DELETE ON business_cases FROM nimphy_app;

GRANT SELECT, INSERT ON case_revisions TO nimphy_app;
REVOKE UPDATE, DELETE ON case_revisions FROM nimphy_app;

GRANT SELECT, INSERT, UPDATE ON evidence_items TO nimphy_app;
REVOKE DELETE ON evidence_items FROM nimphy_app;

GRANT SELECT ON rule_packs TO nimphy_app;
REVOKE INSERT, UPDATE, DELETE ON rule_packs FROM nimphy_app;

GRANT SELECT, INSERT ON calculation_runs TO nimphy_app;
REVOKE UPDATE, DELETE ON calculation_runs FROM nimphy_app;

-- audit_log: direct INSERT is revoked from nimphy_app; writes must pass through nimphy_write_audit_log
GRANT SELECT ON audit_log TO nimphy_app;
REVOKE INSERT, UPDATE, DELETE ON audit_log FROM nimphy_app;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO nimphy_app;

-- Revoke default PUBLIC execute on all sensitive and trigger functions
REVOKE ALL ON FUNCTION nimphy_purge_business_case(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION nimphy_purge_app_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION nimphy_enforce_case_revision_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION nimphy_enforce_calculation_run_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION nimphy_enforce_audit_log_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION nimphy_enforce_rule_pack_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION nimphy_write_audit_log(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;

-- Purge role permissions
GRANT EXECUTE ON FUNCTION nimphy_purge_business_case(uuid) TO nimphy_purge;
GRANT EXECUTE ON FUNCTION nimphy_purge_app_user(uuid) TO nimphy_purge;

-- Application role permissions on audit write function
GRANT EXECUTE ON FUNCTION nimphy_write_audit_log(uuid, text, text, text, text, text, jsonb) TO nimphy_app;

-- nimphy_purge role does not have direct table modification privileges
REVOKE INSERT, UPDATE, DELETE ON app_users FROM nimphy_purge;
REVOKE INSERT, UPDATE, DELETE ON business_cases FROM nimphy_purge;
REVOKE INSERT, UPDATE, DELETE ON case_revisions FROM nimphy_purge;
REVOKE INSERT, UPDATE, DELETE ON evidence_items FROM nimphy_purge;
REVOKE INSERT, UPDATE, DELETE ON rule_packs FROM nimphy_purge;
REVOKE INSERT, UPDATE, DELETE ON calculation_runs FROM nimphy_purge;
REVOKE INSERT, UPDATE, DELETE ON audit_log FROM nimphy_purge;

-- Prevent future functions/routines created by migration runner or nimphy_migrator from granting default EXECUTE to PUBLIC
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE nimphy_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE nimphy_migrator REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
