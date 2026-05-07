-- Seed: test-tenants.sql
-- Create 2 test tenants for cross-tenant isolation validation
-- Created: 2026-05-06

-- ============================================================================
-- TEST TENANT A
-- ============================================================================

INSERT INTO chart_of_accounts (tenant_id, id, code, name, account_type, parent_id)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'a1000000-0000-0000-0000-000000000001'::UUID, '1000', 'Ativo Circulante', 'asset', NULL),
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'a1000000-0000-0000-0000-000000000002'::UUID, '1100', 'Caixa', 'asset', 'a1000000-0000-0000-0000-000000000001'::UUID),
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'a1000000-0000-0000-0000-000000000003'::UUID, '2000', 'Passivo', 'liability', NULL),
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'a1000000-0000-0000-0000-000000000004'::UUID, '3000', 'Capital', 'equity', NULL),
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'a1000000-0000-0000-0000-000000000005'::UUID, '4000', 'Receita', 'revenue', NULL),
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'a1000000-0000-0000-0000-000000000006'::UUID, '5000', 'Despesa', 'expense', NULL);

-- Draft entry for Tenant A
INSERT INTO journal_entries (tenant_id, id, entry_date, description, reference, posted_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'b1000000-0000-0000-0000-000000000001'::UUID, '2026-05-01', 'Abertura de caixa', 'OPEN-001', NULL);

-- Lines for draft entry
INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, debit, credit, line_order)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'c1000000-0000-0000-0000-000000000001'::UUID, 'b1000000-0000-0000-0000-000000000001'::UUID, 'a1000000-0000-0000-0000-000000000002'::UUID, 1000.00, 0, 1),
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'c1000000-0000-0000-0000-000000000002'::UUID, 'b1000000-0000-0000-0000-000000000001'::UUID, 'a1000000-0000-0000-0000-000000000004'::UUID, 0, 1000.00, 2);

-- Posted entry for Tenant A
INSERT INTO journal_entries (tenant_id, id, entry_date, description, reference, posted_at, posted_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'b1000000-0000-0000-0000-000000000002'::UUID, '2026-05-02', 'Venda de serviço', 'INV-001', NOW(), 'admin-a'::UUID);

INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, debit, credit, line_order)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'c1000000-0000-0000-0000-000000000003'::UUID, 'b1000000-0000-0000-0000-000000000002'::UUID, 'a1000000-0000-0000-0000-000000000002'::UUID, 500.00, 0, 1),
  ('550e8400-e29b-41d4-a716-446655440001'::UUID, 'c1000000-0000-0000-0000-000000000004'::UUID, 'b1000000-0000-0000-0000-000000000002'::UUID, 'a1000000-0000-0000-0000-000000000005'::UUID, 0, 500.00, 2);

-- ============================================================================
-- TEST TENANT B
-- ============================================================================

INSERT INTO chart_of_accounts (tenant_id, id, code, name, account_type, parent_id)
VALUES
  ('550e8400-e29b-41d4-a716-446655440002'::UUID, 'b1000000-0000-0000-0000-000000000001'::UUID, '1000', 'Ativo', 'asset', NULL),
  ('550e8400-e29b-41d4-a716-446655440002'::UUID, 'b1000000-0000-0000-0000-000000000002'::UUID, '2000', 'Passivo', 'liability', NULL),
  ('550e8400-e29b-41d4-a716-446655440002'::UUID, 'b1000000-0000-0000-0000-000000000003'::UUID, '3000', 'Receita', 'revenue', NULL);

INSERT INTO journal_entries (tenant_id, id, entry_date, description, reference, posted_at, posted_by)
VALUES
  ('550e8400-e29b-41d4-a716-446655440002'::UUID, 'd1000000-0000-0000-0000-000000000001'::UUID, '2026-05-01', 'Entrada do Tenant B', 'TB-001', NOW(), 'admin-b'::UUID);

INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, debit, credit, line_order)
VALUES
  ('550e8400-e29b-41d4-a716-446655440002'::UUID, 'd1000000-0000-0000-0000-000000000001'::UUID, 'd1000000-0000-0000-0000-000000000001'::UUID, 'b1000000-0000-0000-0000-000000000001'::UUID, 2000.00, 0, 1),
  ('550e8400-e29b-41d4-a716-446655440002'::UUID, 'd1000000-0000-0000-0000-000000000002'::UUID, 'd1000000-0000-0000-0000-000000000001'::UUID, 'b1000000-0000-0000-0000-000000000002'::UUID, 0, 2000.00, 2);

-- ============================================================================
-- SEED DATA COMPLETE
-- ============================================================================

-- Summary:
-- Tenant A (550e8400-e29b-41d4-a716-446655440001):
--   - 6 chart of accounts
--   - 2 journal entries (1 draft, 1 posted)
--   - 4 journal lines total

-- Tenant B (550e8400-e29b-41d4-a716-446655440002):
--   - 3 chart of accounts
--   - 1 journal entry (posted)
--   - 2 journal lines
