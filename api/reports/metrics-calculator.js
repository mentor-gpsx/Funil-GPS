/**
 * api/reports/metrics-calculator.js
 * Recurring Revenue Metrics calculation engine
 * Calculates: MRR, ARR, Churn, LTV, CAC
 * AC-4: Recurring Revenue Metrics
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Calculate Monthly Recurring Revenue (MRR)
 * Sum of all active subscription plan amounts
 */
async function calculateMRR(tenantId) {
  try {
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('plan:plans(amount_cents)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const mrr = subscriptions?.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100 || 0;
    return mrr;

  } catch (err) {
    console.error(`[MRR] Calculation error:`, err.message);
    throw err;
  }
}

/**
 * Calculate Annual Recurring Revenue (ARR)
 * ARR = MRR × 12
 */
async function calculateARR(tenantId) {
  const mrr = await calculateMRR(tenantId);
  return mrr * 12;
}

/**
 * Calculate Churn Rate
 * (canceled subscriptions / active at period start) × 100
 */
async function calculateChurn(tenantId, periodStart, periodEnd) {
  try {
    // Get active subscriptions at period start
    const { data: activeStart } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .lt('started_at', periodStart.toISOString())
      .eq('status', 'active');

    // Get canceled subscriptions during period
    const { data: canceled } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('canceled_at', periodStart.toISOString())
      .lte('canceled_at', periodEnd.toISOString());

    const churnRate = activeStart?.length > 0
      ? ((canceled?.length || 0) / activeStart.length) * 100
      : 0;

    return parseFloat(churnRate.toFixed(2));

  } catch (err) {
    console.error(`[Churn] Calculation error:`, err.message);
    throw err;
  }
}

/**
 * Calculate Customer Lifetime Value (LTV)
 * LTV = (average subscription value × expected lifetime in months) / monthly churn rate
 * OR = average subscription value × expected lifetime
 */
async function calculateLTV(tenantId, periodStart, periodEnd, expectedLifetimeMonths = 24) {
  try {
    // Get all canceled subscriptions with durations
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select(`
        id,
        started_at,
        canceled_at,
        plan:plans(amount_cents)
      `)
      .eq('tenant_id', tenantId);

    if (!subscriptions || subscriptions.length === 0) {
      return 0;
    }

    let totalLTV = 0;
    let completedSubscriptions = 0;

    subscriptions.forEach(sub => {
      if (sub.canceled_at) {
        // Completed subscription: actual LTV is revenue received
        const startDate = new Date(sub.started_at);
        const endDate = new Date(sub.canceled_at);
        const lifetimeMonths = (endDate - startDate) / (1000 * 60 * 60 * 24 * 30);
        const monthlyValue = sub.plan?.amount_cents || 0;
        const ltv = (monthlyValue * lifetimeMonths) / 100;

        totalLTV += ltv;
        completedSubscriptions++;
      }
    });

    const avgLTV = completedSubscriptions > 0 ? totalLTV / completedSubscriptions : 0;
    return Math.round(avgLTV * 100) / 100;

  } catch (err) {
    console.error(`[LTV] Calculation error:`, err.message);
    throw err;
  }
}

/**
 * Calculate Customer Acquisition Cost (CAC)
 * CAC = (total marketing spend / new customers acquired) in period
 * Note: Requires marketing spend data - for now accepts manual input
 */
async function calculateCAC(tenantId, periodStart, periodEnd, marketingSpend = 0) {
  try {
    // Count new customers in period
    const { data: customers } = await supabase
      .from('subscriptions')
      .select('customer_id', { distinct: true })
      .eq('tenant_id', tenantId)
      .gte('started_at', periodStart.toISOString())
      .lte('started_at', periodEnd.toISOString());

    const newCustomers = customers?.length || 0;

    if (newCustomers === 0 || marketingSpend === 0) {
      return 0;
    }

    const cac = marketingSpend / newCustomers;
    return Math.round(cac * 100) / 100;

  } catch (err) {
    console.error(`[CAC] Calculation error:`, err.message);
    throw err;
  }
}

/**
 * Calculate all recurring revenue metrics for a period
 * Returns: MRR, ARR, churn, LTV, CAC as a complete package
 */
async function calculateRecurringMetrics(tenantId, periodStart, periodEnd, marketingSpend = 0) {
  try {
    const [mrr, arr, churn, ltv, cac] = await Promise.all([
      calculateMRR(tenantId),
      calculateARR(tenantId),
      calculateChurn(tenantId, periodStart, periodEnd),
      calculateLTV(tenantId, periodStart, periodEnd),
      calculateCAC(tenantId, periodStart, periodEnd, marketingSpend)
    ]);

    return {
      period: {
        start_date: periodStart.toISOString().split('T')[0],
        end_date: periodEnd.toISOString().split('T')[0]
      },
      metrics: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        churn_rate: churn,
        ltv: ltv,
        cac: cac,
        ltv_cac_ratio: cac > 0 ? Math.round((ltv / cac) * 100) / 100 : 0
      }
    };

  } catch (err) {
    console.error(`[Recurring Metrics] Calculation error:`, err.message);
    throw err;
  }
}

/**
 * Get subscription cohort analysis
 * Groups subscriptions by start month to track cohort health
 */
async function getSubscriptionCohorts(tenantId) {
  try {
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, started_at, canceled_at, status, plan:plans(amount_cents)')
      .eq('tenant_id', tenantId);

    const cohorts = {};

    subscriptions?.forEach(sub => {
      const cohortMonth = sub.started_at.split('T')[0].substring(0, 7); // YYYY-MM

      if (!cohorts[cohortMonth]) {
        cohorts[cohortMonth] = {
          month: cohortMonth,
          started: 0,
          active: 0,
          canceled: 0,
          mrr: 0,
          churn_rate: 0
        };
      }

      cohorts[cohortMonth].started++;

      if (sub.status === 'active') {
        cohorts[cohortMonth].active++;
        cohorts[cohortMonth].mrr += sub.plan?.amount_cents || 0;
      } else if (sub.status === 'canceled') {
        cohorts[cohortMonth].canceled++;
      }
    });

    // Calculate churn rates
    Object.values(cohorts).forEach(cohort => {
      cohort.mrr = Math.round((cohort.mrr / 100) * 100) / 100;
      cohort.churn_rate = cohort.started > 0
        ? parseFloat(((cohort.canceled / cohort.started) * 100).toFixed(2))
        : 0;
    });

    return Object.values(cohorts).sort((a, b) => b.month.localeCompare(a.month));

  } catch (err) {
    console.error(`[Cohorts] Calculation error:`, err.message);
    throw err;
  }
}

module.exports = {
  calculateMRR,
  calculateARR,
  calculateChurn,
  calculateLTV,
  calculateCAC,
  calculateRecurringMetrics,
  getSubscriptionCohorts
};
