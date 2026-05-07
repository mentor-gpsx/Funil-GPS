/**
 * services/csv-export.js
 * CSV export service for financial reports
 * AC-6: Export to CSV format
 */

/**
 * Convert report data to CSV format
 */
function generateDREcsv(dreData) {
  const rows = [
    ['DRE Report'],
    [`Period: ${dreData.period}`],
    [],
    ['Metric', 'Value'],
    ['Receita Bruta', formatCurrency(dreData.receita_bruta)],
    ['Taxas', formatCurrency(dreData.taxas)],
    ['Receita Líquida', formatCurrency(dreData.receita_liquida)],
    ['MRR', formatCurrency(dreData.mrr)],
    ['Churn Rate', `${dreData.churn_rate}%`]
  ];

  return convertToCSV(rows);
}

/**
 * Generate CSV for Cash Flow report
 */
function generateCashFlowCsv(cashFlowData) {
  const rows = [
    ['Cash Flow Report'],
    [`Period: ${cashFlowData.start_date} to ${cashFlowData.end_date}`],
    [],
    ['Summary'],
    ['Total Inflows', formatCurrency(cashFlowData.summary.total_inflows)],
    ['Total Outflows', formatCurrency(cashFlowData.summary.total_outflows)],
    ['Net Cash', formatCurrency(cashFlowData.summary.net_cash)],
    [],
    ['Daily Breakdown'],
    ['Date', 'Inflows', 'Outflows', 'Net Cash', 'Cumulative']
  ];

  // Add daily data
  cashFlowData.daily_flow.forEach(day => {
    rows.push([
      day.date,
      formatCurrency(day.inflows),
      formatCurrency(day.outflows),
      formatCurrency(day.net_cash),
      formatCurrency(day.cumulative_position)
    ]);
  });

  // Add payment method breakdown
  rows.push([]);
  rows.push(['Payment Method Breakdown']);
  rows.push(['Method', 'Inflows', 'Outflows', '%']);

  cashFlowData.payment_method_breakdown.forEach(method => {
    rows.push([
      method.payment_method,
      formatCurrency(method.total_inflows),
      formatCurrency(method.total_outflows),
      `${method.percentage_of_total}%`
    ]);
  });

  return convertToCSV(rows);
}

/**
 * Generate CSV for Payment Status report
 */
function generatePaymentStatusCsv(statusData) {
  const rows = [
    ['Payment Status Report'],
    [],
    ['Summary'],
    ['On Time', statusData.summary.pagamentos_em_dia],
    ['Percentage', `${statusData.summary.pagamentos_em_dia_pct}%`],
    ['Pending', statusData.summary.pagamentos_pendentes],
    ['Overdue', statusData.summary.pagamentos_atrasados],
    ['Pending Value', formatCurrency(statusData.summary.total_pendente_valor)],
    ['Overdue Value', formatCurrency(statusData.summary.total_atrasado_valor)],
    [],
    ['Aging Analysis'],
    ['Bucket', 'Count', 'Amount', 'Percentage']
  ];

  Object.entries(statusData.aging_analysis).forEach(([bucket, data]) => {
    rows.push([
      bucket,
      data.count,
      formatCurrency(data.amount),
      `${data.percentage}%`
    ]);
  });

  // Add by-customer breakdown
  rows.push([]);
  rows.push(['By Customer']);
  rows.push(['Customer ID', 'Total Due', 'Overdue Amount', 'Pending Amount', 'Overdue %']);

  statusData.by_customer.slice(0, 50).forEach(customer => {
    rows.push([
      customer.customer_id,
      formatCurrency(customer.total_due),
      formatCurrency(customer.overdue_amount),
      formatCurrency(customer.pending_amount),
      `${customer.overdue_percentage}%`
    ]);
  });

  // Add at-risk customers
  rows.push([]);
  rows.push(['At-Risk Customers']);
  rows.push(['Customer ID', 'Overdue Value', 'Total Value', 'Max Days Overdue', 'Risk Level']);

  statusData.at_risk_customers.forEach(customer => {
    rows.push([
      customer.customer_id,
      formatCurrency(customer.overdue_value),
      formatCurrency(customer.total_value),
      customer.max_days_overdue,
      customer.risk_level
    ]);
  });

  return convertToCSV(rows);
}

/**
 * Generate CSV for Metrics report
 */
function generateMetricsCsv(metricsData) {
  const rows = [
    ['Metrics Report'],
    [`Period: ${metricsData.period.start_date} to ${metricsData.period.end_date}`],
    [],
    ['Metric', 'Value'],
    ['MRR', formatCurrency(metricsData.metrics.mrr)],
    ['ARR', formatCurrency(metricsData.metrics.arr)],
    ['Churn Rate', `${metricsData.metrics.churn_rate}%`],
    ['LTV', formatCurrency(metricsData.metrics.ltv)],
    ['CAC', formatCurrency(metricsData.metrics.cac)],
    ['LTV/CAC Ratio', metricsData.metrics.ltv_cac_ratio]
  ];

  return convertToCSV(rows);
}

/**
 * Generate CSV for Forecast report
 */
function generateForecastCsv(forecastData) {
  const rows = [
    ['Forecast Report'],
    [`Forecast Days: ${forecastData.period.days}`],
    [`Period: ${forecastData.period.start_date} to ${forecastData.period.end_date}`],
    [],
    ['Summary'],
    ['Total Forecast', formatCurrency(forecastData.totals.total_forecast)],
    ['Weighted Forecast', formatCurrency(forecastData.totals.weighted_forecast)],
    [],
    ['Daily Forecast'],
    ['Date', 'Total', 'High Confidence', 'Medium Confidence', 'Low Confidence', 'Weighted']
  ];

  // Add daily forecast
  forecastData.daily_forecast.forEach(day => {
    rows.push([
      day.date,
      formatCurrency(day.total_forecast),
      formatCurrency(day.high_confidence),
      formatCurrency(day.medium_confidence),
      formatCurrency(day.low_confidence),
      formatCurrency(day.weighted_forecast)
    ]);
  });

  // Add confidence tiers
  rows.push([]);
  rows.push(['Confidence Tiers']);
  rows.push(['Tier', 'Count', 'Amount', 'Percentage']);
  rows.push(['High (PIX 95%)', forecastData.confidence.high.count, formatCurrency(forecastData.confidence.high.amount), `${forecastData.confidence.high.percentage}%`]);
  rows.push(['Medium (Boleto 70%)', forecastData.confidence.medium.count, formatCurrency(forecastData.confidence.medium.amount), `${forecastData.confidence.medium.percentage}%`]);
  rows.push(['Low (CC 40%)', forecastData.confidence.low.count, formatCurrency(forecastData.confidence.low.amount), `${forecastData.confidence.low.percentage}%`]);

  return convertToCSV(rows);
}

/**
 * Convert array of rows to CSV string
 * Properly escapes fields containing commas or quotes
 */
function convertToCSV(rows) {
  return rows.map(row => {
    return row.map(cell => {
      if (cell === null || cell === undefined) return '';

      const str = String(cell);

      // Escape quotes and wrap in quotes if contains comma or quote
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }

      return str;
    }).join(',');
  }).join('\n');
}

/**
 * Format currency for CSV (no special formatting needed)
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

module.exports = {
  generateDREcsv,
  generateCashFlowCsv,
  generatePaymentStatusCsv,
  generateMetricsCsv,
  generateForecastCsv,
  convertToCSV
};
