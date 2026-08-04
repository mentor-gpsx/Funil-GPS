# Sistema de Comissão e Financeiro - Roadmap de Implementação

## Executive Summary

Você está criando um **Sistema Empresarial de Comissão e Financeiro** completamente isolado do Funil de Vendas.

**Stack:** Next.js (Frontend) + NestJS (Backend) + PostgreSQL + Redis + Docker + Turborepo
**Duração Estimada:** 8-10 semanas
**Equipe:** 1 Architect + 1-2 Backend + 1 Frontend + 1 QA

---

## 📋 Fase 1: Setup & Infraestrutura (Semanas 1-2)

### Sprint 1.1: Monorepo e CI/CD
- [ ] **Criar estrutura Turborepo**
  - `packages/ui`
  - `packages/types`
  - `packages/utils`
  - `packages/validators`
  - `apps/frontend`
  - `apps/backend`
  
- [ ] **GitHub Actions CI/CD**
  - Lint + TypeScript check
  - Tests automáticos
  - Build validation
  - Deploy preview

- [ ] **Docker Setup**
  - `Dockerfile.backend` (NestJS)
  - `Dockerfile.frontend` (Next.js)
  - `docker-compose.yml` (Dev environment)
  - `.dockerignore`

**Checklist:**
- [ ] `npm install` sem erros
- [ ] `turbo run build` funciona
- [ ] `turbo run lint` passa
- [ ] Docker build sem erros

---

### Sprint 1.2: Backend Core Setup
- [ ] **Criar projeto NestJS**
  ```bash
  nest new backend
  ```

- [ ] **Configurar módulos principais**
  - AppModule
  - ConfigModule (env validation)
  - DatabaseModule (Prisma)
  - AuthModule

- [ ] **Configurar Prisma**
  - `database/prisma/schema.prisma`
  - `.env.example`
  - Migrations

- [ ] **Configuração TypeScript**
  - `tsconfig.json`
  - Paths aliases (@/...)
  - Strict mode

**Checklist:**
- [ ] `npm run build` funciona
- [ ] `npm run typecheck` passa
- [ ] `npm run lint` passa
- [ ] Docker build sem erros

---

### Sprint 1.3: Frontend Core Setup
- [ ] **Criar projeto Next.js 14**
  ```bash
  npx create-next-app frontend --typescript --tailwind
  ```

- [ ] **Configurar estrutura**
  - `src/app/`
  - `src/components/`
  - `src/hooks/`
  - `src/types/`
  - `src/stores/`

- [ ] **Configurar TailwindCSS + Shadcn**
  - Theme customization
  - Components setup

- [ ] **State Management**
  - Zustand ou Context API
  - Recoil para estado global

**Checklist:**
- [ ] `npm run build` funciona
- [ ] `npm run dev` rodando em 3000
- [ ] `npm run typecheck` passa
- [ ] `npm run lint` passa

---

### Sprint 1.4: Autenticação Base
- [ ] **JWT Implementation**
  ```
  users/auth/auth.service.ts
    - Estratégia JWT
    - Refresh token
    - Login/Logout
  ```

- [ ] **RBAC Guards**
  ```
  common/guards/jwt.guard.ts
  common/guards/roles.guard.ts
  ```

- [ ] **Login Endpoint**
  ```
  POST /auth/login
  POST /auth/refresh
  POST /auth/logout
  ```

**Checklist:**
- [ ] JWT token gerado
- [ ] Refresh token funciona
- [ ] Guard bloqueia sem token
- [ ] Testes unit passam

---

## 🏗️ Fase 2: Backend Core (Semanas 3-4)

### Sprint 2.1: Domain - Users
- [ ] **Entities**
  ```
  users/entities/user.entity.ts
  users/entities/role.entity.ts
  ```

- [ ] **DTOs**
  ```
  create-user.dto.ts
  update-user.dto.ts
  user-response.dto.ts
  ```

- [ ] **Services**
  ```
  user.service.ts (CRUD)
  - create()
  - findById()
  - update()
  - delete()
  - findByEmail()
  ```

- [ ] **Controller**
  ```
  users.controller.ts
  - GET /users/:id
  - POST /users
  - PUT /users/:id
  - DELETE /users/:id
  ```

- [ ] **Repository**
  ```
  user.repository.ts (Prisma queries)
  ```

- [ ] **Tests**
  ```
  user.service.spec.ts
  user.controller.spec.ts
  ```

**Checklist:**
- [ ] CRUD completo funciona
- [ ] Validações passam
- [ ] Testes unit 100%
- [ ] Soft delete implementado

---

### Sprint 2.2: Domain - Sales
- [ ] **Entities**
  ```
  sale.entity.ts
  seller.entity.ts
  customer.entity.ts
  ```

- [ ] **Services**
  ```
  sale.service.ts
  - create() → calcula comissão automática
  - findById()
  - update()
  - list() → com filtros
  
  seller.service.ts
  - CRUD completo
  
  customer.service.ts
  - CRUD completo
  ```

- [ ] **Validators**
  ```
  sale.validator.ts
  - Validar cliente existe
  - Validar vendedor existe
  - Validar valores
  ```

- [ ] **Controllers & DTOs**

**Checklist:**
- [ ] Venda criada calcula comissão
- [ ] Filtros funcionam
- [ ] Validações completas
- [ ] Testes passam

---

### Sprint 2.3: Domain - Commission
- [ ] **Entities & Enums**
  ```
  commission.entity.ts
  commission-rule.entity.ts
  commission-type.enum.ts (7 tipos)
  ```

- [ ] **Calculator Strategies** (Strategy Pattern)
  ```
  calculators/fixed-commission.calculator.ts
  calculators/percentage-commission.calculator.ts
  calculators/tiered-commission.calculator.ts
  calculators/performance-commission.calculator.ts
  calculators/recurring-commission.calculator.ts
  calculators/product-commission.calculator.ts
  calculators/net-profit-commission.calculator.ts
  ```

- [ ] **Services**
  ```
  commission.service.ts
  - calculate()
  - approve()
  - block()
  - refund()
  
  commission-rule.service.ts
  - CRUD
  - getConfigByType()
  ```

- [ ] **Validators**
  ```
  commission.validator.ts
  ```

**Checklist:**
- [ ] 7 tipos de comissão funcionam
- [ ] Aprovação/Bloqueio funciona
- [ ] Refund desconta do saldo
- [ ] Testes completos

---

### Sprint 2.4: Domain - Financial
- [ ] **Entities**
  ```
  financial-entry.entity.ts
  payment.entity.ts
  cash-flow.entity.ts
  reconciliation.entity.ts
  ```

- [ ] **Services**
  ```
  financial-entry.service.ts
  - create() → cria entry + atualiza cash flow
  - find()
  
  payment.service.ts
  - create() → enfileira pagamento
  - process() → executa pagamento
  
  cash-flow.service.ts
  - calcular saldo diário
  - getDailyFlow()
  - getMonthlyFlow()
  
  reconciliation.service.ts
  - reconcile() → compara esperado vs real
  - findDivergences()
  ```

- [ ] **Controllers & DTOs**

**Checklist:**
- [ ] Entry criada atualiza cash flow
- [ ] Pagamento enfileirado
- [ ] Reconciliação detecta divergências
- [ ] Testes passam

---

## ⚙️ Fase 3: Processamento Assíncrono (Semana 5)

### Sprint 3.1: Queue Setup
- [ ] **Bull + Redis**
  ```
  npm install bull redis @nestjs/bull
  ```

- [ ] **QueueModule**
  ```
  queue/queue.module.ts
  - BullModule.registerQueue('commissions')
  - BullModule.registerQueue('payments')
  - BullModule.registerQueue('reports')
  ```

- [ ] **Commission Processor**
  ```
  commission/jobs/process-commissions.job.ts
  - Recebe fila
  - Calcula comissão
  - Salva resultado
  - Auditoria
  ```

- [ ] **Payment Processor**
  ```
  financial/jobs/process-payments.job.ts
  - Pega pagamentos pendentes
  - Faz PIX/TED
  - Atualiza status
  ```

**Checklist:**
- [ ] Redis rodando
- [ ] Queue criada
- [ ] Processadores funcionam
- [ ] Retry funcionando

---

### Sprint 3.2: Auditoria
- [ ] **Audit Interceptor**
  ```
  common/interceptors/audit.interceptor.ts
  - Captura user_id
  - Captura IP
  - Captura action
  - Salva old/new values
  ```

- [ ] **Audit Service**
  ```
  audit/services/audit-log.service.ts
  - log()
  - find()
  - export()
  ```

- [ ] **Audit Controller**
  ```
  GET /audit-logs
  - Filtros por entity
  - Filtros por action
  - Filtros por usuário
  ```

**Checklist:**
- [ ] Todas operações auditadas
- [ ] Old values capturados
- [ ] Relatório funciona

---

## 🎨 Fase 4: Frontend (Semanas 6-7)

### Sprint 4.1: Layout Base
- [ ] **Componentes estruturais**
  ```
  components/
  ├── layout/
  │   ├── sidebar.tsx
  │   ├── navbar.tsx
  │   ├── main-layout.tsx
  └── common/
      ├── button.tsx
      ├── input.tsx
      ├── modal.tsx
  ```

- [ ] **Páginas base**
  ```
  app/
  ├── dashboard/
  │   └── page.tsx
  ├── login/
  │   └── page.tsx
  └── layout.tsx
  ```

- [ ] **Dark mode + Theme**

**Checklist:**
- [ ] Layout responsivo
- [ ] Tema funciona
- [ ] Navegação OK

---

### Sprint 4.2: Dashboard
- [ ] **KPI Cards**
  ```
  Total Vendido
  Total Recebido
  Total Pendente
  Comissão Total
  Comissão Paga
  Comissão Pendente
  Entradas Dia/Mês
  ```

- [ ] **Gráficos**
  ```
  Fluxo Financeiro (line chart)
  Comissão por Vendedor (bar chart)
  Status Vendas (pie chart)
  Ranking Vendedores (table)
  ```

- [ ] **API Integration**
  ```
  hooks/useDashboard.ts
  - Fetch KPIs
  - Fetch gráficos
  - Cache com SWR
  ```

**Checklist:**
- [ ] Dados carregam
- [ ] Gráficos renderizam
- [ ] Responsivo
- [ ] Performance OK

---

### Sprint 4.3: Gestão de Vendedores
- [ ] **Tela: Lista de Vendedores**
  ```
  components/sellers/seller-table.tsx
  - Listar todos
  - Filtros
  - Busca
  - Paginação
  ```

- [ ] **Tela: Criar/Editar Vendedor**
  ```
  components/sellers/seller-form.tsx
  - Form com Zod validation
  - Upload foto
  - Configurar comissão
  - Dados bancários
  ```

- [ ] **Tela: Detalhe Vendedor**
  ```
  pages/sellers/[id].tsx
  - Info completa
  - Histórico de vendas
  - Histórico de comissões
  - Histórico de pagamentos
  ```

**Checklist:**
- [ ] CRUD completo
- [ ] Validação funciona
- [ ] Testes passam

---

### Sprint 4.4: Lançamento de Vendas
- [ ] **Tela: Nova Venda**
  ```
  components/sales/sale-form.tsx
  - Selecionar vendedor
  - Selecionar cliente
  - Dados da venda
  - Calcular comissão
  ```

- [ ] **Tela: Lista de Vendas**
  ```
  Filtros
  Busca
  Estatísticas
  Paginação
  ```

- [ ] **Tela: Detalhe Venda**
  ```
  Dados da venda
  Comissão associada
  Status de pagamento
  Histórico de alterações
  ```

**Checklist:**
- [ ] Comissão calcula auto
- [ ] Validações OK
- [ ] Audit funciona

---

### Sprint 4.5: Controle Financeiro
- [ ] **Tela: Entradas Financeiras**
  ```
  Registrar entrada
  Listar entradas
  Filtros
  Status
  ```

- [ ] **Tela: Pagamentos**
  ```
  Pendentes
  Processando
  Pagos
  Falhados
  ```

- [ ] **Tela: Fluxo de Caixa**
  ```
  Gráfico temporal
  Saldo por dia/mês
  Comparativos
  ```

- [ ] **Tela: Reconciliação**
  ```
  Lancamentos vs Recebimentos
  Divergências
  Resolver manualmente
  ```

**Checklist:**
- [ ] Fluxo completo
- [ ] Reconciliação detecta divergências
- [ ] Exportar dados

---

## 📊 Fase 5: Relatórios (Semana 8)

### Sprint 5.1: Relatórios Core
- [ ] **Relatório: Comissão por Vendedor**
  ```
  Período
  Vendedor
  Total de vendas
  Total de comissões
  Aprovadas/Pagas/Pendentes
  ```

- [ ] **Relatório: Fluxo Financeiro**
  ```
  Entradas/Saídas por período
  Gráficos
  Comparativos
  ```

- [ ] **Relatório: Performance**
  ```
  Ranking de vendedores
  Metas vs Realizado
  Variação
  ```

- [ ] **Relatório: Auditoria**
  ```
  Log completo
  Filtros
  Rastreabilidade
  ```

### Sprint 5.2: Export
- [ ] **PDF Generator**
  ```
  npm install pdfkit
  ```

- [ ] **Excel Export**
  ```
  npm install exceljs
  ```

- [ ] **CSV Export**
  ```
  Relatórios básicos em CSV
  ```

**Checklist:**
- [ ] Gerar PDF
- [ ] Gerar Excel
- [ ] Download funciona

---

## ✅ Fase 6: QA & Deploy (Semana 9-10)

### Sprint 6.1: Testes
- [ ] **Unit Tests**
  - Todas services
  - Calculators
  - Validators

- [ ] **Integration Tests**
  - API endpoints
  - Banco de dados
  - Filas

- [ ] **E2E Tests**
  - Login
  - Criar venda
  - Calcular comissão
  - Processar pagamento

**Target:** 80%+ coverage

---

### Sprint 6.2: Deploy
- [ ] **Docker Production**
  - Multi-stage builds
  - Security hardening

- [ ] **Database Backup**
  - Automated backups
  - Recovery testing

- [ ] **CI/CD Final**
  - Deploy automático
  - Health checks
  - Rollback strategy

- [ ] **Monitoring**
  - Logs centralizados
  - Alertas críticos
  - Métricas de performance

**Checklist:**
- [ ] Zero erros em lint
- [ ] Zero type errors
- [ ] 80%+ tests passing
- [ ] Deploy sem erros

---

## 🎯 Stories de Desenvolvimento

### Story 1: Setup Base
```
Criar monorepo com Turborepo
- [ ] Estrutura de pastas
- [ ] CI/CD GitHub Actions
- [ ] Docker setup
- [ ] TypeScript config
```

### Story 2: Autenticação
```
Implementar JWT + RBAC
- [ ] Login endpoint
- [ ] Guards
- [ ] Refresh token
- [ ] Soft-delete users
```

### Story 3: CRUD Users
```
Gerenciamento de usuários
- [ ] Create user
- [ ] List users
- [ ] Update user
- [ ] Delete user
```

### Story 4: Sales Management
```
Gestão completa de vendas
- [ ] Create sale
- [ ] Auto-calculate commission
- [ ] List/Filter sales
- [ ] Update/Delete sale
```

### Story 5: Commission System
```
Sistema de comissões (7 tipos)
- [ ] Fixed commission
- [ ] Percentage commission
- [ ] Tiered commission
- [ ] Performance commission
- [ ] Recurring commission
- [ ] Product commission
- [ ] Net profit commission
- [ ] Approve/Block/Refund
```

### Story 6: Financial
```
Controle financeiro
- [ ] Register entries
- [ ] Track payments
- [ ] Calculate cash flow
- [ ] Reconciliation
```

### Story 7: Processing Queue
```
Processamento assíncrono
- [ ] Bull queue setup
- [ ] Commission processor
- [ ] Payment processor
- [ ] Report generator
```

### Story 8: Audit
```
Auditoria completa
- [ ] Audit interceptor
- [ ] Audit service
- [ ] Audit reports
```

### Story 9: Frontend Dashboard
```
Dashboard executivo
- [ ] KPI cards
- [ ] Charts
- [ ] Responsive layout
```

### Story 10: Sellers Management
```
Gestão de vendedores
- [ ] CRUD vendedores
- [ ] Comissão config
- [ ] Dados bancários
```

### Story 11: Financial UI
```
Interface financeira
- [ ] Register entries
- [ ] Track payments
- [ ] Cash flow view
- [ ] Reconciliation UI
```

### Story 12: Reports
```
Relatórios e exports
- [ ] Commission reports
- [ ] Financial reports
- [ ] PDF export
- [ ] Excel export
```

---

## 📊 Métricas de Sucesso

### Code Quality
✅ TypeScript strict mode
✅ ESLint zero errors
✅ 80%+ test coverage
✅ Code review 2 approval

### Performance
✅ API response < 500ms
✅ Dashboard load < 2s
✅ Report generation < 5s
✅ Database query < 100ms

### Business
✅ 7 comissões tipos funcionando
✅ 100% auditoria rastreável
✅ 0 divergências financeiras
✅ 99.9% uptime

---

## 🚀 Quick Start Commands

```bash
# Setup
npm install
npm run setup

# Development
npm run dev

# Build
npm run build

# Tests
npm run test
npm run test:coverage

# Lint
npm run lint
npm run format

# Database
npm run db:migrate
npm run db:seed

# Deploy
npm run deploy
```

---

**Status:** ✅ Roadmap Validado
**Próximo:** Iniciar Fase 1 - Setup & Infraestrutura
