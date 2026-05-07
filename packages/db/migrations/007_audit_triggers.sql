-- Migration: 007_audit_triggers.sql
-- Audit Logging & Immutability: triggers + hash function on the 3 ERP tables
-- Created: 2026-05-07
-- Story: 1.5 (Audit Logging & Immutability)
-- Depends on: 006_audit_log_schema.sql (audit_logs table)

-- ============================================================================
-- 1. HASH COMPUTATION FUNCTION
-- ============================================================================
--
-- IMPORTANT: This formula MUST stay byte-for-byte aligned with
-- packages/backend/src/utils/audit-hash.ts:computeAuditHash. Mismatches cause
-- silent validation failures.
--
-- Inputs are coerced to text using:
--   - JSONB::text for old_value / new_value (PG sorts JSONB keys deterministically,
--     producing canonical JSON identical to canonicalJson() in TS).
--   - to_char on changed_at with ISO-8601 + microseconds + UTC offset, e.g.
--     "2026-05-07T12:34:56.789012+00:00". This matches Date.toISOString() in JS
--     after we convert PG output (uses '+00' not '+00:00') — see note below.
--
-- The TS side handles both forms via String(changedAt).

CREATE OR REPLACE FUNCTION compute_audit_hash(
  p_prev_hash  TEXT,
  p_old_value  JSONB,
  p_new_value  JSONB,
  p_changed_at TIMESTAMPTZ
) RETURNS CHAR(64)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  old_str TEXT;
  new_str TEXT;
  ts_str  TEXT;
  payload TEXT;
BEGIN
  old_str := COALESCE(p_old_value::text, '');
  new_str := COALESCE(p_new_value::text, '');

  -- ISO-8601 with microsecond precision, UTC. Example: 2026-05-07T12:34:56.789012+00:00
  -- Matches JavaScript Date.toISOString() except for the timezone literal length.
  -- TS-side computeAuditHash() must format Date inputs identically; the safer path
  -- (used in our audit.service.ts) is to read changed_at out of the DB as text and
  -- pass that text verbatim into computeAuditHash, never round-tripping through Date.
  ts_str := to_char(p_changed_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

  payload := COALESCE(p_prev_hash, '') || old_str || new_str || ts_str;

  RETURN encode(digest(payload, 'sha256'), 'hex');
END;
$$;

-- digest() lives in pgcrypto. Most managed Postgres (Supabase, RDS) ship it.
-- If your environment lacks it, run: CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- We do that here defensively.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. AUDIT MUTATION TRIGGER FUNCTION
-- ============================================================================
--
-- Captures the old/new state of a row, looks up the previous hash for this
-- (tenant_id, table_name, record_id) chain, computes the new hash, and inserts
-- into audit_logs.
--
-- Why we chain per (tenant_id, table_name, record_id):
-- - A single global chain would force every audit insert to read the latest
--   chain entry across ALL records, killing concurrency.
-- - Per-record chaining lets us verify the integrity of a specific journal
--   entry's history independently — which is what compliance officers actually
--   ask for.
--
-- SECURITY DEFINER: lets the trigger insert into audit_logs even when RLS
-- otherwise blocks the calling user. The WITH CHECK policy on audit_logs still
-- enforces tenant_id matches the current_setting, preventing cross-tenant writes.
--
-- changed_by source:
--   1. Try current_setting('app.current_user_id') — set by the backend in the same
--      transaction where it sets app.current_tenant.
--   2. NULL if unset (e.g., direct DB ops, seeders). The audit row still records
--      the mutation; only the actor is unknown.

CREATE OR REPLACE FUNCTION audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id    UUID;
  v_record_id    UUID;
  v_old_jsonb    JSONB;
  v_new_jsonb    JSONB;
  v_prev_hash    CHAR(64);
  v_changed_at   TIMESTAMPTZ;
  v_changed_by   UUID;
  v_hash         CHAR(64);
BEGIN
  v_changed_at := NOW();

  -- Resolve actor (NULL when not set — direct DB session).
  BEGIN
    v_changed_by := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  -- Capture old/new and tenant_id depending on op.
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
    v_record_id := OLD.id;
    v_old_jsonb := to_jsonb(OLD);
    v_new_jsonb := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant_id := NEW.tenant_id;
    v_record_id := NEW.id;
    v_old_jsonb := NULL;
    v_new_jsonb := to_jsonb(NEW);
  ELSE  -- UPDATE
    v_tenant_id := NEW.tenant_id;
    v_record_id := NEW.id;
    v_old_jsonb := to_jsonb(OLD);
    v_new_jsonb := to_jsonb(NEW);
  END IF;

  -- Look up the previous hash in this chain (tenant_id, table_name, record_id).
  -- ORDER BY id DESC because BIGSERIAL is monotonic per row insert.
  -- Returns '' (empty) for the first record in the chain.
  SELECT hash
    INTO v_prev_hash
    FROM audit_logs
   WHERE tenant_id  = v_tenant_id
     AND table_name = TG_TABLE_NAME
     AND record_id  = v_record_id
   ORDER BY id DESC
   LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := '';
  END IF;

  v_hash := compute_audit_hash(v_prev_hash, v_old_jsonb, v_new_jsonb, v_changed_at);

  INSERT INTO audit_logs (
    tenant_id, table_name, operation, record_id,
    old_value, new_value, changed_by, changed_at,
    prev_hash, hash
  ) VALUES (
    v_tenant_id, TG_TABLE_NAME, TG_OP, v_record_id,
    v_old_jsonb, v_new_jsonb, v_changed_by, v_changed_at,
    v_prev_hash, v_hash
  );

  -- AFTER triggers ignore the return value, but plpgsql requires one for ROW triggers.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- ============================================================================
-- 3. ATTACH TRIGGERS TO THE 3 ERP TABLES
-- ============================================================================
--
-- AFTER triggers fire post-mutation, ensuring audit captures the row that
-- actually committed (subject to BEFORE-trigger transformations).

DROP TRIGGER IF EXISTS audit_chart_of_accounts ON chart_of_accounts;
CREATE TRIGGER audit_chart_of_accounts
  AFTER INSERT OR UPDATE OR DELETE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION audit_mutation();

DROP TRIGGER IF EXISTS audit_journal_entries ON journal_entries;
CREATE TRIGGER audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION audit_mutation();

DROP TRIGGER IF EXISTS audit_journal_entry_lines ON journal_entry_lines;
CREATE TRIGGER audit_journal_entry_lines
  AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION audit_mutation();

-- ============================================================================
-- 4. DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION compute_audit_hash(TEXT, JSONB, JSONB, TIMESTAMPTZ) IS
  'SHA-256 hex of (prev_hash || old::text || new::text || ISO8601(changed_at)). '
  'Matches packages/backend/src/utils/audit-hash.ts:computeAuditHash. '
  'Any change here MUST be mirrored in TS, or chain validation breaks silently.';

COMMENT ON FUNCTION audit_mutation() IS
  'Trigger that snapshots the mutated row into audit_logs with a hash chained per '
  '(tenant_id, table_name, record_id). SECURITY DEFINER bypasses calling-user RLS '
  'on insert; the audit_logs INSERT policy still enforces tenant_id == app.current_tenant.';

-- ============================================================================
-- Migration complete
-- ============================================================================
