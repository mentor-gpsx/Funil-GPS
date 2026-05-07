/**
 * api/reports/forecast-calculator.js
 * 30/90-day revenue forecast with confidence scoring
 * AC-5: Forecast & Projections with risk scenarios
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Confidence rates by payment method
const CONFIDENCE_RATES = {
  'pix': 0.95,       // 95% collection rate
  'boleto': 0.70,    // 70% collection rate
  'credit_card': 0.40 // 40% collection rate
};

/**
 * Calculate 30-day revenue forecast
 * Based on next_charge_date from active subscriptions
 */
async function calculateForecast30(tenantId) {
  try {
    const today = new Date();
    const forecastEnd = new Date(today);
    forecastEnd.setDate(forecastEnd.getDate() + 30);

    const forecast = await calculateForecastPeriod(tenantId, today, forecastEnd, 30);
    return forecast;

  } catch (err) {
    console.error(`[Forecast 30D] Error:`, err.message);
    throw err;
  }
}

/**
 * Calculate 90-day revenue forecast
 * Based on next_charge_date from active subscriptions
 */
async function calculateForecast90(tenantId) {
  try {
    const today = new Date();
    const forecastEnd = new Date(today);
    forecastEnd.setDate(forecastEnd.getDate() + 90);

    const forecast = await calculateForecastPeriod(tenantId, today, forecastEnd, 90);
    return forecast;

  } catch (err) {
    console.error(`[Forecast 90D] Error:`, err.message);
    throw err;
  }
}

/**
 * Calculate forecast for specific period
 * Aggregates by next_charge_date with confidence weighting
 */
async function calculateForecastPeriod(tenantId, startDate, endDate, days) {
  try {
    // Fetch subscriptions with upcoming charges
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, next_charge_date, plan:plans(amount_cents), payment_method, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .gte('next_charge_date', startDate.toISOString())
      .lte('next_charge_date', endDate.toISOString());

    // Aggregate by date with confidence scoring
    const forecastByDate = aggregateForecastByDate(subscriptions);

    // Calculate confidence tiers
    const confidenceTiers = calculateConfidenceTiers(subscriptions);

    // Calculate total with variance
    const totals = calculateForecastTotals(subscriptions, confidenceTiers);

    return {
      period: {
        days,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      },
      daily_forecast: forecastByDate,
      confidence: confidenceTiers,
      totals,
      subscription_count: subscriptions?.length || 0
    };

  } catch (err) {
    console.error(`[Forecast Period] Error:`, err.message);
    throw err;
  }
}

/**
 * Aggregate forecast by next_charge_date
 */
function aggregateForecastByDate(subscriptions) {
  const forecastByDate = {};

  subscriptions?.forEach(sub => {
    const date = sub.next_charge_date.split('T')[0];
    const amount = sub.plan?.amount_cents || 0;
    const confidence = CONFIDENCE_RATES[sub.payment_method] || 0.5;

    if (!forecastByDate[date]) {
      forecastByDate[date] = {
        date,
        total_forecast: 0,
        high_confidence: 0,      // PIX
        medium_confidence: 0,    // Boleto
        low_confidence: 0,       // CC
        subscription_count: 0
      };
    }

    forecastByDate[date].total_forecast += amount;
    forecastByDate[date].subscription_count++;

    if (sub.payment_method === 'pix') {
      forecastByDate[date].high_confidence += amount;
    } else if (sub.payment_method === 'boleto') {
      forecastByDate[date].medium_confidence += amount;
    } else if (sub.payment_method === 'credit_card') {
      forecastByDate[date].low_confidence += amount;
    }
  });

  // Convert to array and format currencies
  return Object.values(forecastByDate)
    .map(day => ({
      ...day,
      total_forecast: Math.round(day.total_forecast / 100 * 100) / 100,
      high_confidence: Math.round(day.high_confidence / 100 * 100) / 100,
      medium_confidence: Math.round(day.medium_confidence / 100 * 100) / 100,
      low_confidence: Math.round(day.low_confidence / 100 * 100) / 100,
      weighted_forecast: Math.round(
        (day.high_confidence * 0.95 + day.medium_confidence * 0.70 + day.low_confidence * 0.40) / 100 * 100
      ) / 100
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Calculate confidence tiers
 * Groups forecast value by confidence level
 */
function calculateConfidenceTiers(subscriptions) {
  const tiers = {
    high: { count: 0, amount: 0, percentage: 0 },      // PIX - 95%
    medium: { count: 0, amount: 0, percentage: 0 },    // Boleto - 70%
    low: { count: 0, amount: 0, percentage: 0 }        // CC - 40%
  };

  let totalAmount = 0;

  subscriptions?.forEach(sub => {
    const amount = sub.plan?.amount_cents || 0;
    totalAmount += amount;

    if (sub.payment_method === 'pix') {
      tiers.high.count++;
      tiers.high.amount += amount;
    } else if (sub.payment_method === 'boleto') {
      tiers.medium.count++;
      tiers.medium.amount += amount;
    } else if (sub.payment_method === 'credit_card') {
      tiers.low.count++;
      tiers.low.amount += amount;
    }
  });

  // Calculate percentages and convert to reais
  ['high', 'medium', 'low'].forEach(tier => {
    tiers[tier].amount = Math.round(tiers[tier].amount / 100 * 100) / 100;
    tiers[tier].percentage = totalAmount > 0
      ? ((subscriptions.filter(s => {
        if (tier === 'high') return s.payment_method === 'pix';
        if (tier === 'medium') return s.payment_method === 'boleto';
        if (tier === 'low') return s.payment_method === 'credit_card';
      }).length / subscriptions.length) * 100).toFixed(2)
      : '0.00';
  });

  return tiers;
}

/**
 * Calculate forecast totals with weighted confidence
 */
function calculateForecastTotals(subscriptions, confidenceTiers) {
  const total = subscriptions?.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) || 0;

  const weighted = (
    confidenceTiers.high.amount * 0.95 +
    confidenceTiers.medium.amount * 0.70 +
    confidenceTiers.low.amount * 0.40
  );

  return {
    total_forecast: Math.round(total / 100 * 100) / 100,
    weighted_forecast: Math.round(weighted * 100) / 100,
    confidence_scenarios: {
      optimistic: total / 100,  // 100% collection
      realistic: weighted,      // Weighted by method confidence
      pessimistic: (total / 100) * 0.5  // 50% collection worst case
    }
  };
}

/**
 * Calculate risk scenarios
 * Models impact of churn increases (+5%, +10%, +15%)
 */
async function calculateRiskScenarios(tenantId) {
  try {
    // Get current forecast
    const forecast30 = await calculateForecast30(tenantId);
    const baselineTotal = forecast30.totals.weighted_forecast;

    // Fetch active subscriptions for churn modeling
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, plan:plans(amount_cents)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const activeCount = subscriptions?.length || 0;

    // Model scenarios
    return {
      baseline: {
        forecast_30d: baselineTotal,
        active_subscriptions: activeCount
      },
      scenarios: [
        {
          name: 'Churn +5%',
          churn_increase: 5,
          expected_cancellations: Math.floor(activeCount * 0.05),
          forecast_impact: baselineTotal * 0.95,
          revenue_loss: baselineTotal * 0.05
        },
        {
          name: 'Churn +10%',
          churn_increase: 10,
          expected_cancellations: Math.floor(activeCount * 0.10),
          forecast_impact: baselineTotal * 0.90,
          revenue_loss: baselineTotal * 0.10
        },
        {
          name: 'Churn +15%',
          churn_increase: 15,
          expected_cancellations: Math.floor(activeCount * 0.15),
          forecast_impact: baselineTotal * 0.85,
          revenue_loss: baselineTotal * 0.15
        }
      ]
    };

  } catch (err) {
    console.error(`[Risk Scenarios] Error:`, err.message);
    throw err;
  }
}

/**
 * Calculate variance analysis
 * Compares forecast vs actual realized revenue
 */
async function calculateVarianceAnalysis(tenantId, periodStart, periodEnd) {
  try {
    // Get realized charges in period
    const { data: charges } = await supabase
      .from('charges')
      .select('amount_cents, status, paid_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .gte('paid_at', periodStart.toISOString())
      .lte('paid_at', periodEnd.toISOString());

    const realized = charges?.reduce((sum, c) => sum + c.amount_cents, 0) / 100 || 0;

    // Get forecast for same period (from subscriptions that were charged)
    const { data: historicalSubs } = await supabase
      .from('subscriptions')
      .select('id, plan:plans(amount_cents)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const forecast = historicalSubs?.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100 || 0;

    const variance = realized - forecast;
    const variancePercentage = forecast > 0 ? ((variance / forecast) * 100) : 0;

    return {
      period: {
        start_date: periodStart.toISOString().split('T')[0],
        end_date: periodEnd.toISOString().split('T')[0]
      },
      forecast: Math.round(forecast * 100) / 100,
      realized: Math.round(realized * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variance_percentage: Math.round(variancePercentage * 100) / 100,
      accuracy: Math.round((1 - Math.abs(variance / (forecast || 1))) * 100)
    };

  } catch (err) {
    console.error(`[Variance Analysis] Error:`, err.message);
    throw err;
  }
}

module.exports = {
  calculateForecast30,
  calculateForecast90,
  calculateForecastPeriod,
  calculateRiskScenarios,
  calculateVarianceAnalysis
};
