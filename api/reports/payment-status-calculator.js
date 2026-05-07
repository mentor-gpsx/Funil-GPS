/**
 * api/reports/payment-status-calculator.js
 * Payment Status and Aging Analysis calculation engine
 * AC-3: Payment Status Analysis with aging buckets
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Calculate payment status analysis with aging
 * Returns: on-time, pending, overdue counts with aging breakdown
 */
async function calculatePaymentStatus(tenantId) {
  try {
    const today = new Date();

    // 1. Fetch all charges with subscription details
    const { data: charges } = await supabase
      .from('charges')
      .select('id, customer_id, subscription_id, amount_cents, due_date, status, payment_method')
      .eq('tenant_id', tenantId);

    // 2. Calculate aging for unpaid charges
    const agingAnalysis = calculateAging(charges, today);

    // 3. Get by-customer breakdown
    const byCustomer = breakdownByCustomer(charges, today);

    // 4. Get by-method breakdown
    const byMethod = breakdownByMethod(charges, today);

    // 5. Identify at-risk customers
    const atRiskCustomers = identifyAtRiskCustomers(charges, today);

    return {
      summary: {
        pagamentos_em_dia: agingAnalysis.onTime.count,
        pagamentos_em_dia_pct: agingAnalysis.onTime.percentage,
        pagamentos_pendentes: agingAnalysis.pending.count,
        pagamentos_atrasados: agingAnalysis.overdue.count,
        total_pendente_valor: agingAnalysis.pending.amount / 100,
        total_atrasado_valor: agingAnalysis.overdue.amount / 100
      },
      aging_analysis: agingAnalysis.buckets,
      by_customer: byCustomer,
      by_method: byMethod,
      at_risk_customers: atRiskCustomers,
      report_date: today.toISOString().split('T')[0]
    };

  } catch (err) {
    console.error(`[Payment Status] Calculation error for tenant ${tenantId}:`, err.message);
    throw err;
  }
}

/**
 * Calculate aging buckets for unpaid charges
 * Categories: 0-30, 31-60, 61-90, 90+ days past due
 */
function calculateAging(charges, today) {
  const buckets = {
    '0-30days': { count: 0, amount: 0, percentage: 0 },
    '31-60days': { count: 0, amount: 0, percentage: 0 },
    '61-90days': { count: 0, amount: 0, percentage: 0 },
    '90plus': { count: 0, amount: 0, percentage: 0 }
  };

  let totalCount = 0;
  let totalAmount = 0;
  const onTime = { count: 0, amount: 0 };
  const pending = { count: 0, amount: 0 };
  const overdue = { count: 0, amount: 0 };

  charges?.forEach(charge => {
    const dueDate = new Date(charge.due_date);
    const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

    if (charge.status === 'paid') {
      onTime.count++;
      onTime.amount += charge.amount_cents;
    } else {
      totalCount++;
      totalAmount += charge.amount_cents;

      if (daysOverdue < 0) {
        // Future due date
        pending.count++;
        pending.amount += charge.amount_cents;
      } else if (daysOverdue <= 30) {
        buckets['0-30days'].count++;
        buckets['0-30days'].amount += charge.amount_cents;
        overdue.count++;
        overdue.amount += charge.amount_cents;
      } else if (daysOverdue <= 60) {
        buckets['31-60days'].count++;
        buckets['31-60days'].amount += charge.amount_cents;
        overdue.count++;
        overdue.amount += charge.amount_cents;
      } else if (daysOverdue <= 90) {
        buckets['61-90days'].count++;
        buckets['61-90days'].amount += charge.amount_cents;
        overdue.count++;
        overdue.amount += charge.amount_cents;
      } else {
        buckets['90plus'].count++;
        buckets['90plus'].amount += charge.amount_cents;
        overdue.count++;
        overdue.amount += charge.amount_cents;
      }
    }
  });

  // Calculate percentages
  const totalAllCharges = onTime.count + totalCount;
  const percentages = {};

  Object.keys(buckets).forEach(bucket => {
    buckets[bucket].percentage = totalCount > 0
      ? ((buckets[bucket].count / totalCount) * 100).toFixed(2)
      : '0.00';
    buckets[bucket].amount = Math.round(buckets[bucket].amount / 100 * 100) / 100;
  });

  return {
    buckets,
    onTime: {
      count: onTime.count,
      amount: onTime.amount / 100,
      percentage: totalAllCharges > 0 ? ((onTime.count / totalAllCharges) * 100).toFixed(2) : '0.00'
    },
    pending: {
      count: pending.count,
      amount: pending.amount / 100
    },
    overdue: {
      count: overdue.count,
      amount: overdue.amount / 100
    }
  };
}

/**
 * Break down payment status by customer
 */
function breakdownByCustomer(charges, today) {
  const byCustomer = {};

  charges?.forEach(charge => {
    if (!byCustomer[charge.customer_id]) {
      byCustomer[charge.customer_id] = {
        customer_id: charge.customer_id,
        total_due: 0,
        overdue_amount: 0,
        pending_amount: 0,
        on_time_amount: 0,
        overdue_days_max: 0,
        charge_count: 0
      };
    }

    const daysOverdue = Math.floor((today - new Date(charge.due_date)) / (1000 * 60 * 60 * 24));

    byCustomer[charge.customer_id].total_due += charge.amount_cents;
    byCustomer[charge.customer_id].charge_count++;

    if (charge.status === 'paid') {
      byCustomer[charge.customer_id].on_time_amount += charge.amount_cents;
    } else if (daysOverdue > 0) {
      byCustomer[charge.customer_id].overdue_amount += charge.amount_cents;
      byCustomer[charge.customer_id].overdue_days_max = Math.max(
        byCustomer[charge.customer_id].overdue_days_max,
        daysOverdue
      );
    } else {
      byCustomer[charge.customer_id].pending_amount += charge.amount_cents;
    }
  });

  // Convert and sort by overdue amount
  return Object.values(byCustomer)
    .map(customer => ({
      ...customer,
      total_due: Math.round(customer.total_due / 100 * 100) / 100,
      overdue_amount: Math.round(customer.overdue_amount / 100 * 100) / 100,
      pending_amount: Math.round(customer.pending_amount / 100 * 100) / 100,
      on_time_amount: Math.round(customer.on_time_amount / 100 * 100) / 100,
      overdue_percentage: customer.total_due > 0
        ? ((customer.overdue_amount / customer.total_due) * 100).toFixed(2)
        : '0.00'
    }))
    .sort((a, b) => b.overdue_amount - a.overdue_amount);
}

/**
 * Break down payment status by payment method
 * Shows effectiveness of different payment methods
 */
function breakdownByMethod(charges, today) {
  const byMethod = {};

  charges?.forEach(charge => {
    if (!byMethod[charge.payment_method]) {
      byMethod[charge.payment_method] = {
        payment_method: charge.payment_method,
        total_attempted: 0,
        successful: 0,
        failed: 0,
        pending: 0,
        overdue: 0,
        success_rate: 0
      };
    }

    const daysOverdue = Math.floor((today - new Date(charge.due_date)) / (1000 * 60 * 60 * 24));

    byMethod[charge.payment_method].total_attempted++;

    if (charge.status === 'paid') {
      byMethod[charge.payment_method].successful++;
    } else if (daysOverdue > 0) {
      byMethod[charge.payment_method].overdue++;
    } else {
      byMethod[charge.payment_method].pending++;
    }
  });

  // Calculate success rates
  return Object.values(byMethod).map(method => ({
    ...method,
    success_rate: method.total_attempted > 0
      ? ((method.successful / method.total_attempted) * 100).toFixed(2)
      : '0.00'
  }));
}

/**
 * Identify at-risk customers
 * Criteria: > 60 days overdue OR > 20% of total value overdue
 */
function identifyAtRiskCustomers(charges, today) {
  const byCustomer = {};

  charges?.forEach(charge => {
    if (!byCustomer[charge.customer_id]) {
      byCustomer[charge.customer_id] = {
        customer_id: charge.customer_id,
        total_value: 0,
        overdue_value: 0,
        max_days_overdue: 0
      };
    }

    const daysOverdue = Math.floor((today - new Date(charge.due_date)) / (1000 * 60 * 60 * 24));

    byCustomer[charge.customer_id].total_value += charge.amount_cents;

    if (charge.status !== 'paid' && daysOverdue > 0) {
      byCustomer[charge.customer_id].overdue_value += charge.amount_cents;
      byCustomer[charge.customer_id].max_days_overdue = Math.max(
        byCustomer[charge.customer_id].max_days_overdue,
        daysOverdue
      );
    }
  });

  // Filter for at-risk customers
  return Object.values(byCustomer)
    .filter(customer => {
      const overduePercentage = (customer.overdue_value / customer.total_value) * 100;
      return customer.max_days_overdue > 60 || overduePercentage > 20;
    })
    .map(customer => ({
      customer_id: customer.customer_id,
      overdue_value: Math.round(customer.overdue_value / 100 * 100) / 100,
      total_value: Math.round(customer.total_value / 100 * 100) / 100,
      max_days_overdue: customer.max_days_overdue,
      overdue_percentage: ((customer.overdue_value / customer.total_value) * 100).toFixed(2),
      risk_level: customer.max_days_overdue > 90 ? 'CRITICAL' : 'HIGH'
    }))
    .sort((a, b) => b.max_days_overdue - a.max_days_overdue);
}

module.exports = {
  calculatePaymentStatus,
  calculateAging,
  breakdownByCustomer,
  breakdownByMethod,
  identifyAtRiskCustomers
};
