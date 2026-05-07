-- Migration: Initial Billing Schema
-- Date: 2026-04-23
-- Description: Create customers, plans, subscriptions, charges, webhooks tables with indexes

-- ============================================
-- CUSTOMERS TABLE
-- ============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  payment_method TEXT CHECK (payment_method IN ('pix', 'boleto', 'cc')) DEFAULT 'pix',
  pix_authorized BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PLANS TABLE
-- ============================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  interval TEXT CHECK (interval IN ('monthly', 'annual')) DEFAULT 'monthly',
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT CHECK (status IN ('active', 'past_due', 'suspended', 'canceled')) DEFAULT 'active',
  started_at TIMESTAMP DEFAULT NOW(),
  next_charge_date DATE NOT NULL,
  current_period_start TIMESTAMP DEFAULT NOW(),
  current_period_end TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  canceled_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CHARGES TABLE
-- ============================================
CREATE TABLE charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded')) DEFAULT 'pending',
  payment_method TEXT,
  due_date DATE NOT NULL,
  paid_at TIMESTAMP NULL,
  failed_count INTEGER DEFAULT 0 CHECK (failed_count >= 0),
  next_retry_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  gateway_charge_id TEXT UNIQUE
);

-- ============================================
-- WEBHOOKS TABLE (Audit Log)
-- ============================================
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  charge_id UUID REFERENCES charges(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMP NULL,
  received_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES (Performance Critical)
-- ============================================

-- Subscriptions indexes
CREATE INDEX idx_subscriptions_next_charge
  ON subscriptions(next_charge_date)
  WHERE status = 'active';

CREATE INDEX idx_subscriptions_customer
  ON subscriptions(customer_id);

CREATE INDEX idx_subscriptions_status
  ON subscriptions(status);

-- Charges indexes
CREATE INDEX idx_charges_due_date
  ON charges(due_date)
  WHERE status IN ('pending', 'failed');

CREATE INDEX idx_charges_status
  ON charges(status);

CREATE INDEX idx_charges_subscription
  ON charges(subscription_id);

CREATE INDEX idx_charges_customer
  ON charges(customer_id);

-- Webhooks indexes
CREATE INDEX idx_webhooks_event
  ON webhooks(event);

CREATE INDEX idx_webhooks_charge
  ON webhooks(charge_id);

CREATE INDEX idx_webhooks_received
  ON webhooks(received_at DESC);

-- ============================================
-- TRIGGERS: Auto-update timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_timestamp
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_plans_timestamp
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_subscriptions_timestamp
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_charges_timestamp
  BEFORE UPDATE ON charges
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
