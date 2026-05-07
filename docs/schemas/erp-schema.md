# ERP Financial Core Schema

**Date:** 2026-05-06  
**Status:** Phase 1 MVP - Implemented & Tested

---

## 📊 3 Core Tables

### 1. `chart_of_accounts` (Plano de Contas)
- **Composite PK:** (tenant_id, id)
- **Unique:** (tenant_id, code) per tenant
- **Hierarchy:** parent_id self-reference
- **Account Types:** asset | liability | equity | revenue | expense
- **RLS:** Tenant isolation via policy

### 2. `journal_entries` (Diário de Lançamentos)
- **Composite PK:** (tenant_id, id)
- **Status:** posted_at = NULL (draft) | timestamp (posted, immutable)
- **Reversal:** is_reversed + reversal_of for audit trail
- **Immutability Trigger:** block_posted_mutation()
- **RLS:** Tenant isolation via policy

### 3. `journal_entry_lines` (Linhas do Lançamento)
- **Composite PK:** (tenant_id, id)
- **One-Sided Lines:** debit XOR credit (trigger enforced)
- **Balance Enforcement:** SUM(debit) = SUM(credit) per entry (trigger)
- **RLS:** Tenant isolation via policy

---

## 🔐 Security (5 Layers)

1. **RLS Policies** - Database enforces tenant isolation
2. **Composite PKs** - FK graphs cannot cross tenant boundaries
3. **Middleware** - `SET LOCAL app.current_tenant` per request
4. **Triggers** - Immutability + balance enforcement
5. **Audit Logs** - Hash chain tampering detection (Phase 2)

---

## 📈 5 Critical Indices

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| 1 | journal_entries | (tenant_id, entry_date DESC) | Report queries by date |
| 2 | journal_entry_lines | (tenant_id, account_id, entry_id) | Ledger details |
| 3 | chart_of_accounts | (tenant_id, code) UNIQUE | Account lookup |
| 4 | journal_entries | (tenant_id, posted_at) PARTIAL | Audit filtering |
| 5 | journal_entry_lines | (tenant_id, entry_id) | Entry detail view |

---

## 🎯 Acceptance Criteria Status

- [x] PostgreSQL schema deployed (3 tables)
- [x] RLS policies enforced
- [x] 5 critical indices created
- [x] Database triggers deployed
- [x] Test data created (2 tenants)
- [x] Cross-tenant isolation documented

---

## ✅ Migration Files

| File | Status | Content |
|------|--------|---------|
| 001_erp_schema.sql | ✅ | Tables + triggers + FKs |
| 002_rls_policies.sql | ✅ | RLS policies |
| 003_indices.sql | ✅ | 5 critical indices |
| 004_partitioning.sql | ✅ | Partitioning strategy (deferred) |

---

## 🧪 Validation

Run cross-tenant isolation tests:
```bash
psql -U postgres < packages/db/validation/cross-tenant-isolation.sql
```

Expected results:
- Tenant A: 6 accounts, 2 entries
- Tenant B: 3 accounts, 1 entry
- Cross-tenant INSERT: Blocked (RLS error)
- Imbalanced entry: Blocked (trigger error)

---

**Next Phase:** Story 1.2 (Chart of Accounts API)
