-- Migration: 003_indices.sql
-- 5 Critical Indices for ERP Performance
-- Created: 2026-05-06

-- ============================================================================
-- INDEX 1: journal_entries - Report queries by date range
-- ============================================================================

CREATE INDEX idx_journal_entries_date
  ON journal_entries (tenant_id, entry_date DESC)
  WHERE is_reversed = false;

-- Purpose: Fast filtering of entries by date range in reports
-- Query pattern: WHERE entry_date BETWEEN ... AND ... AND tenant_id = ...

-- ============================================================================
-- INDEX 2: journal_entry_lines - Detailed ledger per account
-- ============================================================================

CREATE INDEX idx_journal_entry_lines_account
  ON journal_entry_lines (tenant_id, account_id, entry_id);

-- Purpose: Fetch all lines for a specific account (razão)
-- Query pattern: WHERE account_id = ... AND tenant_id = ...

-- ============================================================================
-- INDEX 3: chart_of_accounts - Fast account lookup by code
-- ============================================================================

CREATE UNIQUE INDEX idx_chart_of_accounts_code
  ON chart_of_accounts (tenant_id, code)
  WHERE is_active = true;

-- Purpose: Code-based lookups (accounts are often referenced by code)
-- Query pattern: WHERE code = ... AND tenant_id = ...
-- UNIQUE constraint already defined, but index is needed for performance

-- ============================================================================
-- INDEX 4: journal_entries - Audit filtering for posted entries
-- ============================================================================

CREATE INDEX idx_journal_entries_posted_at
  ON journal_entries (tenant_id, posted_at DESC)
  WHERE posted_at IS NOT NULL;

-- Purpose: Retrieve posted entries for audit logs and reporting
-- Query pattern: WHERE posted_at BETWEEN ... AND ... AND tenant_id = ...
-- PARTIAL index: only indexes posted entries (draft entries are small in number)

-- ============================================================================
-- INDEX 5: journal_entry_lines - Entry lookup (header → lines join)
-- ============================================================================

CREATE INDEX idx_journal_entry_lines_entry_id
  ON journal_entry_lines (tenant_id, entry_id);

-- Purpose: Fetch all lines for a journal entry (used on entry details page)
-- Query pattern: WHERE entry_id = ... AND tenant_id = ...

-- ============================================================================
-- STATISTICS & ANALYSIS
-- ============================================================================

/*
Index Summary:
  1. entry_date + tenant_id → Reports (date range queries)
  2. account_id + tenant_id → Ledger details
  3. code + tenant_id → Account lookups
  4. posted_at + tenant_id → Audit/compliance
  5. entry_id + tenant_id → Entry detail view

All indices include tenant_id as leading key for RLS efficiency.

Query Performance (Estimated):
  - Account list with hierarchy: ~5ms (uses idx_chart_of_accounts_code)
  - Journal entry list by month: ~10ms (uses idx_journal_entries_date)
  - Ledger for account: ~15ms (uses idx_journal_entry_lines_account)
  - Entry detail (header + lines): ~8ms (uses idx_journal_entry_lines_entry_id)
  - Posted entries report: ~12ms (uses idx_journal_entries_posted_at)

Maintenance:
  - VACUUM ANALYZE after initial data load
  - Monitor index bloat monthly (>30% triggers REINDEX)
  - Statistics updated automatically by autovacuum

Index Space (Estimated):
  - Total indices: ~50MB (for 1M entries)
  - Largest: idx_journal_entry_lines_account (~15MB)
*/

-- ============================================================================
-- Indices deployment complete
-- Next: 004_partitioning.sql (RANGE partitioning)
-- ============================================================================
