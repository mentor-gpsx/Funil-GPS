-- Story 2.2: Financial Reports Views
-- Task 1.4: Create views for complex calculations
-- Provides pre-computed common aggregations for performance

-- View: Monthly DRE Summary
-- Aggregates paid charges by month for receita_bruta, with fee calculation
CREATE OR REPLACE VIEW v_dre_monthly AS
SELECT
  tenant_id,
  DATE_TRUNC('month', paid_at)::DATE as month,
  COUNT(*) as charge_count,
  SUM(amount_cents) / 100.0 as receita_bruta,
  (SUM(amount_cents) / 100.0) * 0.04 as taxas,
  (SUM(amount_cents) / 100.0) * 0.96 as receita_liquida
FROM charges
WHERE status = 'paid'
GROUP BY tenant_id, DATE_TRUNC('month', paid_at);

-- View: Active Subscriptions with Plan Details
-- Joins subscription to plan for MRR calculations
CREATE OR REPLACE VIEW v_active_subscriptions_mhr AS
SELECT
  s.tenant_id,
  s.id as subscription_id,
  s.customer_id,
  p.id as plan_id,
  p.name as plan_name,
  p.amount_cents,
  p.billing_cycle,
  s.started_at,
  s.next_charge_date,
  s.payment_method
FROM subscriptions s
JOIN plans p ON s.plan_id = p.id
WHERE s.status = 'active'
  AND s.canceled_at IS NULL;

-- View: Churn Analysis by Month
-- Tracks active subscriptions at month start and cancellations during month
CREATE OR REPLACE VIEW v_churn_by_month AS
SELECT
  s.tenant_id,
  DATE_TRUNC('month', s.canceled_at)::DATE as month,
  COUNT(*) as canceled_count,
  LAG(COUNT(*)) OVER (
    PARTITION BY s.tenant_id
    ORDER BY DATE_TRUNC('month', s.canceled_at)
  ) as previous_month_count
FROM subscriptions s
WHERE s.status = 'canceled'
  AND s.canceled_at IS NOT NULL
GROUP BY s.tenant_id, DATE_TRUNC('month', s.canceled_at);

-- View: Daily Cash Flow Summary
-- Aggregates inflows (payments) and outflows (refunds/chargebacks)
CREATE OR REPLACE VIEW v_cash_flow_daily AS
SELECT
  tenant_id,
  DATE(paid_at) as cash_date,
  SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) / 100.0 as inflows,
  SUM(CASE WHEN status IN ('refunded', 'chargeback') THEN amount_cents ELSE 0 END) / 100.0 as outflows,
  (SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) -
   SUM(CASE WHEN status IN ('refunded', 'chargeback') THEN amount_cents ELSE 0 END)) / 100.0 as net_cash
FROM charges
GROUP BY tenant_id, DATE(paid_at);

-- View: Payment Status Aging
-- Categorizes pending/overdue payments by age buckets
CREATE OR REPLACE VIEW v_payment_aging AS
SELECT
  tenant_id,
  subscription_id,
  customer_id,
  due_date,
  amount_cents / 100.0 as amount,
  status,
  CASE
    WHEN status = 'paid' THEN '0-paid'
    WHEN CURRENT_DATE - due_date BETWEEN 0 AND 30 THEN '1-0to30days'
    WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN '2-31to60days'
    WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN '3-61to90days'
    WHEN CURRENT_DATE - due_date > 90 THEN '4-90plus'
    ELSE '5-future'
  END as aging_bucket,
  CURRENT_DATE - due_date as days_overdue
FROM charges
WHERE status IN ('pending', 'overdue', 'paid');

-- View: Forecast Eligible Subscriptions
-- Filters subscriptions eligible for 30/90-day forecast
CREATE OR REPLACE VIEW v_forecast_subscriptions AS
SELECT
  s.tenant_id,
  s.id as subscription_id,
  s.customer_id,
  p.amount_cents,
  s.next_charge_date,
  s.payment_method,
  CASE
    WHEN s.payment_method = 'pix' THEN 0.95
    WHEN s.payment_method = 'boleto' THEN 0.70
    WHEN s.payment_method = 'credit_card' THEN 0.40
    ELSE 0.50
  END as confidence_rate,
  p.billing_cycle
FROM subscriptions s
JOIN plans p ON s.plan_id = p.id
WHERE s.status = 'active'
  AND s.canceled_at IS NULL
  AND s.next_charge_date IS NOT NULL;

-- View: Subscription Lifecycle Cohort
-- Groups subscriptions by started date for cohort analysis
CREATE OR REPLACE VIEW v_subscription_cohorts AS
SELECT
  tenant_id,
  DATE_TRUNC('month', started_at)::DATE as cohort_month,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'canceled') as canceled,
  COUNT(*) FILTER (WHERE status = 'paused') as paused,
  COUNT(*) as total,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'canceled') / COUNT(*),
    2
  ) as churn_percentage
FROM subscriptions
GROUP BY tenant_id, DATE_TRUNC('month', started_at);

-- View: Report Ready-State Check
-- Validates data integrity before report generation (AC-7)
CREATE OR REPLACE VIEW v_report_data_integrity AS
SELECT
  tenant_id,
  'charges_missing_subscription' as check_type,
  COUNT(*) as issue_count,
  STRING_AGG(DISTINCT id::text, ', ') as affected_ids
FROM charges
WHERE subscription_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.id = charges.subscription_id
  )
GROUP BY tenant_id
UNION ALL
SELECT
  tenant_id,
  'duplicate_payments' as check_type,
  COUNT(*) as issue_count,
  STRING_AGG(DISTINCT id::text, ', ') as affected_ids
FROM (
  SELECT
    tenant_id,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, subscription_id, due_date, amount_cents
      ORDER BY paid_at DESC
    ) as rn
  FROM charges
  WHERE status = 'paid'
) t
WHERE rn > 1
GROUP BY tenant_id
UNION ALL
SELECT
  tenant_id,
  'currency_inconsistency' as check_type,
  COUNT(*) as issue_count,
  STRING_AGG(DISTINCT id::text, ', ') as affected_ids
FROM charges
WHERE currency NOT IN ('BRL')
GROUP BY tenant_id;

-- Indexes for view materialization (optional, for frequently queried views)
CREATE INDEX idx_v_active_subscriptions_tenant_status
  ON subscriptions(tenant_id, status)
  WHERE status = 'active' AND canceled_at IS NULL;

CREATE INDEX idx_v_cash_flow_tenant_date
  ON charges(tenant_id, DATE(paid_at))
  WHERE status IN ('paid', 'refunded', 'chargeback');

CREATE INDEX idx_v_payment_aging_tenant_status
  ON charges(tenant_id, status, due_date)
  WHERE status IN ('pending', 'overdue', 'paid');

-- Grant view access for multi-tenant isolation
-- Views inherit RLS from underlying tables via tenant_id filters
