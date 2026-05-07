-- Story 2.2: Financial Reports Schema & Optimization Indexes
-- Provides optimized query paths for DRE, Cash Flow, and Metrics calculations

-- Indexes for charges table (for DRE and Cash Flow queries)
CREATE INDEX IF NOT EXISTS idx_charges_status_paid_at
  ON charges(status, paid_at)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_charges_subscription_status
  ON charges(subscription_id, status);

-- Indexes for subscriptions (for MRR, churn, forecast queries)
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_started
  ON subscriptions(status, started_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_charge
  ON subscriptions(next_charge_date);

CREATE INDEX IF NOT EXISTS idx_subscriptions_canceled
  ON subscriptions(canceled_at)
  WHERE status = 'canceled';

-- Index for payment status aging analysis
CREATE INDEX IF NOT EXISTS idx_charges_due_date_status
  ON charges(due_date, status);

-- Cache table for monthly DRE reports (AC8: Caching strategy)
CREATE TABLE IF NOT EXISTS dre_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  period TEXT NOT NULL, -- Format: YYYY-MM
  receita_bruta NUMERIC(15,2),
  taxas NUMERIC(15,2),
  receita_liquida NUMERIC(15,2),
  mrr NUMERIC(15,2),
  churn_rate NUMERIC(5,2),
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE(tenant_id, period)
);

CREATE INDEX IF NOT EXISTS idx_dre_cache_tenant_period
  ON dre_cache(tenant_id, period);

-- Cache table for forecasts
CREATE TABLE IF NOT EXISTS forecast_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  forecast_days INTEGER, -- 30 or 90
  total_forecast NUMERIC(15,2),
  confidence_high NUMERIC(15,2),
  confidence_medium NUMERIC(15,2),
  confidence_low NUMERIC(15,2),
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE(tenant_id, forecast_days)
);

CREATE INDEX IF NOT EXISTS idx_forecast_cache_tenant_days
  ON forecast_cache(tenant_id, forecast_days);

-- Audit trail for report generation (AC7: Data validation & audit)
CREATE TABLE IF NOT EXISTS report_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  report_type TEXT NOT NULL, -- 'dre', 'cash_flow', 'payment_status'
  period_start DATE,
  period_end DATE,
  record_count INTEGER,
  validation_errors TEXT[], -- Array of validation error messages
  generated_at TIMESTAMP DEFAULT NOW(),
  generated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_report_audit_tenant_type
  ON report_audit(tenant_id, report_type, generated_at DESC);
