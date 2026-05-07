-- Migration: 002_rls_policies.sql
-- Row-Level Security for Multi-Tenancy
-- Created: 2026-05-06

-- ============================================================================
-- Enable RLS on all 3 core tables
-- ============================================================================

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICY: chart_of_accounts
-- Tenants can only see their own accounts
-- ============================================================================

CREATE POLICY tenant_isolation_accounts ON chart_of_accounts
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- RLS POLICY: journal_entries
-- Tenants can only see their own entries
-- ============================================================================

CREATE POLICY tenant_isolation_entries ON journal_entries
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- RLS POLICY: journal_entry_lines
-- Tenants can only see their own lines
-- ============================================================================

CREATE POLICY tenant_isolation_lines ON journal_entry_lines
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

-- ============================================================================
-- USAGE NOTES
-- ============================================================================

/*
Middleware Integration:
Every request must execute this at the start of a transaction:

  SET LOCAL app.current_tenant = '<tenant_uuid_from_jwt>';

This sets the session variable for the duration of the transaction.
RLS policies will automatically filter based on this variable.

Example (NestJS middleware):

  @Injectable()
  export class TenantMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
      const tenantId = req.user.tenantId; // from JWT custom claim
      const db = getDataSource();

      await db.query("SET LOCAL app.current_tenant = $1", [tenantId]);
      next();
    }
  }

Testing RLS:
1. Connect as superuser or role with BYPASSRLS privilege
2. Create test tenants: tenant-a-uuid, tenant-b-uuid
3. For each test, set app.current_tenant and verify:
   - SELECT returns only that tenant's rows
   - INSERT/UPDATE/DELETE outside tenant fails with RLS error
   - Foreign key references within tenant work
*/

-- ============================================================================
-- RLS deployment complete
-- Next: 003_indices.sql (Critical indices)
-- ============================================================================
