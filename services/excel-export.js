/**
 * services/excel-export.js
 * Excel (.xlsx) export service for financial reports
 * AC-6: Export to Excel with formulas and formatting
 */

const XLSX = require('xlsx');

/**
 * Generate Excel workbook for DRE report
 */
function generateDREExcel(dreData) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['DRE REPORT'],
    [],
    ['Period', dreData.period],
    [],
    ['Metric', 'Value', 'Percentage of Revenue'],
    ['Receita Bruta', dreData.receita_bruta, '100.00%'],
    ['Taxas', dreData.taxas, `=${dreData.taxas}/${dreData.receita_bruta}*100%`],
    ['Receita Líquida', dreData.receita_liquida, `=${dreData.receita_liquida}/${dreData.receita_bruta}*100%`],
    [],
    ['Recurring Metrics'],
    ['MRR', dreData.mrr],
    ['Churn Rate', `${dreData.churn_rate}%`]
  ]);

  // Set column widths
  ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }];

  // Format currency cells
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DRE');

  return wb;
}

/**
 * Generate Excel workbook for Cash Flow report
 */
function generateCashFlowExcel(cashFlowData) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['CASH FLOW SUMMARY'],
    [],
    ['Period', `${cashFlowData.start_date} to ${cashFlowData.end_date}`],
    [],
    ['Metric', 'Value'],
    ['Total Inflows', cashFlowData.summary.total_inflows],
    ['Total Outflows', cashFlowData.summary.total_outflows],
    ['Net Cash', `=B6-B7`],
    [],
    ['Payment Method', 'Inflows', 'Outflows', 'Net', '%']
  ];

  // Add payment methods
  cashFlowData.payment_method_breakdown.forEach(method => {
    summaryData.push([
      method.payment_method,
      method.total_inflows,
      method.total_outflows,
      `=${method.total_inflows}-${method.total_outflows}`,
      method.percentage_of_total
    ]);
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Daily detail sheet
  const dailyData = [
    ['Date', 'Inflows', 'Outflows', 'Net Cash', 'Cumulative Position'],
    ...cashFlowData.daily_flow.map(day => [
      day.date,
      day.inflows,
      day.outflows,
      day.net_cash,
      day.cumulative_position
    ])
  ];

  const dailySheet = XLSX.utils.aoa_to_sheet(dailyData);
  dailySheet['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, dailySheet, 'Daily');

  return wb;
}

/**
 * Generate Excel workbook for Payment Status report
 */
function generatePaymentStatusExcel(statusData) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['PAYMENT STATUS SUMMARY'],
    [],
    ['Status', 'Count', 'Percentage', 'Value'],
    ['On Time', statusData.summary.pagamentos_em_dia, statusData.summary.pagamentos_em_dia_pct, ''],
    ['Pending', statusData.summary.pagamentos_pendentes, '', statusData.summary.total_pendente_valor],
    ['Overdue', statusData.summary.pagamentos_atrasados, '', statusData.summary.total_atrasado_valor],
    [],
    ['Aging Buckets'],
    ['Bucket', 'Count', 'Amount', 'Percentage']
  ];

  Object.entries(statusData.aging_analysis).forEach(([bucket, data]) => {
    summaryData.push([
      bucket,
      data.count,
      data.amount,
      data.percentage
    ]);
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // By customer sheet
  const customerData = [
    ['Customer ID', 'Total Due', 'Overdue', 'Pending', 'Overdue %']
  ];

  statusData.by_customer.slice(0, 100).forEach(customer => {
    customerData.push([
      customer.customer_id,
      customer.total_due,
      customer.overdue_amount,
      customer.pending_amount,
      customer.overdue_percentage
    ]);
  });

  const customerSheet = XLSX.utils.aoa_to_sheet(customerData);
  customerSheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, customerSheet, 'By Customer');

  // At-risk customers sheet
  const atRiskData = [
    ['Customer ID', 'Overdue Value', 'Total Value', 'Max Days Overdue', 'Risk Level']
  ];

  statusData.at_risk_customers.forEach(customer => {
    atRiskData.push([
      customer.customer_id,
      customer.overdue_value,
      customer.total_value,
      customer.max_days_overdue,
      customer.risk_level
    ]);
  });

  const atRiskSheet = XLSX.utils.aoa_to_sheet(atRiskData);
  atRiskSheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, atRiskSheet, 'At-Risk');

  return wb;
}

/**
 * Generate Excel workbook for Metrics report
 */
function generateMetricsExcel(metricsData) {
  const wb = XLSX.utils.book_new();

  const data = [
    ['METRICS REPORT'],
    [],
    ['Period', `${metricsData.period.start_date} to ${metricsData.period.end_date}`],
    [],
    ['Metric', 'Value'],
    ['MRR', metricsData.metrics.mrr],
    ['ARR', `=B6*12`], // Formula: MRR × 12
    ['Churn Rate', `${metricsData.metrics.churn_rate}%`],
    ['LTV', metricsData.metrics.ltv],
    ['CAC', metricsData.metrics.cac],
    ['LTV/CAC Ratio', `=B9/B10`] // Formula: LTV / CAC
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, sheet, 'Metrics');

  return wb;
}

/**
 * Generate Excel workbook for Forecast report
 */
function generateForecastExcel(forecastData) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['FORECAST REPORT'],
    [],
    [`Days: ${forecastData.period.days}`],
    [`Period: ${forecastData.period.start_date} to ${forecastData.period.end_date}`],
    [],
    ['Scenario', 'Amount'],
    ['Total Forecast', forecastData.totals.total_forecast],
    ['Weighted Forecast', forecastData.totals.weighted_forecast],
    ['Optimistic (100%)', forecastData.totals.total_forecast],
    ['Realistic (weighted)', forecastData.totals.weighted_forecast],
    ['Pessimistic (50%)', forecastData.totals.total_forecast * 0.5],
    [],
    ['Confidence Tiers'],
    ['Tier', 'Count', 'Amount', 'Collection Rate'],
    ['High (PIX)', forecastData.confidence.high.count, forecastData.confidence.high.amount, '95%'],
    ['Medium (Boleto)', forecastData.confidence.medium.count, forecastData.confidence.medium.amount, '70%'],
    ['Low (CC)', forecastData.confidence.low.count, forecastData.confidence.low.amount, '40%']
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Daily detail sheet
  const dailyData = [
    ['Date', 'Total', 'High', 'Medium', 'Low', 'Weighted'],
    ...forecastData.daily_forecast.map(day => [
      day.date,
      day.total_forecast,
      day.high_confidence,
      day.medium_confidence,
      day.low_confidence,
      day.weighted_forecast
    ])
  ];

  const dailySheet = XLSX.utils.aoa_to_sheet(dailyData);
  dailySheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, dailySheet, 'Daily');

  return wb;
}

/**
 * Write workbook to file
 */
function saveExcelToFile(workbook, filepath) {
  XLSX.writeFile(workbook, filepath);
  return filepath;
}

/**
 * Generate workbook buffer
 */
function generateExcelBuffer(workbook) {
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

module.exports = {
  generateDREExcel,
  generateCashFlowExcel,
  generatePaymentStatusExcel,
  generateMetricsExcel,
  generateForecastExcel,
  saveExcelToFile,
  generateExcelBuffer
};
