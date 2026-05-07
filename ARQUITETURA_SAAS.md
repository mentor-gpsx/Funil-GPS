# 🏗️ Arquitetura - Do MVP para SaaS em Produção

## VISÃO GERAL

Este documento descreve a transição do protótipo HTML para um sistema SaaS robusto, escalável e pronto para produção.

---

## FASE 1: MVP ATUAL (PROTÓTIPO)

### Stack:
- **Frontend:** HTML5 + Vanilla JS (localStorage)
- **Backend:** Node.js + Express
- **Database:** SQLite (em memória/arquivo)
- **Autenticação:** Simulada (JWT mock)

### Limitações:
- ❌ Dados não persistem entre abas
- ❌ Sem controle de concorrência
- ❌ Sem segurança real (autenticação fake)
- ❌ Performance limitada (100+ registros)
- ❌ Sem backup automático
- ❌ Sem notificações em tempo real

---

## FASE 2: PRODUÇÃO (3-4 MESES)

### **2.1 Backend Robusto**

```javascript
// Stack recomendado
- Node.js (v20+) + Express 5
- PostgreSQL (migrado do SQLite)
- Redis (cache + sessões)
- JWT + 2FA (autenticação real)
- Bull (fila de jobs)
- Winston (logging)
```

### **2.2 Segurança**

```yaml
Implementações:
  - Autenticação JWT com refresh tokens
  - 2FA (TOTP, SMS)
  - Rate limiting (50 req/min por IP)
  - CORS habilitado apenas para domínios whitelistados
  - Criptografia de senhas (bcrypt, salt 12)
  - Sanitização de inputs (XSS prevention)
  - SQL injection prevention (Prepared statements)
  - CSRF tokens em formulários
  - HTTPS obrigatório
  - Auditoria de todas as ações
```

### **2.3 Banco de Dados**

```sql
-- Estrutura otimizada
CREATE TABLE empresas (
  id UUID PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cnpj VARCHAR(20) UNIQUE NOT NULL,
  regime_tributario ENUM('presumido', 'real', 'simples'),
  plan VARCHAR(50),
  status ENUM('trial', 'ativo', 'suspenso'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_cnpj (cnpj),
  INDEX idx_status (status)
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id),
  email VARCHAR(255) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  perfil ENUM('admin', 'financeiro', 'operacional', 'rh', 'viewer'),
  mfa_habilitado BOOLEAN DEFAULT false,
  ultimo_login TIMESTAMP,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(empresa_id, email),
  INDEX idx_email (email)
);

CREATE TABLE lancamentos (
  id UUID PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id),
  tipo ENUM('entrada', 'saida') NOT NULL,
  categoria VARCHAR(50) NOT NULL,
  valor DECIMAL(15,2) NOT NULL,
  data DATE NOT NULL,
  responsavel_id UUID REFERENCES users(id),
  observacao TEXT,
  conciliado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  criado_por UUID REFERENCES users(id),
  INDEX idx_empresa_data (empresa_id, data),
  INDEX idx_tipo (tipo),
  INDEX idx_conciliado (conciliado)
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id),
  usuario_id UUID REFERENCES users(id),
  tabela VARCHAR(50) NOT NULL,
  acao ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
  id_registro UUID,
  dados_anteriores JSONB,
  dados_novos JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  INDEX idx_empresa_timestamp (empresa_id, timestamp),
  INDEX idx_usuario_timestamp (usuario_id, timestamp)
);

CREATE TABLE notificacoes (
  id UUID PRIMARY KEY,
  usuario_id UUID REFERENCES users(id),
  titulo VARCHAR(255) NOT NULL,
  mensagem TEXT,
  tipo ENUM('info', 'warning', 'danger', 'success'),
  lido BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_usuario_lido (usuario_id, lido)
);
```

### **2.4 APIs Principais**

```
POST   /api/auth/login              - Login
POST   /api/auth/logout             - Logout
POST   /api/auth/refresh            - Refresh token
POST   /api/auth/2fa/request        - Solicitar 2FA
POST   /api/auth/2fa/verify         - Verificar 2FA

GET    /api/empresas                - Listar empresas (admin)
POST   /api/empresas                - Criar empresa
PATCH  /api/empresas/:id            - Editar empresa
DELETE /api/empresas/:id            - Deletar empresa

GET    /api/lancamentos             - Listar lançamentos
POST   /api/lancamentos             - Criar lançamento
PATCH  /api/lancamentos/:id         - Editar lançamento
DELETE /api/lancamentos/:id         - Deletar lançamento
GET    /api/lancamentos/export      - Exportar (PDF/Excel)

GET    /api/dashboard               - KPIs
GET    /api/relatorios/dre          - DRE
GET    /api/relatorios/fluxo        - Fluxo de caixa
GET    /api/relatorios/impostos     - Cálculo de impostos
GET    /api/auditoria               - Log de auditoria

GET    /api/clientes                - Listar clientes
POST   /api/clientes                - Criar cliente
PATCH  /api/clientes/:id            - Editar cliente

GET    /api/colaboradores           - Listar colaboradores
POST   /api/colaboradores           - Criar colaborador
GET    /api/holerite/:id            - Gerar holerite

GET    /api/usuarios                - Listar usuários
POST   /api/usuarios                - Criar usuário
PATCH  /api/usuarios/:id            - Editar usuário
```

---

## FASE 3: ESCALABILIDADE (MESES 5-6)

### **3.1 Infraestrutura**

```yaml
Deployment:
  - Docker (containerização)
  - Kubernetes (orquestração)
  - AWS / Google Cloud / Azure
  - Load balancing (nginx)
  - CDN para assets (CloudFlare)
  - Auto-scaling (HPA)

Database:
  - PostgreSQL com replicação
  - Backups diários (S3)
  - WAL archiving
  - Read replicas

Observabilidade:
  - Prometheus (métricas)
  - Grafana (dashboards)
  - ELK Stack (logs)
  - Sentry (error tracking)
  - DataDog APM (application performance)
```

### **3.2 Performance**

```
Otimizações:
  ✅ Caching em Redis (user sessions, DRE, fluxo)
  ✅ Índices de banco de dados
  ✅ Query optimization (explain plan)
  ✅ Pagination (1000+ registros)
  ✅ Lazy loading (frontend)
  ✅ Image compression
  ✅ Minificação JS/CSS
  ✅ Gzip compression

Targets:
  - API response < 200ms (p95)
  - Dashboard load < 1s
  - Max users: 10.000 simultâneos
```

### **3.3 Integrações Futuras**

```
Gateways de Pagamento:
  ✅ Stripe
  ✅ PayPal
  ✅ Mercado Pago
  ✅ Pix automático

Bancos:
  ✅ OFX (extrato automático)
  ✅ APIs dos grandes bancos
  ✅ Reconciliação automática

Contabilidade:
  ✅ EFD-ECF
  ✅ Sintegra
  ✅ Exportação para Contabilidade

E-commerce:
  ✅ Shopify
  ✅ WooCommerce
  ✅ Hotmart
  ✅ Gumroad
```

---

## FASE 4: MODELO DE NEGÓCIO (SAAS)

### **4.1 Planos**

```yaml
Free:
  - 1 usuário
  - 100 lançamentos/mês
  - 5 clientes
  - Relatórios básicos
  - Limite: 30 dias

Starter: R$ 99/mês
  - 3 usuários
  - Lançamentos ilimitados
  - 50 clientes
  - Relatórios completos
  - 2FA

Pro: R$ 299/mês
  - 10 usuários
  - Tudo do Starter
  - Integrações (Stripe, PayPal)
  - API custom
  - Suporte prioritário

Enterprise: Customizado
  - Usuários ilimitados
  - Integração customizada
  - Dedicated account manager
  - SLA 99.9%
  - Training
```

### **4.2 Receita**

```
MRR Target (ano 1):
  - 100 empresas × Starter (R$ 99) = R$ 9.900
  - 20 empresas × Pro (R$ 299) = R$ 5.980
  - 2 empresas × Enterprise = R$ 3.000
  
  Total: R$ 18.880/mês = R$ 226.560/ano
```

### **4.3 Operações**

```
Suporte:
  - Chat (Intercom/Drift)
  - Email (Zendesk)
  - Documentação (Knowledge base)
  - Video tutorials (Loom)

Monitoring:
  - Uptime monitoring (UptimeRobot)
  - Performance alerts
  - Error tracking
  - User feedback

Compliance:
  - LGPD (lei de proteção de dados)
  - GDPR (se clientes europeus)
  - PCI DSS (se processar cartão)
  - SOC 2 (certificação)
```

---

## ROADMAP IMPLEMENTAÇÃO

### **MÊS 1-2: Infraestrutura**
- [ ] Migrar para PostgreSQL
- [ ] Implementar autenticação JWT real
- [ ] Setup Docker
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Testes automatizados (Jest, Supertest)

### **MÊS 3: Segurança & Performance**
- [ ] 2FA (TOTP)
- [ ] Redis caching
- [ ] Rate limiting
- [ ] HTTPS + certificado
- [ ] Auditoria completa

### **MÊS 4: Integrações**
- [ ] Stripe/PayPal
- [ ] OFX (extrato)
- [ ] PDF export
- [ ] Excel export
- [ ] API públicas

### **MÊS 5: Escalabilidade**
- [ ] Kubernetes deployment
- [ ] Load balancing
- [ ] Auto-scaling
- [ ] CDN
- [ ] Monitoring completo

### **MÊS 6: Lançamento**
- [ ] Landing page
- [ ] Onboarding flow
- [ ] Documentação
- [ ] Suporte (chat)
- [ ] Beta testing com 10 clientes

---

## CUSTOS ESTIMADOS

```
Infraestrutura: R$ 2.000/mês
  - AWS (servidor, DB, storage)
  - CDN (CloudFlare)
  - Monitoring

SaaS Tools: R$ 1.000/mês
  - Sentry (erro tracking)
  - Stripe (payment processing)
  - Intercom (suporte)
  - SendGrid (email)

Pessoas: R$ 8.000/mês
  - 1 desenvolvedor FT (R$ 4.000)
  - 1 DevOps PT (R$ 2.000)
  - 1 suporte PT (R$ 2.000)

Total: R$ 11.000/mês

Break-even: ~6-7 meses
```

---

## MÉTRICAS DE SUCESSO

```
Tecnologia:
  ✅ Uptime: 99.9%
  ✅ API response: < 200ms
  ✅ Error rate: < 0.1%
  ✅ Cobertura de testes: > 80%

Negócio:
  ✅ 100 clientes pagos em 6 meses
  ✅ Churn < 5% ao mês
  ✅ NPS > 50
  ✅ CAC < R$ 500
  ✅ LTV > R$ 5.000
```

---

## PRÓXIMOS PASSOS

1. **Aprovação desta arquitetura** com stakeholders
2. **Criar roadmap detalhado** (sprints de 2 semanas)
3. **Setup inicial** (infraestrutura, CI/CD)
4. **Começar desenvolvimento** (backend robusto)

---

**Criado em:** 2026-05-06  
**Versão:** 1.0  
**Status:** Proposta
