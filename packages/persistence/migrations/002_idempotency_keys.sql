-- Nimphy Migration 002: Idempotency Keys (STEP-012)
-- Forward-only numbered migration adding idempotency_keys table for replay protection.

CREATE TABLE idempotency_keys (
  key text NOT NULL,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  request_hash text NOT NULL,
  response_status int,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint, key)
);

CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys (created_at);

-- Least-privilege grants for nimphy_app and explicit revocation from nimphy_purge
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO nimphy_app;
REVOKE INSERT, UPDATE, DELETE ON idempotency_keys FROM nimphy_purge;
