# Sistema de Comissão e Financeiro - Checklist Técnico

## ✅ PRÉ-REQUISITOS (Antes de Começar)

### Ambiente
- [ ] Node.js 18+ instalado (`node --version`)
- [ ] npm 9+ ou yarn (`npm --version`)
- [ ] Docker instalado (`docker --version`)
- [ ] PostgreSQL 15+ (local ou via Docker)
- [ ] Git configurado (`git config --global user.name`)
- [ ] Editor (VS Code recomendado)

### Conhecimento
- [ ] Familiaridade com Node.js/TypeScript
- [ ] Conhecimento básico de Docker
- [ ] Entendimento de REST APIs
- [ ] Bancos de dados relacionais

### Repositório
- [ ] GitHub account
- [ ] Repository criado
- [ ] Branch `main` protegida (se em equipe)

---

## 📋 FASE 1: SETUP & INFRAESTRUTURA

### Sprint 1.1: Monorepo Turborepo

#### [ ] 1. Criar estrutura base
```bash
mkdir finance-commission-system
cd finance-commission-system
npm init -y
npm install -D turbo
npx turbo init
```

#### [ ] 2. Criar workspaces
```bash
mkdir -p apps/frontend apps/backend packages/{ui,types,utils,validators}
```

#### [ ] 3. Configurar turbo.json
```json
{
  "globalDependencies": ["**/.env"],
  "pipeline": {
    "build": { "outputs": ["dist/**"] },
    "lint": { "outputs": [] },
    "typecheck": { "outputs": [] },
    "test": { "outputs": ["coverage/**"] }
  }
}
```

#### [ ] 4. Estrutura de pastas

**Root package.json:**
```json
{
  "name": "finance-commission-system",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage"
  }
}
```

**Checklist:**
- [ ] `turbo run build` executa
- [ ] `npm install` sem erros
- [ ] Git repository inicializado
- [ ] `.gitignore` configurado

---

### Sprint 1.2: Docker & CI/CD

#### [ ] 5. Docker Compose para desenvolvimento
```bash
mkdir docker
```

**docker/docker-compose.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: finance
      POSTGRES_PASSWORD: finance
      POSTGRES_DB: finance_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ..
      dockerfile: docker/Dockerfile.backend
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://finance:finance@postgres:5432/finance_db
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  frontend:
    build:
      context: ..
      dockerfile: docker/Dockerfile.frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
```

#### [ ] 6. Dockerfiles

**docker/Dockerfile.backend:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3001
CMD ["npm", "run", "start:prod"]
```

**docker/Dockerfile.frontend:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "start"]
```

#### [ ] 7. GitHub Actions CI/CD

**mkdir .github/workflows**

**.github/workflows/ci.yml:**
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: finance
          POSTGRES_PASSWORD: finance
          POSTGRES_DB: finance_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v3

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build
```

**Checklist:**
- [ ] `docker-compose up` roda sem erros
- [ ] PostgreSQL acessível em localhost:5432
- [ ] Redis acessível em localhost:6379
- [ ] GitHub Actions workflows criados
- [ ] CI passa em primeiro push

---

### Sprint 1.3: Prisma & Banco de Dados

#### [ ] 8. Setup Prisma

```bash
cd apps/backend
npm install @prisma/client prisma
npx prisma init
```

#### [ ] 9. Configurar .env

**apps/backend/.env:**
```
DATABASE_URL=postgresql://finance:finance@localhost:5432/finance_db
NODE_ENV=development
JWT_SECRET=seu_secret_super_seguro_aqui
JWT_EXPIRATION=900
JWT_REFRESH_EXPIRATION=604800
REDIS_URL=redis://localhost:6379
```

#### [ ] 10. Criar schema.prisma

**apps/backend/prisma/schema.prisma:**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  role      String   @db.VarChar(50)
  name      String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@index([email])
  @@index([role])
}
```

#### [ ] 11. Executar migrations

```bash
npx prisma migrate dev --name init
npx prisma studio  # Validar
```

**Checklist:**
- [ ] `.env` criado
- [ ] Migração "init" roda
- [ ] Prisma Studio acessa banco
- [ ] Schema compilado sem erros

---

### Sprint 1.4: Autenticação Base

#### [ ] 12. Setup NestJS

```bash
cd apps/backend
npm install -g @nestjs/cli
nest new . --skip-git --skip-install
```

#### [ ] 13. Configurar Auth Module

**apps/backend/src/auth/auth.service.ts:**
```typescript
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refresh_token: this.jwtService.sign(payload, { expiresIn: '7d' }),
    };
  }
}
```

#### [ ] 14. JWT Guard

**apps/backend/src/common/guards/jwt.guard.ts:**
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {}
```

#### [ ] 15. Testar Auth

```bash
npm run test -- auth.service.spec.ts
```

**Checklist:**
- [ ] AuthService se instancia
- [ ] Password hash funciona
- [ ] JWT gerado
- [ ] Guard bloqueia sem token
- [ ] Testes passam

---

## 🏗️ FASE 2: BACKEND CORE (Validar antes de avançar)

### Sprint 2.1-2.4: Domínios

**Para cada domínio (Users, Sales, Commission, Financial):**

#### [ ] 1. Entity
- [ ] Criar arquivo `{domain}/entities/{entity}.entity.ts`
- [ ] Definir propriedades
- [ ] Adicionar getters/setters

#### [ ] 2. DTO
- [ ] Criar `{domain}/dtos/create-{entity}.dto.ts`
- [ ] Adicionar validações Zod
- [ ] Criar `{entity}-response.dto.ts`

#### [ ] 3. Repository
- [ ] Implementar CRUD
- [ ] Adicionar queries customizadas
- [ ] Soft delete se aplicável

#### [ ] 4. Service
- [ ] Implementar lógica de negócio
- [ ] Usar repository
- [ ] Tratamento de erros

#### [ ] 5. Controller
- [ ] Implementar endpoints REST
- [ ] Guards/Decorators
- [ ] DTOs de request/response

#### [ ] 6. Tests
- [ ] Unit tests (service)
- [ ] Integration tests (controller)
- [ ] Mínimo 80% coverage

#### [ ] 7. Module
```typescript
@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
```

**Checklist por domínio:**
- [ ] Entity compila
- [ ] Repository funciona
- [ ] Service tem lógica
- [ ] Controller expõe API
- [ ] Testes passam (80%+)
- [ ] ESLint zero errors
- [ ] TypeScript strict mode OK

---

## ⚙️ FASE 3: PROCESSAMENTO ASSÍNCRONO

#### [ ] Setup Bull Queue

```bash
npm install bull @nestjs/bull
npm install redis
```

#### [ ] QueueModule

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      redis: process.env.REDIS_URL,
    }),
    BullModule.registerQueue(
      { name: 'commissions' },
      { name: 'payments' },
      { name: 'reports' },
    ),
  ],
})
export class QueueModule {}
```

#### [ ] Commission Processor

```typescript
@Processor('commissions')
export class CommissionProcessor {
  @Process()
  async processCommission(job: Job<any>) {
    // Lógica de processamento
  }
}
```

#### [ ] Testes de Queue

```bash
npm run test -- queue.processor.spec.ts
```

**Checklist:**
- [ ] Redis roda
- [ ] Queue criada
- [ ] Jobs processam
- [ ] Retry funciona

---

## 🎨 FASE 4: FRONTEND

#### [ ] Setup Next.js

```bash
cd apps/frontend
npx create-next-app . --typescript --tailwind
```

#### [ ] Componentes Base
- [ ] Sidebar
- [ ] Navbar
- [ ] Layout principal

#### [ ] Páginas
- [ ] /dashboard
- [ ] /login
- [ ] /sellers
- [ ] /sales
- [ ] /commissions
- [ ] /financial
- [ ] /reports

#### [ ] Hooks
- [ ] useDashboard
- [ ] useAuth
- [ ] useSellers
- [ ] useSales

#### [ ] Store (Zustand)
- [ ] authStore
- [ ] dashboardStore
- [ ] filtersStore

**Checklist:**
- [ ] `npm run dev` roda em 3000
- [ ] Layout responsivo
- [ ] Dark mode funciona
- [ ] TypeScript strict mode

---

## 📊 FASE 5: RELATÓRIOS

#### [ ] Serviços de Relatório
- [ ] CommissionReportService
- [ ] FinancialReportService
- [ ] SellerReportService

#### [ ] Exporters
- [ ] PDFExporter (pdfkit)
- [ ] ExcelExporter (exceljs)
- [ ] CSVExporter

#### [ ] Controllers
- [ ] GET /reports/commissions
- [ ] GET /reports/financial
- [ ] POST /reports/export

**Checklist:**
- [ ] Relatório gerado em memória
- [ ] PDF exportado corretamente
- [ ] Excel com formatação
- [ ] Performance < 5s

---

## ✅ FASE 6: QA & DEPLOY

#### [ ] Testes Completos
- [ ] Coverage >= 80%
- [ ] E2E tests passam
- [ ] Integration tests OK

#### [ ] Segurança
- [ ] CORS configurado
- [ ] Rate limit ativo
- [ ] Secrets em .env
- [ ] No console.log em prod

#### [ ] Performance
- [ ] API response < 500ms
- [ ] Dashboard load < 2s
- [ ] Reports < 5s

#### [ ] Deploy
- [ ] Docker build OK
- [ ] Health check OK
- [ ] Logs centralizados
- [ ] Backup automático

---

## 🚀 VERIFICAÇÃO FINAL

### Code Quality
```bash
npm run lint        # ✅ Zero errors
npm run typecheck   # ✅ Zero errors
npm run test        # ✅ All pass
npm run test:coverage # >= 80%
npm run build       # ✅ Builds
```

### Ambiente
```bash
docker-compose up   # ✅ All services
psql -U finance -d finance_db # ✅ Connected
redis-cli           # ✅ Connected
```

### Funcionalidades
- [ ] Login/Logout funciona
- [ ] Venda criada calcula comissão
- [ ] Comissão aprovada
- [ ] Pagamento processado
- [ ] Auditoria registrada
- [ ] Relatório gerado
- [ ] PDF/Excel exporta

---

## 📋 POST-LAUNCH CHECKLIST

### Documentação
- [ ] API docs (Swagger)
- [ ] Setup guide
- [ ] Deployment guide
- [ ] Architecture ADR

### Observabilidade
- [ ] Logs estruturados
- [ ] Metrics (Prometheus)
- [ ] Error tracking
- [ ] Alerts configurados

### Segurança
- [ ] Penetration test
- [ ] Code audit
- [ ] Dependency scan
- [ ] Secrets audit

### Performance
- [ ] Load test
- [ ] DB query analysis
- [ ] Cache strategy
- [ ] CDN setup (if needed)

---

## 🎯 Comandos Essenciais

```bash
# Setup
npm install
npm run setup

# Development
npm run dev

# Build
npm run build

# Quality
npm run lint
npm run typecheck
npm run test
npm run test:coverage

# Database
npx prisma migrate dev
npx prisma studio

# Docker
docker-compose up
docker-compose down

# Deploy
npm run deploy
```

---

**Status:** ✅ Checklist Técnico Completo
**Próximo:** Iniciar Sprint 1.1
