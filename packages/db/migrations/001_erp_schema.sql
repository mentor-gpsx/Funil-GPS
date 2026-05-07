-- Migration: 001_erp_schema.sql
-- ERP Financial Core: 3 Core Tables + Constraints + Triggers
-- Created: 2026-05-06
-- Status: Initial schema deployment

-- ============================================================================
-- 1. CHART OF ACCOUNTS (Plano de Contas)
-- ============================================================================

CREATE TABLE chart_of_accounts (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES chart_of_accounts(tenant_id, id)
);

-- ============================================================================
-- 2. JOURNAL ENTRIES (Diário de Lançamentos)
-- ============================================================================

CREATE TABLE journal_entries (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  description VARCHAR(500),
  reference VARCHAR(100),
  posted_at TIMESTAMP,
  posted_by UUID,
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  reversal_of UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, reversal_of) REFERENCES journal_entries(tenant_id, id),
  CHECK (posted_at IS NULL OR posted_by IS NOT NULL)
);

-- ============================================================================
-- 3. JOURNAL ENTRY LINES (Linhas do Lançamento)
-- ============================================================================

CREATE TABLE journal_entry_lines (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL,
  account_id UUID NOT NULL,
  debit NUMERIC(18, 2) NOT NULL DEFAULT 0.00 CHECK (debit >= 0),
  credit NUMERIC(18, 2) NOT NULL DEFAULT 0.00 CHECK (credit >= 0),
  line_order INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, entry_id) REFERENCES journal_entries(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id),
  UNIQUE (tenant_id, entry_id, line_order),
  -- Ensure one-sided lines: debit XOR credit (not both)
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0))
);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Trigger 1: Enforce balanced entry (SUM(debit) = SUM(credit) per entry)
CREATE OR REPLACE FUNCTION enforce_balanced_entry()
RETURNS TRIGGER AS $$
DECLARE
  total_debit NUMERIC;
  total_credit NUMERIC;
  entry_id UUID;
  tenant_id UUID;
BEGIN
  entry_id := COALESCE(NEW.entry_id, OLD.entry_id);
  tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO total_debit, total_credit
  FROM journal_entry_lines
  WHERE tenant_id = enforce_balanced_entry.tenant_id
    AND entry_id = enforce_balanced_entry.entry_id;

  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Journal entry % is not balanced. Debit: %, Credit: %',
      entry_id, total_debit, total_credit;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger 2: Prevent mutations on posted entries (immutability)
CREATE OR REPLACE FUNCTION block_posted_mutation()
RETURNS TRIGGER AS $$
DECLARE
  is_posted BOOLEAN;
BEGIN
  -- Check if the entry is already posted
  SELECT (posted_at IS NOT NULL)
  INTO is_posted
  FROM journal_entries
  WHERE tenant_id = NEW.tenant_id AND id = NEW.entry_id;

  IF is_posted THEN
    RAISE EXCEPTION 'Cannot modify lines of posted entry %', NEW.entry_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger 3: Ensure one-sided lines (debit XOR credit)
CREATE OR REPLACE FUNCTION enforce_one_sided_lines()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.debit > 0 AND NEW.credit > 0) THEN
    RAISE EXCEPTION 'Line must be one-sided: either debit OR credit, not both';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATTACH TRIGGERS
-- ============================================================================

CREATE TRIGGER journal_entry_lines_balance_check
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION enforce_balanced_entry();

CREATE TRIGGER journal_entry_lines_immutability_check
BEFORE INSERT OR UPDATE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION block_posted_mutation();

CREATE TRIGGER journal_entry_lines_one_sided_check
BEFORE INSERT OR UPDATE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION enforce_one_sided_lines();

-- ============================================================================
-- COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE chart_of_accounts IS 'Plano de contas: hierárquico, multi-tenant com RLS';
COMMENT ON TABLE journal_entries IS 'Diário de lançamentos: imutável após posting';
COMMENT ON TABLE journal_entry_lines IS 'Linhas do lançamento: double-entry bookkeeping';

COMMENT ON COLUMN journal_entries.posted_at IS 'NULL = draft, timestamp = posted (imutável)';
COMMENT ON COLUMN journal_entries.is_reversed IS 'true se este é um lançamento de reversão';
COMMENT ON COLUMN journal_entry_lines.debit IS 'Débito (deve ser XOR com credit)';
COMMENT ON COLUMN journal_entry_lines.credit IS 'Crédito (deve ser XOR com debit)';

-- ============================================================================
-- Schema deployment complete
-- Next: 002_rls_policies.sql (RLS setup)
-- ============================================================================
