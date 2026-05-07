-- Migration: 004_partitioning.sql
-- RANGE Partitioning by entry_date
-- Created: 2026-05-06

-- ============================================================================
-- APPROACH: Partition journal_entry_lines by entry_date
-- REASON: High volume table + queries always filtered by date
-- STRATEGY: Monthly partitions (configurable to annual if needed)
-- ============================================================================

/*
NOTE: PostgreSQL table partitioning is complex.
This script demonstrates the structure but requires careful execution:

1. BACKUP production before running
2. Test on staging first
3. Plan downtime (partitioning existing table may lock)
4. Monitor performance post-partition

For now, we document the partitioning scheme.
When data reaches 100K+ rows, enable partitioning.
*/

-- ============================================================================
-- CURRENT APPROACH: Non-partitioned (works well until ~10M rows)
-- ============================================================================

-- For initial MVP (Phase 1), keep table non-partitioned:
-- - Easier development & testing
-- - Adequate performance for startup
-- - Indices (003_indices.sql) provide sufficient optimization

-- Indices handle queries efficiently:
-- - (tenant_id, entry_date DESC) - report queries are fast
-- - (tenant_id, account_id, entry_id) - ledger queries are fast

-- ============================================================================
-- FUTURE: RANGE Partitioning Template (for Phase 2+)
-- ============================================================================

/*
When data grows (>500K entries), enable partitioning:

ALTER TABLE journal_entry_lines
SET SCHEMA public_partitioned;

CREATE TABLE journal_entry_lines_partitioned (
  tenant_id UUID NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL,
  account_id UUID NOT NULL,
  debit NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  credit NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  line_order INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, entry_id) REFERENCES journal_entries(tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id)
) PARTITION BY RANGE (EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at));

-- Monthly partitions for current year
CREATE TABLE journal_entry_lines_2026_01
  PARTITION OF journal_entry_lines_partitioned
  FOR VALUES FROM (2026, 1) TO (2026, 2);

CREATE TABLE journal_entry_lines_2026_02
  PARTITION OF journal_entry_lines_partitioned
  FOR VALUES FROM (2026, 2) TO (2026, 3);

-- ... (repeat for all 12 months)

-- Migration strategy (zero-downtime with pg_partman extension):
-- 1. Install pg_partman
-- 2. Create partition schema
-- 3. Enable partition maintenance
-- 4. Auto-create new partitions monthly
*/

-- ============================================================================
-- MONITORING & DECISIONS
-- ============================================================================

/*
When to Partition (Decision Matrix):

  Row Count    | Query Time | Recommended Action
  -------------|------------|-------------------
  < 100K       | < 50ms     | No partitioning (current)
  100K-500K    | 50-100ms   | Monitor, prepare partitioning plan
  500K-2M      | 100-500ms  | Implement partitioning
  > 2M         | > 500ms    | Partition immediately + archive old data

Current Status: Non-partitioned (MVP-appropriate)
Next Review: End of Phase 1 (measure actual data volume)
*/

-- ============================================================================
-- DOCUMENTATION FOR FUTURE PHASES
-- ============================================================================

COMMENT ON TABLE journal_entry_lines IS
'RANGE partition strategy (entry_date) reserved for Phase 2+.
Currently non-partitioned: indices sufficient for MVP.
Monitor growth: if >500K rows, enable RANGE partitioning by date.';

-- ============================================================================
-- Partitioning migration complete
-- Next: 005_audit_log_schema.sql (Audit logging)
-- ============================================================================
