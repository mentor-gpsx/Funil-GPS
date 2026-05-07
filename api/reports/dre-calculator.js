/**
 * api/reports/dre-calculator.js
 * DRE (Demonstração de Resultado do Exercício) calculation engine
 * Calculates: receita_bruta, taxas, receita_liquida, MRR, churn
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const FEE_RATE = 0.04; // 4% default fee rate (configurable per tenant)

/**
 * Calculate DRE for given period
 * Returns: receita_bruta, taxas, receita_liquida, MRR, churn_rate
 */
async function calculateDRE(tenantId, period) {
  try {
    // Parse period (YYYY-MM, YYYY-Q1, YYYY)
    const { startDate, endDate } = parsePeriod(period);

    // 1. Calculate receita_bruta (gross revenue from paid charges)
    const { data: charges } = await supabase
      .from('charges')
      .select('amount_cents')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .gte('paid_at', startDate.toISOString())
      .lte('paid_at', endDate.toISOString());

    const receitaBruta = (charges?.reduce((sum, c) => sum + c.amount_cents, 0) || 0) / 100;

    // 2. Calculate taxas (fees)
    const taxas = receitaBruta * FEE_RATE;

    // 3. Calculate receita_liquida (net revenue)
    const receitaLiquida = receitaBruta - taxas;

    // 4. Calculate MRR (Monthly Recurring Revenue from active subscriptions)
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('plan:plans(amount_cents)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const mrr = (subscriptions?.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) || 0) / 100;

    // 5. Calculate churn rate
    const { data: activeStart } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .lt('started_at', startDate.toISOString());

    const { data: canceled } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('status', 'canceled')
      .gte('canceled_at', startDate.toISOString())
      .lte('canceled_at', endDate.toISOString());

    const churnRate = activeStart?.length > 0
      ? ((canceled?.length || 0) / activeStart.length) * 100
      : 0;

    return {
      period,
      receita_bruta: receitaBruta,
      taxas,
      receita_liquida: receitaLiquida,
      mrr,
      churn_rate: parseFloat(churnRate.toFixed(2))
    };
  } catch (err) {
    console.error(`[DRE] Calculation error for tenant ${tenantId}:`, err.message);
    throw err;
  }
}

/**
 * Parse period string (YYYY-MM, YYYY-Q1, YYYY)
 * Returns { startDate, endDate }
 */
function parsePeriod(period) {
  const now = new Date();

  if (period.match(/^\d{4}-\d{2}$/)) {
    // Monthly: YYYY-MM
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    return { startDate, endDate };
  }

  if (period.match(/^\d{4}-Q[1-4]$/)) {
    // Quarterly: YYYY-Q1
    const [year, quarter] = period.match(/(\d{4})-Q(\d)/);
    const monthStart = (parseInt(quarter) - 1) * 3;
    const startDate = new Date(parseInt(year), monthStart, 1);
    const endDate = new Date(parseInt(year), monthStart + 3, 0, 23, 59, 59);
    return { startDate, endDate };
  }

  if (period.match(/^\d{4}$/)) {
    // Annually: YYYY
    const year = parseInt(period);
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);
    return { startDate, endDate };
  }

  throw new Error(`Invalid period format: ${period}. Use YYYY-MM, YYYY-Q1-Q4, or YYYY`);
}

/**
 * Compare DRE between two periods
 * Returns variance: percentage change from previous to current
 */
async function comparePeriods(tenantId, currentPeriod, previousPeriod) {
  const current = await calculateDRE(tenantId, currentPeriod);
  const previous = await calculateDRE(tenantId, previousPeriod);

  return {
    current,
    previous,
    variance: {
      receita_bruta_pct: ((current.receita_bruta - previous.receita_bruta) / previous.receita_bruta) * 100,
      mrr_pct: ((current.mrr - previous.mrr) / previous.mrr) * 100,
      churn_change: current.churn_rate - previous.churn_rate
    }
  };
}

module.exports = {
  calculateDRE,
  comparePeriods,
  parsePeriod
};
