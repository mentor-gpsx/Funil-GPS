# Sistema de Comissão e Financeiro - Arquitetura Detalhada

## 1. Princípios Arquiteturais

### DDD (Domain-Driven Design)
- **Domínios isolados**: Financial, Commission, Sales, Audit, Users, Reports, Goals
- **Bounded Contexts**: Cada domínio é uma unidade de negócio autônoma
- **Ubiquitous Language**: Termos financeiros consistentes em todo sistema

### Clean Architecture
```
Entities (Regras de Negócio)
    ↓
Use Cases (Lógica de Aplicação)
    ↓
Interface Adapters (Controllers, Repos)
    ↓
Frameworks & Drivers (APIs, DB, UI)
```

### SOLID Principles
- **S**ingle Responsibility: Cada classe = 1 responsabilidade
- **O**pen/Closed: Aberto para extensão, fechado para modificação
- **L**iskov Substitution: Interfaces substituíveis
- **I**nterface Segregation: Interfaces específicas
- **D**ependency Inversion: Depender de abstrações, não implementações

---

## 2. Stack Tecnológico Detalhado

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| **Frontend** | Next.js 14 + TypeScript | SSR, Dashboard, Performance |
| **Backend** | NestJS + TypeScript | SOLID, Modular, Escalável |
| **Database** | PostgreSQL 15+ | Transações ACID, Relatórios |
| **ORM** | Prisma | Type-safe, Migrations, Performance |
| **Cache** | Redis | Comissões, Sessões, Rate Limit |
| **Queues** | Bull (Redis) | Processamento assíncrono |
| **Auth** | JWT + Refresh Token | Stateless, RBAC |
| **Validation** | Zod + Class Validator | Runtime + Compile-time |
| **Logging** | Winston | Estruturado, Múltiplos transportes |
| **Monitoring** | Prometheus + Grafana | Métricas, Alertas |
| **Container** | Docker + Docker Compose | Desenvolvimento, Deploy |
| **Monorepo** | Turborepo | Packages compartilhadas |
| **Testing** | Jest + Supertest | Unit, Integration, E2E |
| **CI/CD** | GitHub Actions | Automação, Deploy |

---

## 3. Estrutura de Domínios (DDD)

### 🏢 Domínio: Users (Usuários & Autenticação)
```
users/
├── entities/
│   ├── user.entity.ts
│   └── role.entity.ts
├── dtos/
│   ├── create-user.dto.ts
│   └── update-user.dto.ts
├── services/
│   ├── user.service.ts
│   └── auth.service.ts
├── controllers/
│   └── auth.controller.ts
├── repositories/
│   └── user.repository.ts
└── guards/
    └── jwt.guard.ts
```

**Responsabilidades:**
- Autenticação JWT
- Gerenciamento de usuários
- RBAC (Role-Based Access Control)
- Refresh tokens

---

### 💰 Domínio: Financial (Financeiro)
```
financial/
├── entities/
│   ├── financial-entry.entity.ts
│   ├── payment.entity.ts
│   ├── installment.entity.ts
│   └── cash-flow.entity.ts
├── enums/
│   ├── payment-method.enum.ts
│   ├── entry-status.enum.ts
│   └── payment-status.enum.ts
├── dtos/
│   ├── create-entry.dto.ts
│   ├── reconcile.dto.ts
│   └── cash-flow.dto.ts
├── services/
│   ├── financial-entry.service.ts
│   ├── reconciliation.service.ts
│   ├── cash-flow.service.ts
│   └── payment.service.ts
├── controllers/
│   └── financial.controller.ts
├── repositories/
│   ├── financial-entry.repository.ts
│   ├── payment.repository.ts
│   └── cash-flow.repository.ts
└── validators/
    └── financial.validator.ts
```

**Responsabilidades:**
- Registrar entradas financeiras
- Controlar pagamentos e recebimentos
- Conciliação automática/manual
- Fluxo de caixa

---

### 💸 Domínio: Commission (Comissões)
```
commission/
├── entities/
│   ├── commission.entity.ts
│   ├── commission-rule.entity.ts
│   └── commission-calculation.entity.ts
├── enums/
│   ├── commission-type.enum.ts
│   └── commission-status.enum.ts
├── dtos/
│   ├── create-commission.dto.ts
│   ├── create-rule.dto.ts
│   └── calculate.dto.ts
├── services/
│   ├── commission.service.ts
│   ├── commission-rule.service.ts
│   ├── commission-calculator.service.ts
│   └── commission-processor.service.ts
├── controllers/
│   └── commission.controller.ts
├── repositories/
│   ├── commission.repository.ts
│   └── commission-rule.repository.ts
├── validators/
│   └── commission.validator.ts
├── calculators/
│   ├── fixed-commission.calculator.ts
│   ├── percentage-commission.calculator.ts
│   ├── tiered-commission.calculator.ts
│   └── performance-commission.calculator.ts
└── jobs/
    └── process-commissions.job.ts
```

**Responsabilidades:**
- Calcular comissões (7 tipos)
- Gerenciar regras
- Processamento assíncrono
- Aprovação/Estorno/Bloqueio

---

### 📊 Domínio: Sales (Vendas)
```
sales/
├── entities/
│   ├── sale.entity.ts
│   ├── seller.entity.ts
│   └── customer.entity.ts
├── dtos/
│   ├── create-sale.dto.ts
│   ├── create-seller.dto.ts
│   └── create-customer.dto.ts
├── services/
│   ├── sale.service.ts
│   ├── seller.service.ts
│   └── customer.service.ts
├── controllers/
│   ├── sale.controller.ts
│   ├── seller.controller.ts
│   └── customer.controller.ts
├── repositories/
│   ├── sale.repository.ts
│   ├── seller.repository.ts
│   └── customer.repository.ts
└── validators/
    └── sale.validator.ts
```

**Responsabilidades:**
- Gestão de vendedores
- Registrar vendas
- Controle de clientes
- Cálculo automático de comissão

---

### 📋 Domínio: Audit (Auditoria)
```
audit/
├── entities/
│   ├── audit-log.entity.ts
│   └── audit-trail.entity.ts
├── enums/
│   ├── audit-action.enum.ts
│   └── audit-entity.enum.ts
├── dtos/
│   └── audit-query.dto.ts
├── services/
│   ├── audit-log.service.ts
│   └── audit-trail.service.ts
├── repositories/
│   └── audit-log.repository.ts
├── decorators/
│   └── auditable.decorator.ts
├── interceptors/
│   └── audit.interceptor.ts
└── controllers/
    └── audit.controller.ts
```

**Responsabilidades:**
- Registrar todas as alterações
- Rastrear usuário, IP, timestamp
- Valores antigos vs novos
- Relatórios de auditoria

---

### 📈 Domínio: Reports (Relatórios)
```
reports/
├── dtos/
│   ├── commission-report.dto.ts
│   ├── financial-report.dto.ts
│   ├── seller-report.dto.ts
│   └── export-options.dto.ts
├── services/
│   ├── commission-report.service.ts
│   ├── financial-report.service.ts
│   ├── seller-report.service.ts
│   └── export.service.ts
├── controllers/
│   └── reports.controller.ts
├── generators/
│   ├── pdf-generator.ts
│   └── excel-generator.ts
└── jobs/
    └── generate-reports.job.ts
```

**Responsabilidades:**
- Gerar relatórios complexos
- Exportar PDF/Excel
- Relatórios por período
- Cache de relatórios

---

### 🎯 Domínio: Goals (Metas)
```
goals/
├── entities/
│   ├── goal.entity.ts
│   └── goal-tracking.entity.ts
├── dtos/
│   ├── create-goal.dto.ts
│   └── track-goal.dto.ts
├── services/
│   ├── goal.service.ts
│   └── goal-tracking.service.ts
├── controllers/
│   └── goals.controller.ts
├── repositories/
│   └── goal.repository.ts
└── validators/
    └── goal.validator.ts
```

**Responsabilidades:**
- Definir metas de vendedores
- Rastreamento de progresso
- Comissão por meta

---

## 4. Estrutura de Pastas do Projeto

```
finance-commission-system/
│
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── stores/
│   │   │   ├── hooks/
│   │   │   ├── types/
│   │   │   └── styles/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── backend/
│       ├── src/
│       │   ├── main.ts
│       │   ├── common/
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── guards/
│       │   │   ├── interceptors/
│       │   │   ├── middleware/
│       │   │   └── pipes/
│       │   ├── config/
│       │   ├── database/
│       │   │   ├── migrations/
│       │   │   └── seeds/
│       │   ├── domains/
│       │   │   ├── users/
│       │   │   ├── financial/
│       │   │   ├── commission/
│       │   │   ├── sales/
│       │   │   ├── audit/
│       │   │   ├── reports/
│       │   │   └── goals/
│       │   ├── shared/
│       │   │   ├── services/
│       │   │   ├── utils/
│       │   │   ├── types/
│       │   │   └── constants/
│       │   └── queue/
│       ├── test/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── ui/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── styles/
│   │   └── package.json
│   ├── types/
│   │   ├── index.ts
│   │   └── package.json
│   ├── utils/
│   │   ├── validators/
│   │   ├── formatters/
│   │   ├── calculations/
│   │   └── package.json
│   └── validators/
│       ├── commission.validator.ts
│       ├── financial.validator.ts
│       └── package.json
│
├── database/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── migrations/
│
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
│
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── DEPLOYMENT.md
│
├── scripts/
│   ├── setup.sh
│   ├── migrate.sh
│   └── seed.sh
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       └── test.yml
│
├── turbo.json
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 5. Fluxos Críticos

### 🔄 Fluxo de Venda com Comissão
```
1. Venda Lançada (Sales Domain)
   ↓
2. Calcular Comissão (Commission Domain)
   ↓
3. Registrar Financeiro (Financial Domain)
   ↓
4. Enfileirar Processamento (Queue)
   ↓
5. Auditoria (Audit Domain)
   ↓
6. Disponível para Aprovação
```

### 💳 Fluxo de Recebimento
```
1. Entrada Financeira (Financial Domain)
   ↓
2. Validar Pagamento (Payment Validator)
   ↓
3. Atualizar Cash Flow (Financial Domain)
   ↓
4. Notificar Vendedor (Notification Service)
   ↓
5. Auditoria (Audit Domain)
```

### 📊 Fluxo de Comissão Escalonada
```
1. Regra Definida (Commission Rule)
   ↓
2. Coletar Vendas do Período (Sales Domain)
   ↓
3. Calcular Tiers (Tiered Calculator)
   ↓
4. Aplicar Desconto/Bônus (Business Logic)
   ↓
5. Aprovar/Bloquear (Commission Service)
   ↓
6. Transferência PIX (Payment Service)
```

---

## 6. Segurança

### Autenticação
- JWT com expiração de 15 minutos
- Refresh token com 7 dias
- Rate limit 100 req/min por IP

### Autorização (RBAC)
**5 Perfis:**
- **ADMIN**: Acesso total
- **FINANCEIRO**: Financeiro + Auditoria
- **GESTOR**: Vendedores + Comissões
- **COMERCIAL**: Apenas vendas
- **AUDITOR**: Leitura auditoria

### Proteção de Dados
- Criptografia de senhas (bcrypt)
- Hash de chaves PIX
- Logs de acesso
- Soft delete
- Validação de CPF/CNPJ

---

## 7. Escalabilidade

### Horizontal Scaling
- API stateless
- Sessions em Redis
- Queue distribuída

### Multi-Empresa
- Tenant ID em todas tabelas
- RLS (Row Level Security)
- Isolamento de dados

### Performance
- Cache de comissões
- Índices em FKs
- Paginação obrigatória
- Query optimization

---

## 8. Roadmap de Implementação

**Fase 1: Setup (1-2 semanas)**
- [ ] Monorepo Turborepo
- [ ] Docker + CI/CD
- [ ] Banco PostgreSQL + Prisma
- [ ] Autenticação JWT

**Fase 2: Backend Core (2-3 semanas)**
- [ ] Domínios: Users, Financial, Commission, Sales
- [ ] APIs completas
- [ ] Validações

**Fase 3: Processamento (1 semana)**
- [ ] Queue Bull
- [ ] Processamento de comissões
- [ ] Auditoria

**Fase 4: Frontend (2-3 semanas)**
- [ ] Dashboard
- [ ] Formulários
- [ ] Tabelas e gráficos

**Fase 5: Relatórios (1 semana)**
- [ ] Geração de relatórios
- [ ] Export PDF/Excel

**Fase 6: QA + Deploy (1 semana)**
- [ ] Testes completos
- [ ] Deploy produção

---

**Status:** ✅ Arquitetura Validada e Pronta para Implementação
