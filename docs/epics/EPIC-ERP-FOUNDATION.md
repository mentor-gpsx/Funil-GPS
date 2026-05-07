# 🏗️ EPIC-ERP-FOUNDATION

**Epic ID:** EPIC-ERP-FOUNDATION  
**Status:** DRAFT → Awaiting @sm story creation  
**Created:** 2026-05-06  
**Target Completion:** Phase 1 in 1-2 sprints (4 weeks)  
**Priority:** P0 (Critical Path)

---

## 📋 Epic Goal

Implement production-ready ERP financial core with multi-tenant isolation, double-entry bookkeeping, and complete auditoria. Foundation for enterprise SaaS platform.

## 🎯 Success Criteria

- [ ] PostgreSQL schema deployed with RLS policies active
- [ ] Chart of Accounts API (CRUD) fully functional
- [ ] Journal Entries API (draft → post → reverse) with balance enforcement
- [ ] Authentication (Supabase + MFA TOTP) integrated
- [ ] Audit logging with immutability guarantees
- [ ] All tests passing (isolation, immutability, balance)
- [ ] CodeRabbit: 0 CRITICAL issues
- [ ] Multi-tenant cross-tenant isolation validated by @qa

---

## 📊 Phase 1: MVP Production-Ready (1-2 sprints)

### Story 1.1: Database Schema & RLS Implementation
**Status:** PENDING @sm  
**Story Points:** 8  
**Assigned Agents:** @data-engineer (DDL) → @qa (RLS validation)

**Acceptance Criteria:**
- PostgreSQL schema deployed (3 core tables: chart_of_accounts, journal_entries, journal_entry_lines)
- 5 critical indices created and optimized
- RLS policies active on all 3 tables with tenant_id isolation
- Partitioning configured (RANGE by entry_date on journal_entry_lines)
- 2 test tenants created for cross-tenant validation
- All triggers deployed (enforce_balanced_entry, block_posted_mutation)

**Deliverables:**
- `packages/db/migrations/001_erp_schema.sql`
- `packages/db/seed/test-tenants.sql`
- RLS policy documentation

**Quality Gates:**
- CodeRabbit: security scan on DDL
- @qa: Cross-tenant SELECT/INSERT/UPDATE isolation test
- @qa: Trigger behavior validation

---

### Story 1.2: Chart of Accounts API (CRUD)
**Status:** PENDING @sm  
**Story Points:** 5  
**Assigned Agents:** @dev (backend) → @qa (gate)

**Acceptance Criteria:**
- GET /accounts - List with pagination, filtering
- GET /accounts/:id - Single account retrieval
- POST /accounts - Create new account with validation
- PATCH /accounts/:id - Update (non-posted entries only)
- DELETE /accounts/:id - Soft delete (is_active flag)
- Hierarchical plano de contas support
- RLS enforcement: tenants see only own accounts
- Input validation: code uniqueness per tenant, account_type enum

**Deliverables:**
- `packages/backend/src/modules/accounts/accounts.controller.ts`
- `packages/backend/src/modules/accounts/accounts.service.ts`
- `packages/backend/src/modules/accounts/dto/` (CreateAccountDto, UpdateAccountDto)
- Unit tests: validation, RLS isolation

**Quality Gates:**
- CodeRabbit: API design review
- @qa: Request/response validation
- npm test: 100% coverage on accounts module

---

### Story 1.3: Journal Entries API (Draft → Post → Reverse)
**Status:** PENDING @sm  
**Story Points:** 13  
**Assigned Agents:** @dev (backend) → @qa (gate)

**Acceptance Criteria:**
- POST /entries - Create draft entry (posted_at = NULL)
- POST /entries/:id/post - Move to posted (posted_at = timestamp, posted_by set)
- POST /entries/:id/reverse - Create reversal entry (is_reversed=true, reversal_of set)
- GET /entries - List with filtering by date range, status
- GET /entries/:id/lines - Fetch all lines for entry
- Immutability: posted entries cannot be edited (trigger block)
- Balance enforcement: SUM(debit) = SUM(credit) per entry (trigger)
- Journal entry lines: one-sided entries (debit XOR credit, not both)
- RLS: Tenants see only own entries

**Deliverables:**
- `packages/backend/src/modules/entries/entries.controller.ts`
- `packages/backend/src/modules/entries/entries.service.ts`
- `packages/backend/src/modules/entries/entry-lines.service.ts`
- `packages/backend/src/modules/entries/dto/` (CreateEntryDto, PostEntryDto, ReverseEntryDto)
- Integration tests: balance validation, posting workflow, reversal chain

**Quality Gates:**
- CodeRabbit: Balance logic review, immutability enforcement
- @qa: Posted entry immutability validation
- @qa: Reversal chain integrity
- npm test: 100% coverage on entries module

---

### Story 1.4: Authentication & Authorization (Supabase + MFA)
**Status:** PENDING @sm  
**Story Points:** 8  
**Assigned Agents:** @dev (backend + frontend) → @qa (gate)

**Acceptance Criteria:**
- Supabase Auth integration (email/password)
- MFA TOTP mandatory for all users (setup on first login)
- JWT token issuance with refresh token rotation
- Custom claims: tenant_id, role injected into JWT
- Middleware: SET LOCAL app.current_tenant = '<tenant_from_jwt>' on every request
- Session timeout: 30 min idle, 24h max
- Password reset flow
- Frontend: Login form + MFA setup wizard + Session management

**Deliverables:**
- `packages/backend/src/modules/auth/auth.controller.ts`
- `packages/backend/src/modules/auth/auth.service.ts`
- `packages/backend/src/modules/auth/supabase.config.ts`
- `packages/backend/src/middleware/tenant-isolation.middleware.ts`
- `packages/frontend/src/components/LoginForm.tsx`
- `packages/frontend/src/components/MFASetup.tsx`

**Quality Gates:**
- CodeRabbit: Security scan (no hardcoded secrets, JWT validation)
- @qa: MFA flow validation
- @qa: JWT refresh token rotation
- Browser console: 0 errors on auth pages

---

### Story 1.5: Audit Logging & Immutability
**Status:** PENDING @sm  
**Story Points:** 5  
**Assigned Agents:** @data-engineer (audit schema) → @dev (API) → @qa (gate)

**Acceptance Criteria:**
- Audit log table: tracks all mutations (INSERT/UPDATE/DELETE on financial tables)
- Fields: table_name, operation, old_value, new_value, changed_by, changed_at, hash
- Hash chain: current_hash = SHA256(prev_hash + old_value + new_value + timestamp)
- Read-only policy: tenants cannot modify audit logs
- GET /audit - List audit entries with filtering
- Hash validation: detect tampering via chain breaks
- RLS: Tenants see only own audit entries

**Deliverables:**
- `packages/db/migrations/002_audit_log.sql`
- `packages/backend/src/modules/audit/audit.service.ts`
- `packages/backend/src/modules/audit/audit.controller.ts`
- Hash validation utility: `packages/backend/src/utils/audit-hash.ts`

**Quality Gates:**
- CodeRabbit: Hash implementation review
- @qa: Hash chain integrity validation
- npm test: tampering detection scenarios

---

## 📌 Story Delegation

| Story | Owner | Dependencies |
|-------|-------|--------------|
| 1.1 (Schema) | @data-engineer | None |
| 1.2 (Accounts API) | @dev | Depends on 1.1 |
| 1.3 (Entries API) | @dev | Depends on 1.1, 1.2 |
| 1.4 (Auth) | @dev | Depends on 1.1 |
| 1.5 (Audit) | @dev | Depends on 1.1 |

**Implementation Order:**
1. **Sprint 1:** 1.1 (schema) + 1.4 (auth) in parallel
2. **Sprint 2:** 1.2 (accounts) + 1.3 (entries) + 1.5 (audit)

---

## 🔐 Quality Gates (CodeRabbit Integration)

**Pre-Story Quality Checks:**
- SQL DDL: Security review (injection, RLS correctness)
- API endpoints: Input validation, error handling
- Authentication: No hardcoded secrets, JWT signature validation
- Audit logging: Hash chain integrity, immutability

**Post-Story QA Gate:**
- 0 CRITICAL CodeRabbit issues
- npm run lint: PASS
- npm run typecheck: PASS
- npm test: PASS + coverage >80%
- Cross-tenant isolation: @qa validation with 2 test tenants

---

## 📈 Roadmap (Phases 2-3)

**Phase 2 (3-4 sprints):** Features Enterprise
- DRE automático, Fluxo de caixa, Relatórios (Excel/PDF)
- Conciliação multi-gateway, Plano de contas hierárquico, Centros de custo

**Phase 3 (2 sprints):** Escalabilidade SaaS
- Kubernetes, Load balancing, CDN, Observabilidade (Prometheus + Grafana)

---

## 📋 Next Actions

1. **@sm:** Create individual user stories from this epic (5 stories → 1.1 to 1.5)
2. **@dev:** Setup Next.js + NestJS scaffolding
3. **@data-engineer:** Deploy PostgreSQL migrations to dev environment
4. **@devops:** Configure CI/CD pipeline with CodeRabbit gates
5. **@qa:** Setup test tenants and cross-tenant validation framework

---

**Created by:** Morgan (PM)  
**Approved by:** @architect + @data-engineer  
**Status:** Ready for @sm story breakdown
