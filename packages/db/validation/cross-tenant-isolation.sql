-- Validation: cross-tenant-isolation.sql
-- Test RLS enforcement: verify Tenant A cannot see Tenant B data
-- Run with superuser privileges to bypass RLS, then test with tenant roles

-- ============================================================================
-- TEST 1: SELECT ISOLATION
-- ============================================================================

-- Set context to Tenant A
SET app.current_tenant = '550e8400-e29b-41d4-a716-446655440001'::UUID;

-- Should see only Tenant A accounts (6 total)
SELECT COUNT(*) as tenant_a_accounts FROM chart_of_accounts;
-- Expected: 6

-- Should see only Tenant A entries (2 total)
SELECT COUNT(*) as tenant_a_entries FROM journal_entries;
-- Expected: 2

-- Switch to Tenant B
SET app.current_tenant = '550e8400-e29b-41d4-a716-446655440002'::UUID;

-- Should see only Tenant B accounts (3 total)
SELECT COUNT(*) as tenant_b_accounts FROM chart_of_accounts;
-- Expected: 3

-- Should see only Tenant B entries (1 total)
SELECT COUNT(*) as tenant_b_entries FROM journal_entries;
-- Expected: 1

-- ============================================================================
-- TEST 2: INSERT ISOLATION
-- ============================================================================

-- Set context to Tenant A
SET app.current_tenant = '550e8400-e29b-41d4-a716-446655440001'::UUID;

-- Try to insert entry for Tenant B (should fail with RLS error)
-- This SHOULD raise: 'new row violates row-level security policy for table "journal_entries"'
-- BEGIN;
-- INSERT INTO journal_entries (tenant_id, id, entry_date, description, reference)
-- VALUES ('550e8400-e29b-41d4-a716-446655440002'::UUID, gen_random_uuid(), '2026-05-03', 'Malicious entry', 'HACK-001');
-- ROLLBACK;

-- ============================================================================
-- TEST 3: TRIGGER ENFORCEMENT
-- ============================================================================

SET app.current_tenant = '550e8400-e29b-41d4-a716-446655440001'::UUID;

-- Create imbalanced entry (should fail due to enforce_balanced_entry trigger)
-- This SHOULD raise: 'Journal entry ... is not balanced'
-- BEGIN;
-- INSERT INTO journal_entries (tenant_id, id, entry_date, description, reference)
-- VALUES ('550e8400-e29b-41d4-a716-446655440001'::UUID, gen_random_uuid(), '2026-05-04', 'Imbalanced', 'BAD-001');
-- INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, debit, credit, line_order)
-- VALUES
--   ('550e8400-e29b-41d4-a716-446655440001'::UUID, gen_random_uuid(), last_entry_id, account_a_id, 100.00, 0, 1),
--   ('550e8400-e29b-41d4-a716-446655440001'::UUID, gen_random_uuid(), last_entry_id, account_b_id, 50.00, 0, 2);
-- ROLLBACK;

-- ============================================================================
-- VALIDATION SUMMARY
-- ============================================================================

-- Run these queries to verify isolation:
-- 1. SELECT with Tenant A context → 6 accounts, 2 entries
-- 2. SELECT with Tenant B context → 3 accounts, 1 entry
-- 3. TRY INSERT for wrong tenant → RLS error (expected)
-- 4. TRY INSERT imbalanced entry → trigger error (expected)

-- If all 4 pass → RLS + Trigger isolation VALIDATED ✅
