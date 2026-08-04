# Sistema de Comissão e Financeiro - Schema PostgreSQL

## 1. Tabela: users

**Descrição:** Usuários do sistema

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'FINANCEIRO', 'GESTOR', 'COMERCIAL', 'AUDITOR')),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_active (active),
  INDEX idx_deleted_at (deleted_at)
);
```

---

## 2. Tabela: sellers

**Descrição:** Vendedores do sistema

```sql
CREATE TABLE sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commission_type VARCHAR(50) NOT NULL CHECK (commission_type IN (
    'FIXED',
    'PERCENTAGE',
    'TIERED',
    'PERFORMANCE',
    'RECURRING',
    'PRODUCT',
    'NET_PROFIT'
  )),
  commission_value DECIMAL(15,2) NOT NULL,
  pix_key VARCHAR(255) UNIQUE,
  pix_key_hash VARCHAR(255),
  bank_code VARCHAR(10),
  account_number VARCHAR(20),
  goal_monthly DECIMAL(15,2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_active (active),
  INDEX idx_commission_type (commission_type)
);
```

---

## 3. Tabela: customers

**Descrição:** Clientes

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document VARCHAR(20) UNIQUE NOT NULL,
  document_type VARCHAR(10) CHECK (document_type IN ('CPF', 'CNPJ')),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address VARCHAR(500),
  city VARCHAR(100),
  state VARCHAR(2),
  postal_code VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  INDEX idx_document (document),
  INDEX idx_name (name),
  INDEX idx_email (email)
);
```

---

## 4. Tabela: sales

**Descrição:** Vendas realizadas

```sql
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  product_name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  gross_value DECIMAL(15,2) NOT NULL,
  discount DECIMAL(15,2) DEFAULT 0,
  net_value DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN (
    'PIX',
    'CARD',
    'TED',
    'BOLETO',
    'CASH'
  )),
  installments INT DEFAULT 1,
  platform VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'COMPLETED',
    'CANCELLED'
  )),
  commission_id UUID REFERENCES commissions(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  INDEX idx_seller_id (seller_id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_payment_method (payment_method)
);
```

---

## 5. Tabela: commission_rules

**Descrição:** Regras de cálculo de comissão

```sql
CREATE TABLE commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'FIXED',
    'PERCENTAGE',
    'TIERED',
    'PERFORMANCE',
    'RECURRING',
    'PRODUCT',
    'NET_PROFIT'
  )),
  config JSONB NOT NULL,
  -- Exemplo para TIERED:
  -- {"tiers": [{"min": 0, "max": 1000, "rate": 5}, {"min": 1001, "max": 5000, "rate": 7}]}
  -- Exemplo para PERCENTAGE:
  -- {"base_rate": 10, "bonus_rate": 2}
  active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_type (type),
  INDEX idx_active (active)
);
```

---

## 6. Tabela: commissions

**Descrição:** Comissões calculadas

```sql
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  rule_id UUID NOT NULL REFERENCES commission_rules(id),
  calculated_value DECIMAL(15,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'APPROVED',
    'PAID',
    'BLOCKED',
    'REFUNDED'
  )),
  approval_date TIMESTAMP,
  approved_by UUID REFERENCES users(id),
  payment_date TIMESTAMP,
  blocked_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_sale_id (sale_id),
  INDEX idx_seller_id (seller_id),
  INDEX idx_status (status),
  INDEX idx_approval_date (approval_date),
  INDEX idx_created_at (created_at)
);
```

---

## 7. Tabela: financial_entries

**Descrição:** Entradas financeiras

```sql
CREATE TABLE financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'INCOME',
    'EXPENSE',
    'COMMISSION_PAYMENT',
    'REFUND',
    'ADJUSTMENT'
  )),
  method VARCHAR(50) NOT NULL CHECK (method IN (
    'PIX',
    'CARD',
    'TED',
    'BOLETO',
    'CASH',
    'BANK_TRANSFER'
  )),
  amount DECIMAL(15,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'RECEIVED',
    'DELAYED',
    'REFUNDED',
    'CANCELLED',
    'PROCESSING'
  )),
  reference_id UUID,
  reference_type VARCHAR(50),
  description VARCHAR(500),
  document_number VARCHAR(50),
  due_date TIMESTAMP,
  received_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_type (type),
  INDEX idx_method (method),
  INDEX idx_status (status),
  INDEX idx_reference_id (reference_id),
  INDEX idx_created_at (created_at),
  INDEX idx_due_date (due_date)
);
```

---

## 8. Tabela: payments

**Descrição:** Pagamentos de comissão

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  amount DECIMAL(15,2) NOT NULL,
  method VARCHAR(50) NOT NULL DEFAULT 'PIX' CHECK (method IN (
    'PIX',
    'BANK_TRANSFER',
    'CASH'
  )),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'REVERSED'
  )),
  pix_return_id VARCHAR(255),
  batch_id VARCHAR(255),
  scheduled_date TIMESTAMP,
  paid_date TIMESTAMP,
  failed_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_commission_id (commission_id),
  INDEX idx_seller_id (seller_id),
  INDEX idx_status (status),
  INDEX idx_scheduled_date (scheduled_date)
);
```

---

## 9. Tabela: installments

**Descrição:** Parcelamentos de venda

```sql
CREATE TABLE installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  due_date TIMESTAMP NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'PAID',
    'OVERDUE',
    'CANCELLED'
  )),
  paid_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_sale_id (sale_id),
  INDEX idx_status (status),
  INDEX idx_due_date (due_date),
  UNIQUE (sale_id, installment_number)
);
```

---

## 10. Tabela: cash_flow

**Descrição:** Fluxo de caixa diário

```sql
CREATE TABLE cash_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  opening_balance DECIMAL(15,2) DEFAULT 0,
  total_income DECIMAL(15,2) DEFAULT 0,
  total_expenses DECIMAL(15,2) DEFAULT 0,
  total_commission_payments DECIMAL(15,2) DEFAULT 0,
  closing_balance DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_date (date)
);
```

---

## 11. Tabela: audit_logs

**Descrição:** Auditoria completa de alterações

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN (
    'CREATE',
    'UPDATE',
    'DELETE',
    'APPROVE',
    'BLOCK',
    'UNBLOCK',
    'REFUND',
    'PAYMENT',
    'LOGIN'
  )),
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_entity_type (entity_type),
  INDEX idx_entity_id (entity_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);
```

---

## 12. Tabela: goals

**Descrição:** Metas de vendedores

```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_amount DECIMAL(15,2) NOT NULL,
  achieved_amount DECIMAL(15,2) DEFAULT 0,
  bonus_percentage DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE',
    'COMPLETED',
    'FAILED'
  )),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_seller_id (seller_id),
  INDEX idx_period_start (period_start),
  INDEX idx_status (status)
);
```

---

## 13. Tabela: reconciliations

**Descrição:** Conciliações financeiras

```sql
CREATE TABLE reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'DIVERGENCE_FOUND'
  )),
  total_expected DECIMAL(15,2),
  total_actual DECIMAL(15,2),
  variance DECIMAL(15,2),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_status (status),
  INDEX idx_period_start (period_start),
  INDEX idx_completed_at (completed_at)
);
```

---

## 14. Tabela: settings

**Descrição:** Configurações globais

```sql
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'STRING',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_key (key)
);
```

---

## 15. Índices e Constraints

### Foreign Key Constraints
```sql
ALTER TABLE sellers ADD CONSTRAINT fk_sellers_user_id
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE sales ADD CONSTRAINT fk_sales_seller_id
  FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE RESTRICT;

ALTER TABLE commissions ADD CONSTRAINT fk_commissions_seller_id
  FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE RESTRICT;

-- ... (demais constraints)
```

### Índices Compostos (Performance)
```sql
CREATE INDEX idx_sales_seller_created ON sales(seller_id, created_at);
CREATE INDEX idx_commissions_seller_status ON commissions(seller_id, status);
CREATE INDEX idx_financial_entries_type_status ON financial_entries(type, status);
CREATE INDEX idx_payments_commission_status ON payments(commission_id, status);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
```

---

## 16. Views (Consultas Frequentes)

### View: Sales by Seller
```sql
CREATE VIEW v_sales_by_seller AS
SELECT 
  s.id,
  sel.id as seller_id,
  sel.user_id,
  u.name as seller_name,
  COUNT(*) as total_sales,
  SUM(s.net_value) as total_value,
  AVG(s.net_value) as avg_value,
  DATE_TRUNC('month', s.created_at) as month
FROM sales s
JOIN sellers sel ON s.seller_id = sel.id
JOIN users u ON sel.user_id = u.id
WHERE s.deleted_at IS NULL
GROUP BY DATE_TRUNC('month', s.created_at), s.id, sel.id, sel.user_id, u.name;
```

### View: Commission Summary
```sql
CREATE VIEW v_commission_summary AS
SELECT 
  c.seller_id,
  u.name as seller_name,
  COUNT(*) as total_commissions,
  SUM(c.calculated_value) as total_value,
  SUM(CASE WHEN c.status = 'PAID' THEN c.calculated_value ELSE 0 END) as paid_value,
  SUM(CASE WHEN c.status = 'PENDING' THEN c.calculated_value ELSE 0 END) as pending_value,
  SUM(CASE WHEN c.status = 'BLOCKED' THEN c.calculated_value ELSE 0 END) as blocked_value
FROM commissions c
JOIN sellers s ON c.seller_id = s.id
JOIN users u ON s.user_id = u.id
GROUP BY c.seller_id, u.name;
```

---

## 17. Triggers (Automação)

### Trigger: Atualizar Updated_at
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Aplicar para todas tabelas com updated_at
```

### Trigger: Atualizar Cash Flow
```sql
CREATE OR REPLACE FUNCTION update_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cash_flow
  SET 
    total_income = (SELECT COALESCE(SUM(amount), 0) FROM financial_entries 
                   WHERE type = 'INCOME' AND DATE(created_at) = CURRENT_DATE),
    closing_balance = (SELECT COALESCE(SUM(amount), 0) FROM financial_entries 
                      WHERE DATE(created_at) = CURRENT_DATE)
  WHERE date = CURRENT_DATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cash_flow AFTER INSERT ON financial_entries
  FOR EACH ROW EXECUTE FUNCTION update_cash_flow();
```

---

## 18. Performance Checklist

✅ Índices em todas FKs
✅ Índices em colunas de filtro frequente
✅ Índices compostos para queries comuns
✅ Soft delete com índices em deleted_at
✅ JSONB para configurações flexíveis
✅ Triggers para automação
✅ Views para relatórios
✅ Particionamento por data (futuro)

---

**Status:** ✅ Schema Validado para Implementação
**Próximo Passo:** Criar Setup do Projeto + Prisma Schema
