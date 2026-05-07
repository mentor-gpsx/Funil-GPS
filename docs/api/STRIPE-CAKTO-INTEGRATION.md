# Stripe & Cakto Integration Guide

**Version:** 1.0  
**Last Updated:** 2026-05-07  
**Scope:** Payment processing integration with Financial Reports

## Overview

The Financial Reporting system integrates with Stripe and Cakto to:
1. Retrieve charge data for DRE calculations
2. Track subscription information for MRR calculations
3. Monitor payment status and aging
4. Forecast future revenue based on scheduled charges

### Integration Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Application Layer                          │
│  DRE | Cash Flow | Metrics | Forecast | Export Endpoints    │
└────────────────┬─────────────────────────────────────────────┘
                 │
        ┌────────▼────────────────────────────┐
        │   Financial Reports Service         │
        │  (Calculations & Aggregations)      │
        └────┬──────────────────────────────┬─┘
             │                              │
    ┌────────▼────────┐         ┌──────────▼─────────┐
    │  Stripe Client  │         │  Cakto Client      │
    │  (webhook)      │         │  (API polling)     │
    └────────┬────────┘         └──────────┬─────────┘
             │                              │
    ┌────────▼────────┐         ┌──────────▼─────────┐
    │  Stripe API     │         │  Cakto API         │
    │  External       │         │  External          │
    └─────────────────┘         └────────────────────┘
```

---

## Stripe Integration

### API Credentials

**Setup:**
```env
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_ENDPOINT=/webhooks/stripe
```

**Obtain keys from:**
1. Login to Stripe Dashboard (dashboard.stripe.com)
2. Navigate to: Developers → API Keys
3. Copy Secret Key (sk_live_...) for production
4. Create webhook endpoint URL (e.g., https://api.example.com/webhooks/stripe)

### Webhook Events

The system subscribes to these Stripe events for real-time updates:

| Event | Use |
|-------|-----|
| `charge.succeeded` | Record payment received |
| `charge.failed` | Mark charge as failed |
| `charge.refunded` | Track refunds for cash flow |
| `charge.dispute.created` | Flag chargeback |
| `customer.subscription.created` | Add new subscription |
| `customer.subscription.updated` | Update subscription details |
| `customer.subscription.deleted` | Mark subscription as canceled |

**Webhook Endpoint Handler:**
```javascript
// POST /webhooks/stripe
app.post('/webhooks/stripe', bodyParser.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    switch (event.type) {
      case 'charge.succeeded':
        await handleChargeSucceeded(event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      // ... handle other events
    }
    
    res.json({received: true});
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
```

### Retrieving Charges from Stripe

**Method 1: Webhook (Real-time)**
- Event triggered immediately when charge processed
- Most reliable for current data
- Only captures events after setup

**Method 2: API Polling (Historical)**
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Fetch charges for period
const charges = await stripe.charges.list({
  created: {
    gte: Math.floor(periodStart / 1000),
    lte: Math.floor(periodEnd / 1000)
  },
  limit: 100,
  expand: ['data.customer', 'data.refunds']
});

charges.data.forEach(charge => {
  // Process charge
  if (charge.paid) {
    recordCharge({
      gateway_id: charge.id,
      customer_id: charge.customer,
      amount_cents: charge.amount,
      status: 'paid',
      paid_at: new Date(charge.created * 1000),
      payment_method: charge.payment_method_details?.type
    });
  }
});
```

### Mapping Stripe Data to Financial System

```javascript
// Stripe charge → Financial charge
const stripeChargeToFinancial = (stripeCharge) => ({
  // Core fields
  gateway: 'stripe',
  gateway_id: stripeCharge.id,
  customer_gateway_id: stripeCharge.customer,
  
  // Amount (convert from cents)
  amount_cents: stripeCharge.amount,
  amount: stripeCharge.amount / 100,
  currency: stripeCharge.currency.toUpperCase(),
  
  // Status mapping
  status: mapStripeStatus(stripeCharge.status, stripeCharge.paid),
  paid_at: stripeCharge.paid ? new Date(stripeCharge.created * 1000) : null,
  
  // Payment method
  payment_method: mapStripePaymentMethod(stripeCharge.payment_method_details),
  
  // Metadata
  description: stripeCharge.description,
  metadata: stripeCharge.metadata,
  
  // Refund tracking
  refunded: stripeCharge.refunded,
  refunded_amount_cents: stripeCharge.amount_refunded,
  refund_reason: stripeCharge.fraud_details?.reason,
  
  // Dispute tracking
  disputed: !!stripeCharge.dispute,
  dispute_id: stripeCharge.dispute?.id
});

// Status mapping
const mapStripeStatus = (status, paid) => {
  if (paid) return 'paid';
  if (status === 'failed') return 'failed';
  return 'pending';
};

// Payment method mapping
const mapStripePaymentMethod = (details) => {
  if (!details) return 'unknown';
  
  switch (details.type) {
    case 'card':
      return `credit_card_${details.card?.brand || 'unknown'}`;
    case 'bank_account':
      return 'bank_transfer';
    case 'source':
      // Map source type to internal category
      switch (details.source?.type) {
        case 'card': return 'credit_card';
        case 'ach_credit_transfer': return 'ach';
        case 'sepa_credit_transfer': return 'sepa';
        default: return 'other';
      }
    default:
      return 'other';
  }
};
```

### Retrieving Subscriptions from Stripe

```javascript
// Fetch active subscriptions for MRR
const subscriptions = await stripe.subscriptions.list({
  status: 'active',
  limit: 100,
  expand: ['data.customer', 'data.default_payment_method']
});

subscriptions.data.forEach(sub => {
  recordSubscription({
    gateway: 'stripe',
    gateway_id: sub.id,
    customer_gateway_id: sub.customer,
    status: 'active',
    plan: {
      name: sub.items.data[0].price.nickname,
      amount_cents: sub.items.data[0].price.unit_amount,
      billing_cycle: mapBillingInterval(sub.items.data[0].price.recurring.interval),
      interval_count: sub.items.data[0].price.recurring.interval_count
    },
    next_charge_date: new Date(sub.current_period_end * 1000)
  });
});

// Billing cycle mapping
const mapBillingInterval = (interval) => {
  return {
    day: 'daily',
    week: 'weekly',
    month: 'monthly',
    year: 'annual'
  }[interval];
};
```

### Handling Refunds and Chargebacks

**Refunds:**
```javascript
// Via webhook event: charge.refunded
const handleChargeRefunded = async (charge) => {
  // Record refund
  await recordRefund({
    original_charge_id: charge.id,
    amount_cents: charge.amount_refunded,
    reason: charge.refund_reason || 'customer_request',
    refunded_at: new Date(),
    gateway_refund_id: charge.refunds.data[0]?.id
  });
  
  // Update cash flow (outflow)
  await addCashFlowOutflow({
    type: 'refund',
    date: new Date(),
    amount_cents: charge.amount_refunded
  });
};
```

**Chargebacks:**
```javascript
// Via API polling or webhook
const handleChargeback = async (dispute) => {
  // Record dispute
  await recordDispute({
    charge_id: dispute.charge,
    dispute_id: dispute.id,
    status: mapDisputeStatus(dispute.status),
    amount_cents: dispute.amount,
    reason: dispute.reason,
    evidence_deadline: new Date(dispute.evidence_due_by * 1000)
  });
  
  // Flag for accounting review
  await flagChargeForReview({
    charge_id: dispute.charge,
    reason: 'chargeback_dispute',
    priority: 'high'
  });
};
```

### Sync Schedule

**Webhooks (Primary):**
- Immediate: charge.succeeded, charge.refunded, subscription events
- Latency: < 5 seconds (Stripe SLA)

**API Polling (Secondary):**
- Fallback if webhook fails
- Schedule: Every 1 hour
- Fetch last 24 hours of data
- Reconcile with webhook data

```javascript
// Scheduled polling (every hour)
setInterval(async () => {
  const past24h = new Date(Date.now() - 24*60*60*1000);
  
  // Fetch recent charges
  const charges = await stripe.charges.list({
    created: { gte: Math.floor(past24h / 1000) },
    limit: 100
  });
  
  // Reconcile: check if already in system via webhook
  for (const charge of charges.data) {
    const exists = await getChargeByGatewayId(charge.id);
    if (!exists) {
      // Webhook must have failed, record now
      await recordCharge(stripeChargeToFinancial(charge));
    }
  }
}, 60 * 60 * 1000); // 1 hour
```

---

## Cakto Integration

### API Credentials

**Setup:**
```env
CAKTO_API_URL=https://api.cakto.com.br/v1
CAKTO_API_KEY=api_key_xxxxxxxxxxxxxxxxxxxxx
CAKTO_WEBHOOK_SECRET=webhook_secret_xxxxxxxxxxxxxxxxxxxxx
CAKTO_ACCOUNT_ID=account_xxxxxxxxxxxxxxxxxxxxx
```

**Obtain from:**
1. Login to Cakto Dashboard (dashboard.cakto.com.br)
2. Navigate to: Configurações → Integrações → API
3. Copy API Key and Account ID
4. Register webhook URL

### API Endpoints

**List Transactions:**
```javascript
const cakto = require('cakto-sdk');
const client = new cakto.Client({
  apiKey: process.env.CAKTO_API_KEY,
  accountId: process.env.CAKTO_ACCOUNT_ID
});

// Fetch transactions for period
const transactions = await client.transactions.list({
  dateFrom: '2026-05-01',
  dateTo: '2026-05-31',
  limit: 100,
  offset: 0
});

transactions.data.forEach(txn => {
  processTransaction(txn);
});
```

### Mapping Cakto Data

```javascript
// Cakto transaction → Financial charge/refund
const caktoTransactionToFinancial = (txn) => {
  // Distinguish charges from refunds by status
  if (txn.type === 'CREDIT' && txn.status === 'SETTLED') {
    return {
      type: 'charge',
      gateway: 'cakto',
      gateway_id: txn.id,
      customer_id: txn.accountCode,
      
      // Amount (Cakto provides in BRL)
      amount_cents: Math.round(txn.amount * 100),
      amount: txn.amount,
      currency: 'BRL',
      
      // Status
      status: 'paid',  // Only settled txns here
      paid_at: parseDate(txn.settledDate || txn.createdDate),
      
      // Payment method
      payment_method: mapCaktoPaymentMethod(txn.paymentMethod),
      
      // Fees
      fee_amount_cents: Math.round((txn.fee || 0) * 100),
      
      // Metadata
      description: txn.description,
      invoice_number: txn.referenceId
    };
  } else if (txn.type === 'DEBIT') {
    return {
      type: 'refund',
      gateway: 'cakto',
      gateway_refund_id: txn.id,
      original_charge_id: txn.originalTransactionId,
      
      amount_cents: Math.round(txn.amount * 100),
      amount: txn.amount,
      reason: txn.description,
      refunded_at: parseDate(txn.createdDate)
    };
  }
};

// Payment method mapping
const mapCaktoPaymentMethod = (method) => {
  const mapping = {
    'PIX': 'pix',
    'BOLETO': 'boleto',
    'TRANSFERENCIA': 'bank_transfer',
    'CARTAO_CREDITO': 'credit_card',
    'CARTAO_DEBITO': 'debit_card'
  };
  return mapping[method] || method.toLowerCase();
};

const parseDate = (dateStr) => {
  // Cakto returns ISO format
  return new Date(dateStr);
};
```

### Webhook Events

```javascript
// POST /webhooks/cakto
app.post('/webhooks/cakto', bodyParser.json(), async (req, res) => {
  const signature = req.headers['x-cakto-signature'];
  const body = JSON.stringify(req.body);
  
  // Verify signature
  const hash = crypto
    .createHmac('sha256', process.env.CAKTO_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  
  if (hash !== signature) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = req.body;
  
  switch (event.type) {
    case 'transaction.settled':
      await handleCaktoTransaction(event.data);
      break;
    case 'transaction.failed':
      await handleCaktoFailure(event.data);
      break;
    case 'refund.processed':
      await handleCaktoRefund(event.data);
      break;
  }
  
  res.json({received: true});
});
```

### Sync Schedule

**Webhooks (Primary):**
- Transaction.settled: When funds clear (T+1 to T+3 days)
- Refund.processed: When refund issued

**API Polling (Secondary):**
```javascript
// Poll every 2 hours for recent transactions
setInterval(async () => {
  const past2h = new Date(Date.now() - 2*60*60*1000);
  
  const transactions = await client.transactions.list({
    dateFrom: formatDate(past2h),
    dateTo: formatDate(new Date()),
    status: 'SETTLED'
  });
  
  // Reconcile with webhook data
  for (const txn of transactions.data) {
    const exists = await getTransactionByGatewayId('cakto', txn.id);
    if (!exists) {
      await recordCharge(caktoTransactionToFinancial(txn));
    }
  }
}, 2 * 60 * 60 * 1000); // 2 hours
```

---

## Data Reconciliation

### Daily Reconciliation Process

**Schedule:** 00:30 UTC daily

```javascript
const reconcile = async (date) => {
  // 1. Fetch from Stripe for date
  const stripeCharges = await stripe.charges.list({
    created: {
      gte: Math.floor(startOfDay(date) / 1000),
      lte: Math.floor(endOfDay(date) / 1000)
    }
  });
  
  // 2. Fetch from Cakto for date
  const caktoTxns = await client.transactions.list({
    dateFrom: formatDate(startOfDay(date)),
    dateTo: formatDate(endOfDay(date))
  });
  
  // 3. Compare totals
  const stripeTotalCents = stripeCharges.data.reduce((sum, c) => 
    sum + (c.paid ? c.amount : 0), 0);
  const caktoTotalCents = caktoTxns.data.reduce((sum, t) =>
    sum + (t.status === 'SETTLED' ? Math.round(t.amount * 100) : 0), 0);
  
  // 4. Flag discrepancies
  if (Math.abs(stripeTotalCents - caktoTotalCents) > 100) { // > R$ 1 diff
    await flagDiscrepancy({
      date: date,
      gateway1: 'stripe',
      amount1: stripeTotalCents / 100,
      gateway2: 'cakto',
      amount2: caktoTotalCents / 100,
      variance: (stripeTotalCents - caktoTotalCents) / 100
    });
  }
};

// Run daily at 00:30 UTC
schedule.scheduleJob('30 0 * * *', () => {
  reconcile(new Date(Date.now() - 24*60*60*1000)); // Yesterday's data
});
```

### Handling Discrepancies

**If Stripe > Cakto:**
- Cakto settlement delayed (T+1 to T+3)
- Wait for webhook event
- Check if transaction pending in Cakto

**If Cakto > Stripe:**
- Webhook failure on Stripe side
- Manually fetch missing charges
- Investigate webhook logs

**Resolution:**
1. Flag in accounting system for review
2. Contact gateway support if > 1% variance
3. Log discrepancy for audit trail

---

## Fee Handling

### Stripe Fees

**Charged to account:** 2.9% + R$ 0.30 per transaction

```javascript
// Calculate fee (for display/reporting)
const stripeFee = (amount) => {
  return (amount * 0.029) + 0.30;  // BRL
};

// Record in financial system
const recordStripeCharge = async (stripeCharge) => {
  const fee = stripeFee(stripeCharge.amount / 100);
  
  await db.query(
    `INSERT INTO charges (...) VALUES (...)`,
    [
      stripeCharge.id,
      stripeCharge.amount,
      'paid',
      fee * 100,  // Convert to cents
      mapPaymentMethod(stripeCharge)
    ]
  );
};
```

### Cakto Fees

**Included in settlement:** Actual fee shown in webhook

```javascript
const recordCaktoTransaction = async (caktoTxn) => {
  const fee = (caktoTxn.fee || 0) * 100;  // Already in BRL, convert to cents
  
  await db.query(
    `INSERT INTO charges (...) VALUES (...)`,
    [
      caktoTxn.id,
      Math.round(caktoTxn.amount * 100),
      'paid',
      Math.round(fee),  // Fee in cents
      mapCaktoPaymentMethod(caktoTxn.paymentMethod)
    ]
  );
};
```

---

## Error Handling

### Webhook Failures

**Stripe retry policy:**
- Retries for 3 days
- Exponential backoff
- Check webhook logs for failures

**Recovery:**
```javascript
// Manually fetch failed events
const missedEvents = await stripe.events.list({
  type: 'charge.succeeded',
  created: {
    gte: Math.floor((Date.now() - 7*24*60*60*1000) / 1000)
  }
});

for (const event of missedEvents.data) {
  if (!await hasBeenProcessed(event.id)) {
    await processEvent(event);
  }
}
```

### API Rate Limiting

**Stripe:** 100 requests/second (very generous)
**Cakto:** 1000 requests/hour

**Handling:**
```javascript
const withRateLimit = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (err.code === 'rate_limit_error') {
      // Exponential backoff
      await sleep(Math.random() * 5000);
      return withRateLimit(fn);
    }
    throw err;
  }
};
```

---

## Testing Integration

### Test Mode Keys

**Stripe:**
```env
# Use test keys for development
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxxxxxxxxxxxxxxxxxx
```

**Create test transactions:**
```javascript
// Create test charge
const charge = await stripe.charges.create({
  amount: 10000,  // R$ 100
  currency: 'brl',
  source: 'tok_visa',  // Test card
  description: 'Test charge'
});

// Verify webhook received
```

**Cakto:**
- Uses same test API endpoint
- Test transactions don't settle
- No actual funds transferred

### Manual Testing Checklist

- [ ] Stripe webhook received for charge.succeeded
- [ ] Charge recorded in charges table
- [ ] DRE endpoint returns updated revenue
- [ ] MRR calculation includes new subscription
- [ ] Cash flow updated for payment method
- [ ] Refund handled correctly
- [ ] Chargeback flagged for review
- [ ] Cakto transaction synced
- [ ] Reconciliation passes
- [ ] Fees calculated correctly

---

## Troubleshooting

### Webhook Not Firing

1. **Check webhook endpoint:**
   - Verify HTTPS and valid SSL cert
   - Test endpoint returns 200 OK
   - Check logs for failed deliveries

2. **Verify webhook secret:**
   ```javascript
   // Test signature verification
   const testEvent = {/* sample event */};
   const signature = crypto
     .createHmac('sha256', webhookSecret)
     .update(JSON.stringify(testEvent))
     .digest('hex');
   ```

3. **Re-send failed events in Stripe Dashboard**

### Sync Delay (Data Appears Late)

- Stripe: < 5 seconds typically
- Cakto: Can take 1-3 days for settlement
- Check gateway status pages

### Duplicate Charges

- Use idempotency keys:
  ```javascript
  const charge = await stripe.charges.create(
    { amount: 10000, currency: 'brl' },
    { idempotencyKey: uniqueId }
  );
  ```
- Check before inserting to database

---

## Performance Optimization

### Connection Pooling

```javascript
// Reuse Stripe client instance
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
module.exports = stripe;  // Import where needed
```

### Batch Processing

```javascript
// Process webhooks asynchronously
const queue = new Queue('webhook_processing', redisConfig);

app.post('/webhooks/stripe', (req, res) => {
  // Queue job immediately
  queue.add(req.body, { removeOnComplete: true });
  
  // Return 200 quickly
  res.json({received: true});
  
  // Process in background
});

queue.process(async (job) => {
  await handleStripeEvent(job.data);
});
```

---

## References

- Stripe API: https://stripe.com/docs/api
- Cakto API: https://docs.cakto.com.br/
- Financial Reports API: `/docs/api/FINANCIAL-REPORTS-API.md`

