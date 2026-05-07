# Financial Calculations Documentation

**Version:** 1.0  
**Last Updated:** 2026-05-07  
**Accounting Standard:** IFRS / Brazilian Accounting Standards

## DRE (Demonstração de Resultado do Exercício)

### Overview
The DRE is an income statement showing revenue minus costs/expenses, resulting in profit or loss for a period.

### Formula Components

#### 1. Receita Bruta (Gross Revenue)

**Definition:** Total amount of all payments received in the period, before deductions.

**Formula:**
```
receita_bruta = SUM(charges.amount_cents) / 100
WHERE charges.status = 'paid' AND MONTH(charges.paid_at) = period_month
```

**Calculation Logic:**
```javascript
const charges = [
  { amount_cents: 10000 },  // R$ 100
  { amount_cents: 25000 },  // R$ 250
  { amount_cents: 15000 }   // R$ 150
];

const receitaBruta = charges.reduce((sum, c) => sum + c.amount_cents, 0) / 100;
// Result: 500
```

**Supported Periods:**
- Monthly: Charges where `paid_at` falls within the calendar month
- Quarterly: Sum of 3 consecutive months (Q1 = Jan+Feb+Mar, etc.)
- Annual: Sum of all 12 months

**Edge Cases:**
- No charges in period: Return 0
- Partial refunds: Include as negative amounts, reduce gross revenue
- Multiple payment methods: Combine all into single gross figure

#### 2. Taxas (Fees/Commissions)

**Definition:** Payment processing fees, typically 4% of gross revenue.

**Formula:**
```
taxas = receita_bruta × 0.04
```

**Assumptions:**
- Standard fee rate: 4% (configurable)
- Applied uniformly to all revenue sources
- Excludes specific payment method discounts (simplified model)

**Calculation:**
```javascript
const FEE_RATE = 0.04;  // 4%
const receitaBruta = 500;
const taxas = receitaBruta * FEE_RATE;
// Result: 20 (R$ 20)
```

**Notes:**
- Fee rate may vary by payment method in future (PIX 1%, Boleto 2%, CC 3.5%)
- Currently applies uniform rate for simplicity
- Includes both gateway fees and internal processing fees

#### 3. Receita Líquida (Net Revenue)

**Definition:** Gross revenue after deducting all fees and commissions.

**Formula:**
```
receita_liquida = receita_bruta - taxas
```

**Calculation:**
```javascript
const receitaBruta = 500;
const taxas = 20;
const receitaLiquida = receitaBruta - taxas;
// Result: 480 (R$ 480)
```

**Importance:**
- Primary metric for profitability analysis
- Used for gross margin calculation
- Basis for expense ratio analysis

---

## Cash Flow

### Daily Cash Flow

#### Inflows (Entradas)

**Definition:** All money received on a given day.

**Sources:**
- Charge payments (PIX, Boleto, Credit Card)
- Refund reversals
- Other revenue streams

**Formula:**
```
inflows = SUM(charges.amount WHERE status='paid' AND payment_date=date)
```

#### Outflows (Saídas)

**Definition:** All money spent on a given day.

**Categories:**
- Refunds issued
- Chargebacks
- Operating expenses
- Payouts to users

**Formula:**
```
outflows = SUM(refunds.amount WHERE date=date) + SUM(chargebacks.amount WHERE date=date)
```

#### Net Cash Flow

**Formula:**
```
net_cash_flow = inflows - outflows
```

**Calculation Example:**
```javascript
const date = '2026-05-07';
const inflows = 10000;    // Received payments
const outflows = 2000;    // Refunds + chargebacks
const netCash = inflows - outflows;
// Result: 8000 (R$ 8,000 net positive)
```

#### Cumulative Cash Position

**Definition:** Running total of cash balance over time.

**Formula:**
```
position[date] = position[previous_date] + net_cash_flow[date]
```

**Stress Analysis:**
```
is_stressed = MIN(position[period]) < STRESS_THRESHOLD
stress_threshold = 50000  // R$ 50,000
```

**Example:**
```
2026-05-01: balance = 100,000 + 5,000 = 105,000
2026-05-02: balance = 105,000 + (-2,000) = 103,000
2026-05-03: balance = 103,000 + 8,000 = 111,000
```

---

### Payment Method Breakdown

#### By Payment Method

**Calculation:**
```javascript
const inflows = 250000;

const byMethod = {
  PIX: { amount: 150000, percentage: (150000/250000)*100 },      // 60%
  Boleto: { amount: 75000, percentage: (75000/250000)*100 },     // 30%
  CreditCard: { amount: 25000, percentage: (25000/250000)*100 }  // 10%
};
```

#### Projected vs Realized

**Projected:** Based on `next_charge_date` from active subscriptions

**Realized:** Actual payments received in period

**Variance:**
```
variance = realized - projected
variance_percentage = (variance / projected) × 100
```

**Example:**
```
Projected: R$ 50,000
Realized: R$ 48,500
Variance: -R$ 1,500 (-3%)
```

---

## Recurring Revenue Metrics

### MRR (Monthly Recurring Revenue)

**Definition:** Total monthly recurring revenue from all active subscriptions.

**Formula:**
```
MRR = SUM(subscriptions.plan.amount_cents) / 100
WHERE subscriptions.status = 'active'
```

**Calculation:**
```javascript
const subscriptions = [
  { status: 'active', plan: { amount_cents: 19900 } },   // R$ 199
  { status: 'active', plan: { amount_cents: 49900 } },   // R$ 499
  { status: 'canceled', plan: { amount_cents: 29900 } }  // Excluded
];

const mrr = subscriptions
  .filter(s => s.status === 'active')
  .reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100;
// Result: 698 (R$ 698)
```

**Important Notes:**
- Only counts **active** subscriptions
- Excludes canceled subscriptions
- Excludes paused subscriptions
- Handles null plans with default 0

#### Handling Different Billing Cycles

For subscriptions with non-monthly cycles, normalize to monthly:

```javascript
const amount = sub.billing_cycle === 'annual'
  ? sub.amount_cents / 12  // Divide annual by 12
  : sub.amount_cents;       // Use monthly directly

const mrrMonthly = amount / 100;
```

**Example:**
```
Monthly sub: R$ 199 → MRR contribution = R$ 199
Annual sub: R$ 1,199 → MRR contribution = R$ 99.92 (1199÷12)
```

### ARR (Annual Recurring Revenue)

**Definition:** Total annual recurring revenue (MRR × 12).

**Formula:**
```
ARR = MRR × 12
```

**Calculation:**
```javascript
const mrr = 1000;
const arr = mrr * 12;
// Result: 12000 (R$ 12,000)
```

**Precision Handling:**
```javascript
// For fractional MRR
const mrr = 1234.567;
const arr = mrr * 12;  // 14814.804
const formatted = parseFloat(arr.toFixed(2));
// Result: 14814.80
```

### Churn Rate

**Definition:** Percentage of subscriptions canceled in a period.

**Formula:**
```
churn_rate = (canceled_subscriptions / active_at_period_start) × 100
```

**Calculation:**
```javascript
const activeAtStart = 100;
const canceledInPeriod = 10;
let churnRate = (canceledInPeriod / activeAtStart) * 100;
// Result: 10 (10%)

// Apply caps
churnRate = Math.max(0, churnRate);      // Min 0%
churnRate = Math.min(100, churnRate);    // Max 100%

// Format to 2 decimals
churnRate = parseFloat(churnRate.toFixed(2));
```

**Edge Cases:**
- No subscriptions at start: Return 0 (division by zero protection)
- More canceled than started: Cap at 100%
- Negative churn: Clamp to 0

**Health Thresholds:**
| Range | Status | Action |
|-------|--------|--------|
| 0-2% | Excellent | No action needed |
| 2-5% | Healthy | Monitor |
| 5-10% | Warning | Investigate causes |
| 10%+ | Critical | Immediate action required |

### LTV (Lifetime Value)

**Definition:** Expected total revenue from a customer over their lifetime.

**Formula (Simple):**
```
LTV = average_subscription_value × average_lifetime_months
```

**Formula (With Gross Margin):**
```
LTV = average_subscription_value × gross_margin × average_lifetime_months
```

**Calculating Average Lifetime from Churn:**
```javascript
const monthlyChurnRate = 0.05;  // 5% per month
const avgLifetime = 1 / monthlyChurnRate;
// Result: 20 months (customer lasts ~20 months on average)
```

**Calculation Example:**
```javascript
// Simple LTV
const avgValue = 300;
const avgLifetime = 12;
const ltv = avgValue * avgLifetime;
// Result: 3600 (R$ 3,600)

// With margin
const grossMargin = 0.60;
const ltv_with_margin = avgValue * grossMargin * avgLifetime;
// Result: 2160 (R$ 2,160)
```

**Multiple Pricing Tiers:**
```javascript
const subscriptions = [
  { tier: 'basic', value: 199, count: 40, avgLifetime: 12 },
  { tier: 'pro', value: 499, count: 50, avgLifetime: 18 },
  { tier: 'enterprise', value: 1999, count: 10, avgLifetime: 24 }
];

const totalLTV = subscriptions.reduce((sum, sub) =>
  sum + (sub.value * sub.count * sub.avgLifetime), 0
);
// Result: 1,024,380
// Breakdown:
//   Basic: 199 × 40 × 12 = 95,520
//   Pro: 499 × 50 × 18 = 449,100
//   Enterprise: 1999 × 10 × 24 = 479,760
```

### CAC (Customer Acquisition Cost)

**Definition:** Average cost to acquire a new customer.

**Formula:**
```
CAC = total_marketing_spend / new_customers_acquired
```

**Calculation:**
```javascript
const marketingSpend = 50000;
const newCustomers = 500;
const cac = marketingSpend / newCustomers;
// Result: 100 (R$ 100 per customer)

// Payback period
const monthlyMargin = 250;
const paybackMonths = cac / monthlyMargin;
// Result: 0.4 months (payback in 12 days)
```

#### LTV:CAC Ratio

**Definition:** Ratio showing relationship between lifetime value and acquisition cost.

**Formula:**
```
ltv_cac_ratio = LTV / CAC
```

**Health Thresholds:**
| Ratio | Status | Recommendation |
|-------|--------|---|
| > 3.0 | Excellent | Scaling opportunity |
| 2.0-3.0 | Good | Sustainable growth |
| 1.0-2.0 | Borderline | Review efficiency |
| < 1.0 | Poor | Not profitable |

**Example:**
```javascript
const ltv = 3000;
const cac = 500;
const ratio = ltv / cac;
// Result: 6.0 (excellent - spending R$ 1 to get R$ 6 lifetime value)
```

---

## Forecast Calculations

### 30-Day Forecast

**Basis:** Next charge dates from active subscriptions

**Calculation:**
```javascript
const subscriptions = [
  { next_charge_date: '2026-05-15', plan: { amount_cents: 19900 } },
  { next_charge_date: '2026-05-20', plan: { amount_cents: 49900 } }
];

const forecast30d = subscriptions
  .filter(s => daysUntil(s.next_charge_date) <= 30)
  .reduce((sum, s) => sum + s.plan.amount_cents, 0) / 100;
```

### 90-Day Forecast

**Calculation:** Same as 30-day but with 90-day window and confidence adjustment.

```javascript
const forecast90d = forecast30d * confidence_factor;
// confidence_factor = 0.75 (75% confidence for 90-day forecast)
```

### Confidence Scoring

**By Payment Method:**
| Method | Confidence |
|--------|---|
| PIX | 95% |
| Boleto | 70% |
| Credit Card | 40% |

**Calculation:**
```javascript
const weighted_forecast = 
  (pix_amount * 0.95) +
  (boleto_amount * 0.70) +
  (cc_amount * 0.40);
```

**Overall Confidence:**
```javascript
const overall_confidence = weighted_forecast / total_forecast;
```

### Risk Scenarios

**Base Case:** Current forecast (50% probability)

**Churn +5%:** Reduce forecast by 5% (25% probability)
```
revenue_adjusted = revenue × (1 - 0.05)
```

**Churn +10%:** Reduce forecast by 10% (15% probability)
```
revenue_adjusted = revenue × (1 - 0.10)
```

**Churn +15%:** Reduce forecast by 15% (10% probability)
```
revenue_adjusted = revenue × (1 - 0.15)
```

---

## Variance Analysis

### Forecast vs Actual Comparison

**Formula:**
```
variance = actual - forecast
variance_percentage = (variance / forecast) × 100
```

**Calculation:**
```javascript
const forecast = 50000;
const actual = 48500;
const variance = actual - forecast;  // -1500
const variance_pct = (variance / forecast) * 100;  // -3%
```

**Accuracy Classification:**
| Variance | Status |
|----------|--------|
| ±2% | Excellent |
| ±5% | Good |
| ±10% | Acceptable |
| ±20% | Poor |
| > ±20% | Critical |

---

## Data Integrity Checks

### Orphaned Charges Detection

**Definition:** Charges without valid subscription reference.

**Query:**
```sql
SELECT charges.* FROM charges
WHERE charges.subscription_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.id = charges.subscription_id)
```

### Duplicate Payment Detection

**Definition:** Multiple payments with same gateway reference.

**Query:**
```javascript
const gatewayIds = new Set();
const duplicates = [];

charges.forEach(charge => {
  if (gatewayIds.has(charge.gateway_id)) {
    duplicates.push(charge.id);
  }
  gatewayIds.add(charge.gateway_id);
});
```

### Currency Consistency

**Requirement:** All amounts in BRL (Brazilian Real).

**Validation:**
```javascript
const allBRL = charges.every(c => c.currency === 'BRL');
const hasNegative = charges.some(c => c.amount < 0);  // Refunds
```

### Audit Log Reconciliation

**Requirement:** All charges must have corresponding audit log entries.

**Query:**
```javascript
const auditedCharges = charges.filter(c =>
  auditLog.some(a => a.charge_id === c.id && a.event === 'paid')
);

const reconciled = auditedCharges.length === charges.length;
```

---

## Performance Considerations

### Indexing Strategy

**Recommended Indexes:**
```sql
CREATE INDEX idx_charges_status_date ON charges(status, paid_at);
CREATE INDEX idx_charges_tenant_date ON charges(tenant_id, paid_at);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_charges_gateway_id ON charges(gateway_id);
```

### Query Optimization

**Batch Operations:**
```javascript
// Good: Use Promise.all() for parallel queries
const [charges, subscriptions, refunds] = await Promise.all([
  db.query('SELECT * FROM charges WHERE period = ?'),
  db.query('SELECT * FROM subscriptions WHERE status = ?'),
  db.query('SELECT * FROM refunds WHERE period = ?')
]);

// Avoid: Sequential queries
const charges = await db.query(...);
const subscriptions = await db.query(...);  // Slower
const refunds = await db.query(...);
```

### Caching Strategy

**Completed Months:** Indefinite cache (immutable after month ends)
**Current Month:** 6-hour cache (update every 6 hours)
**Forecasts:** 24-hour cache

---

## Assumptions & Limitations

1. **Single Currency:** All amounts in BRL (no multi-currency support)
2. **Uniform Fee Rate:** 4% fee applied to all revenue (will support per-method rates in future)
3. **Linear Churn:** Assumes constant churn rate (doesn't account for seasonality)
4. **Subscription Stability:** Assumes average lifetime from current churn rate (doesn't predict changes)
5. **No Tax Calculation:** DRE doesn't include tax calculations (out of scope for Phase 2.2)
6. **Payment Timing:** Assumes charges recorded on payment date (not settlement date)

---

## Future Enhancements

1. Support for partial refunds (currently all-or-nothing)
2. Multi-currency support with FX rates
3. Configurable fee rates by payment method
4. ML-based churn prediction for more accurate LTV
5. Seasonality adjustment in forecasts
6. Tax calculation integration (IRRF, PIS, COFINS)
7. Budget vs actual comparison
8. Consolidated multi-tenant reporting

---

## Formula Reference Sheet

| Metric | Formula | Unit |
|--------|---------|------|
| Receita Bruta | SUM(charges) | BRL |
| Taxas | receita_bruta × 0.04 | BRL |
| Receita Líquida | receita_bruta - taxas | BRL |
| MRR | SUM(active subscriptions) | BRL/month |
| ARR | MRR × 12 | BRL/year |
| Churn | (canceled / active_start) × 100 | % |
| LTV | avg_value × avg_lifetime | BRL |
| CAC | marketing_spend / new_customers | BRL |
| LTV:CAC | LTV / CAC | Ratio |
| Forecast | SUM(next_charges × confidence) | BRL |
| Variance | actual - forecast | BRL |
