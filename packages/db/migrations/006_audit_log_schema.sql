-- Migration: 006_audit_log_schema.sql
-- Audit Logging & Immutability: tamper-evident audit_logs table with hash chain
-- Created: 2026-05-07
-- Story: 1.5 (Audit Logging & Immutability)
--
-- Note on numbering: 005 is owned by users_auth (Story 1.4). Story 1.5 originally
-- planned 005/006 but was renumbered to 006/007 to avoid the conflict.

-- ============================================================================
-- 1. AUDIT_LOGS TABLE (Append-only, hash-chained)
-- ============================================================================
--
-- Design rationale:
-- - tenant_id is part of the PK so RLS can scope by current_setting('app.current_tenant').
--   We use the same composite-PK pattern as the other ERP tables (chart_of_accounts,
--   journal_entries, journal_entry_lines).
-- - changed_at uses TIMESTAMPTZ (not TIMESTAMP). Audit trails are forensic — we MUST
--   record the absolute UTC moment, not the server's local interpretation.
-- - hash is CHAR(64) because SHA-256 hex output is exactly 64 hex chars.
-- - prev_hash is stored alongside hash so the chain can be re-walked without an
--   ORDER BY scan; verifying record N only requires fetching record N-1's hash and
--   re-computing SHA-256(prev_hash || old_value || new_value || timestamp).
-- - old_value/new_value are JSONB for queryability (filter on JSON path) and
--   compactness (binary representation).

CREATE TABLE IF NOT EXISTS audit_logs (
  tenant_id    UUID         NOT NULL,
  id           BIGSERIAL    NOT NULL,
  table_name   VARCHAR(63)  NOT NULL,                                  -- pg max identifier length
  operation    VARCHAR(10)  NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id    UUID         NOT NULL,                                  -- the PK of the mutated row
  old_value    JSONB,                                                  -- NULL for INSERT
  new_value    JSONB,                                                  -- NULL for DELETE
  changed_by   UUID,                                                   -- NULL when system/trigger has no user context
  changed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  prev_hash    CHAR(64)     NOT NULL DEFAULT '',                       -- empty string for first record per tenant
  hash         CHAR(64)     NOT NULL,                                  -- SHA-256(prev_hash || old || new || ts)

  PRIMARY KEY (tenant_id, id)
);

-- ============================================================================
-- 2. INDICES (per AC: time range and table_name lookups)
-- ============================================================================

-- Hot path: "show me audit entries between dateA and dateB for tenant T" (DESC for recency).
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time
  ON audit_logs (tenant_id, changed_at DESC);

-- Hot path: "show me all changes to journal_entries for tenant T".
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_table
  ON audit_logs (tenant_id, table_name, changed_at DESC);

-- Lookup by mutated record (e.g., "history of this specific journal entry").
CREATE INDEX IF NOT EXISTS idx_audit_logs_record
  ON audit_logs (tenant_id, table_name, record_id, changed_at DESC);

-- ============================================================================
-- 3. ROW-LEVEL SECURITY (Read-only for tenants — INSERT-only via triggers)
-- ============================================================================
--
-- RLS contract:
--   SELECT: tenants see their own audit entries.
--   INSERT: allowed (the trigger function runs as the row owner via SECURITY DEFINER
--           in 007_audit_triggers.sql). The WITH CHECK clause enforces tenant scoping.
--   UPDATE: forbidden — no policy granted, FORCE RLS denies.
--   DELETE: forbidden — no policy granted, FORCE RLS denies.
--
-- This satisfies AC "Tenants cannot modify their own audit logs" and
-- "Only INSERT allowed (no UPDATE/DELETE)".

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- SELECT: tenants read only their own entries.
CREATE POLICY tenant_isolation_audit_select ON audit_logs
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- INSERT: trigger-driven. WITH CHECK ensures even a misbehaving trigger cannot
-- write across tenant boundaries.
CREATE POLICY tenant_isolation_audit_insert ON audit_logs
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

-- Deliberately NO UPDATE policy.
-- Deliberately NO DELETE policy.
-- FORCE ROW LEVEL SECURITY blocks UPDATE/DELETE for all roles except superuser/BYPASSRLS.

-- ============================================================================
-- 4. DOCUMENTATION (column-level COMMENTs — surfaced in psql \d+ and pg_dump)
-- ============================================================================

COMMENT ON TABLE audit_logs IS
  'Tamper-evident audit trail. Append-only via triggers in 007_audit_triggers.sql. '
  'Each row is hash-chained: hash = SHA256(prev_hash || old_value || new_value || changed_at). '
  'Validation walks the chain per (tenant_id, table_name, record_id) ordered by id ASC.';

COMMENT ON COLUMN audit_logs.hash IS
  'SHA-256 hex of SHA256(prev_hash || COALESCE(old_value::text, '''') || COALESCE(new_value::text, '''') || changed_at::text). '
  'See audit-hash.ts and 007_audit_triggers.sql:compute_audit_hash for the canonical formula.';

COMMENT ON COLUMN audit_logs.prev_hash IS
  'hash of the previous row in this chain. Empty string for the first record per (tenant_id, table_name, record_id).';

-- ============================================================================
-- Migration complete
-- Next: 007_audit_triggers.sql (trigger function + triggers on the 3 ERP tables)
-- ============================================================================
