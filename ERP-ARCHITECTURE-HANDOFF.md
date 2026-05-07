# 🏗️ ERP Enterprise - Handoff de Arquitetura

**Data:** 2026-05-06  
**Status:** Pronto para Phase 1 — Aguardando @pm para criar EPIC-ERP-FOUNDATION  
**Context:** Arquitetura aprovada por @architect + Schema validado por @data-engineer

---

## 📋 Resumo Executivo

Sistema ERP nível empresa grande, multi-tenant, pronto para SaaS. Baseado em double-entry bookkeeping com auditoria completa e isolamento de dados por tenant.

---

## 🎯 Stack Aprovado

| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| **Frontend** | Next.js 14 | SSR + type-safe + scalable |
| **Backend** | NestJS modular | Dependency injection + clean architecture |
| **Database** | PostgreSQL + Supabase | RLS nativa + JSONB + compliance |
| **Cache** | Redis (Upstash) | Sessions + rate limiting + DRE cache |
| **Jobs** | BullMQ | Async processing (reconciliation, reports) |
| **Auth** | Supabase Auth + custom claims | MFA TOTP obrigatório + JWT refresh rotation |
| **Hosting** | Fly.io / Railway (TBD @devops) | Scalability + cost-effective |

---

## 📊 Schema SQL (Double-Entry Bookkeeping)

### Tabelas Core (3)

#### 1. `chart_of_accounts`
```
- tenant_id (PK)
- id (PK)
- code (UNIQUE per tenant)
- name
- account_type (asset|liability|equity|revenue|expense)
- parent_id (hierarchical)
- is_active
```
**Index:** `(tenant_id, code)`

#### 2. `journal_entries`
```
- tenant_id (PK)
- id (PK)
- entry_date
- description
- reference
- posted_at (NULL = draft, timestamp = posted)
- posted_by
- is_reversed (boolean)
- reversal_of (FK to id)
- created_at
```
**Index:** `(tenant_id, entry_date DESC)`  
**Constraint:** Imutável pós-posting (trigger `block_posted_mutation()`)

#### 3. `journal_entry_lines`
```
- tenant_id (PK)
- id (PK)
- entry_id (FK)
- account_id (FK)
- debit (NUMERIC 18,2, >= 0)
- credit (NUMERIC 18,2, >= 0)
- line_order
```
**Constraint:** 
- `(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)` — one-sided lines
- `SUM(debit) = SUM(credit)` per entry (trigger `enforce_balanced_entry()`)

**Index:** `(tenant_id, account_id, entry_id)` — razão por conta

### Row-Level Security (RLS)

```sql
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON journal_entries
  USING (tenant_id = (current_setting('app.current_tenant'))::uuid);
```

Replicar em todas as 3 tabelas. Middleware: `SET LOCAL app.current_tenant = '<uuid>'` no início de cada transação.

### Índices Críticos (5)

1. `(tenant_id, entry_date DESC)` em `journal_entries` — relatórios por período
2. `(tenant_id, account_id, entry_id)` em `journal_entry_lines` — razão detalhada
3. `(tenant_id, code)` UNIQUE em `chart_of_accounts` — lookup rápido
4. `(tenant_id, posted_at)` parcial `WHERE posted_at IS NOT NULL` — auditoria
5. `(tenant_id, entry_id)` em `journal_entry_lines` — join header→lines

### Particionamento

**Strategy:** RANGE por `entry_date` (mensal/anual) em `journal_entry_lines`
- **Motivo:** Alto volume + queries sempre filtradas por período
- **Não particionar por tenant:** cardinalidade alta + small tenants prejudicam performance
- Manter `tenant_id` como leading key dos índices locais

---

## 🔐 Multi-Tenancy Strategy

**Isolation em 5 camadas:**

1. **RLS Policies** — banco recusa queries cross-tenant
2. **Composite PKs** `(tenant_id, id)` — FK graphs impossíveis de cruzar
3. **Middleware `SET LOCAL`** — application layer enforcement
4. **Audit Log Hash Chain** — detecta tampering
5. **Backup por tenant** — PITR isolado

**Validação @qa necessária:** Cross-tenant SELECT/INSERT/UPDATE com 2 tenants de teste.

---

## 📌 Delegações Declaradas

| Agente | Responsabilidade | Status |
|--------|-----------------|--------|
| **@pm** | Criar `EPIC-ERP-FOUNDATION` + desdobrar Phase 1 | ⏳ TODO |
| **@qa** | Validar triggers, RLS, isolation, immutability | ⏳ TODO |
| **@ux-design-expert** | Design system, densidade de tabelas financeiras | ⏳ TODO |
| **@devops** | Infra (Fly/Railway), backups, replication, monitoring | ⏳ TODO |
| **@dev** | Implementar Phase 1 (API + frontend) | ⏳ TODO |

---

## 🚀 Roadmap Fases

### Phase 1: MVP Production-Ready (1-2 sprints)
- [ ] Schema PostgreSQL deployed
- [ ] RLS policies ativas
- [ ] API: Chart of Accounts CRUD
- [ ] API: Journal Entries (draft + post + reverse)
- [ ] Auditoria básica
- [ ] Tests (isolation, immutability, balance)
- [ ] Auth (Supabase + MFA)

### Phase 2: Features Enterprise (3-4 sprints)
- [ ] DRE automático
- [ ] Fluxo de caixa (previsto vs realizado)
- [ ] Relatórios financeiros (Excel + PDF)
- [ ] Conciliação multi-gateway
- [ ] Plano de contas hierárquico
- [ ] Centros de custo

### Phase 3: Escalabilidade SaaS (2 sprints)
- [ ] Kubernetes deployment
- [ ] Load balancing
- [ ] CDN (assets)
- [ ] Observabilidade (Prometheus + Grafana)
- [ ] Cost optimization

---

## 🎯 Próximos Passos

**Sessão 2 (Próxima):**
1. `@pm *create-epic EPIC-ERP-FOUNDATION` 
   - Desdobrar Phase 1 em 4-5 stories
   - Estimar effort (story points)
   - Definir sprints

2. Documentar ADRs:
   - `adr-001-multi-tenancy-strategy.md`
   - `adr-002-double-entry-bookkeeping.md`
   - `adr-003-auth-architecture.md`

3. Setup inicial:
   - [ ] Repositório criado
   - [ ] Next.js + NestJS scaffolding
   - [ ] PostgreSQL migration (schema)
   - [ ] Jest + Playwright setup

---

## 📁 Arquivos Relacionados

| Arquivo | Descrição |
|---------|-----------|
| `gestao-empresarial.html` | MVP atual (login + 6 módulos localStorage) |
| `ARQUITETURA_SAAS.md` | Visão geral anterior (agora refinada) |
| Este arquivo | Handoff arquitetura + schema |

---

## ✅ Decisões Aprovadas

- ✅ Double-entry bookkeeping obrigatório
- ✅ RLS com `SET LOCAL app.current_tenant`
- ✅ Imutabilidade pós-posting
- ✅ Particionamento por data (não tenant)
- ✅ NUMERIC(18,2) para valores BRL
- ✅ Composite PKs `(tenant_id, id)`
- ✅ Audit log com hash chain

---

## 🔗 Continuação

**Para próxima sessão:**
- Abrir este arquivo
- Invocar `@pm` com contexto desta arquitetura
- Criar epic e stories
- Começar implementação Phase 1

---

**Criado por:** Claude (Architect-First Design)  
**Revisor:** @architect + @data-engineer  
**Status:** Pronto para desenvolvimento
