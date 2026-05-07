/**
 * api/reports/cash-flow-calculator.js
 * Cash Flow calculation engine
 * Calculates: daily inflows (payments) - outflows (refunds/chargebacks)
 * AC-2: Cash Flow Statement
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Calculate cash flow for date range
 * Returns: daily net cash, inflows, outflows with payment method breakdown
 */
async function calculateCashFlow(tenantId, startDate, endDate) {
  try {
    // 1. Fetch all charges in date range
    const { data: charges } = await supabase
      .from('charges')
      .select('id, paid_at, amount_cents, status, payment_method')
      .eq('tenant_id', tenantId)
      .gte('paid_at', startDate.toISOString())
      .lte('paid_at', endDate.toISOString());

    // 2. Aggregate by date
    const dailyCashFlow = aggregateDailyFlow(charges);

    // 3. Calculate running cumulative
    const withCumulative = calculateCumulative(dailyCashFlow, startDate);

    // 4. Get payment method breakdown
    const methodBreakdown = getPaymentMethodBreakdown(charges);

    return {
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      daily_flow: withCumulative,
      payment_method_breakdown: methodBreakdown,
      summary: {
        total_inflows: dailyCashFlow.reduce((sum, d) => sum + d.inflows, 0) / 100,
        total_outflows: dailyCashFlow.reduce((sum, d) => sum + d.outflows, 0) / 100,
        net_cash: (dailyCashFlow.reduce((sum, d) => sum + d.inflows - d.outflows, 0)) / 100,
        days_count: withCumulative.length
      }
    };

  } catch (err) {
    console.error(`[Cash Flow] Calculation error for tenant ${tenantId}:`, err.message);
    throw err;
  }
}

/**
 * Calculate projected vs realized cash flow
 * Uses subscriptions.next_charge_date for projections
 */
async function calculateProjectedCashFlow(tenantId, startDate, endDate) {
  try {
    // 1. Get realized cash flow
    const realizedFlow = await calculateCashFlow(tenantId, startDate, endDate);

    // 2. Get upcoming charges (projected)
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, next_charge_date, plan:plans(amount_cents), payment_method, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .gte('next_charge_date', startDate.toISOString())
      .lte('next_charge_date', endDate.toISOString());

    // 3. Aggregate projected flow by date
    const projectedDaily = aggregateProjectedFlow(subscriptions);

    return {
      realized: realizedFlow,
      projected: {
        daily_flow: projectedDaily,
        summary: {
          total_projected: subscriptions?.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100 || 0,
          days_count: projectedDaily.length
        }
      }
    };

  } catch (err) {
    console.error(`[Projected Cash Flow] Error:`, err.message);
    throw err;
  }
}

/**
 * Aggregate charges into daily flows
 * Groups by date, calculates inflows (paid) and outflows (refunded/chargeback)
 */
function aggregateDailyFlow(charges) {
  const flowByDate = {};

  charges?.forEach(charge => {
    const date = charge.paid_at.split('T')[0];

    if (!flowByDate[date]) {
      flowByDate[date] = {
        date,
        inflows: 0,
        outflows: 0,
        by_method: {}
      };
    }

    if (charge.status === 'paid') {
      flowByDate[date].inflows += charge.amount_cents;
      flowByDate[date].by_method[charge.payment_method] =
        (flowByDate[date].by_method[charge.payment_method] || 0) + charge.amount_cents;
    } else if (charge.status === 'refunded' || charge.status === 'chargeback') {
      flowByDate[date].outflows += charge.amount_cents;
    }
  });

  return Object.values(flowByDate).sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Aggregate projected flow from subscriptions
 */
function aggregateProjectedFlow(subscriptions) {
  const flowByDate = {};

  subscriptions?.forEach(sub => {
    const date = sub.next_charge_date.split('T')[0];
    const amount = sub.plan?.amount_cents || 0;

    if (!flowByDate[date]) {
      flowByDate[date] = {
        date,
        projected_inflows: 0,
        by_method: {}
      };
    }

    flowByDate[date].projected_inflows += amount;
    flowByDate[date].by_method[sub.payment_method] =
      (flowByDate[date].by_method[sub.payment_method] || 0) + amount;
  });

  return Object.values(flowByDate).sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Calculate cumulative cash position
 */
function calculateCumulative(dailyFlow, startDate) {
  let cumulative = 0;

  return dailyFlow.map(day => {
    const netCash = day.inflows - day.outflows;
    cumulative += netCash;

    return {
      ...day,
      net_cash: netCash,
      cumulative_position: cumulative,
      inflows: Math.round(day.inflows / 100 * 100) / 100,
      outflows: Math.round(day.outflows / 100 * 100) / 100
    };
  });
}

/**
 * Break down cash flow by payment method
 * Shows contributions from PIX, Boleto, Credit Card, etc.
 */
function getPaymentMethodBreakdown(charges) {
  const breakdown = {};

  charges?.forEach(charge => {
    if (!breakdown[charge.payment_method]) {
      breakdown[charge.payment_method] = {
        payment_method: charge.payment_method,
        total_inflows: 0,
        total_outflows: 0,
        transaction_count: 0
      };
    }

    if (charge.status === 'paid') {
      breakdown[charge.payment_method].total_inflows += charge.amount_cents;
    } else if (charge.status === 'refunded' || charge.status === 'chargeback') {
      breakdown[charge.payment_method].total_outflows += charge.amount_cents;
    }

    breakdown[charge.payment_method].transaction_count += 1;
  });

  // Convert cents to reais and calculate percentages
  const total = Object.values(breakdown).reduce((sum, m) => sum + m.total_inflows, 0);

  return Object.values(breakdown).map(method => ({
    ...method,
    total_inflows: Math.round(method.total_inflows / 100 * 100) / 100,
    total_outflows: Math.round(method.total_outflows / 100 * 100) / 100,
    percentage_of_total: total > 0 ? ((method.total_inflows / total) * 100).toFixed(2) : '0.00'
  }));
}

module.exports = {
  calculateCashFlow,
  calculateProjectedCashFlow,
  aggregateDailyFlow,
  aggregateProjectedFlow,
  getPaymentMethodBreakdown
};
