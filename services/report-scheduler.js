/**
 * services/report-scheduler.js
 * Scheduled delivery of financial reports via email
 * AC-6: Daily DRE, weekly cash flow, monthly full report
 */

const { Pool } = require('pg');
const { calculateDRE } = require('../api/reports/dre-calculator');
const { calculateCashFlow } = require('../api/reports/cash-flow-calculator');
const { calculatePaymentStatus } = require('../api/reports/payment-status-calculator');
const { calculateRecurringMetrics } = require('../api/reports/metrics-calculator');
const { calculateForecast30 } = require('../api/reports/forecast-calculator');

const pool = new Pool();

class ReportScheduler {
  constructor(emailService) {
    this.emailService = emailService;
    this.schedules = new Map();
  }

  /**
   * Start the scheduler for a tenant
   */
  async startScheduler(tenantId, config = {}) {
    try {
      const scheduleConfig = await this.loadScheduleConfig(tenantId);

      // Daily DRE report (default: 8:00 AM)
      if (scheduleConfig.daily_dre_enabled !== false) {
        const dailyDreTime = scheduleConfig.daily_dre_time || '08:00';
        this.scheduleDailyDREReport(tenantId, dailyDreTime, scheduleConfig);
      }

      // Weekly cash flow report (default: Monday 9:00 AM)
      if (scheduleConfig.weekly_cashflow_enabled !== false) {
        const weeklyCFTime = scheduleConfig.weekly_cashflow_time || '09:00';
        const weeklyDay = scheduleConfig.weekly_cashflow_day || 1; // Monday
        this.scheduleWeeklyCashFlowReport(tenantId, weeklyCFTime, weeklyDay, scheduleConfig);
      }

      // Monthly full report (default: 1st of month, 10:00 AM)
      if (scheduleConfig.monthly_full_enabled !== false) {
        const monthlyTime = scheduleConfig.monthly_full_time || '10:00';
        const monthlyDay = scheduleConfig.monthly_full_day || 1;
        this.scheduleMonthlyFullReport(tenantId, monthlyTime, monthlyDay, scheduleConfig);
      }

      console.log(`[ReportScheduler] Schedules started for tenant ${tenantId}`);
      return true;
    } catch (err) {
      console.error(`[ReportScheduler] Error starting scheduler for ${tenantId}:`, err);
      throw err;
    }
  }

  /**
   * Load schedule configuration from database
   */
  private async loadScheduleConfig(tenantId) {
    const query = `
      SELECT config
      FROM report_schedules
      WHERE tenant_id = $1
      LIMIT 1
    `;

    try {
      const { rows } = await pool.query(query, [tenantId]);
      return rows[0]?.config || {};
    } catch (err) {
      console.debug('[ReportScheduler] No config found, using defaults');
      return {};
    }
  }

  /**
   * Save or update schedule configuration
   */
  async saveScheduleConfig(tenantId, config) {
    const query = `
      INSERT INTO report_schedules (tenant_id, config, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        config = $2,
        updated_at = NOW()
    `;

    try {
      await pool.query(query, [tenantId, JSON.stringify(config)]);
      return true;
    } catch (err) {
      console.error('[ReportScheduler] Error saving config:', err);
      throw err;
    }
  }

  /**
   * Schedule daily DRE report
   */
  private scheduleDailyDREReport(tenantId, timeStr, config) {
    const [hours, minutes] = timeStr.split(':').map(Number);

    const checkTime = () => {
      const now = new Date();
      const nextRun = new Date();
      nextRun.setHours(hours, minutes, 0, 0);

      if (now > nextRun) {
        nextRun.setDate(nextRun.getDate() + 1);
      }

      const delay = nextRun.getTime() - now.getTime();
      return delay;
    };

    const job = setInterval(async () => {
      try {
        await this.sendDREReport(tenantId, config);
      } catch (err) {
        console.error(`[DRE Report] Failed for ${tenantId}:`, err);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Run immediately if within window
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (now.getHours() >= hours && now.getMinutes() >= minutes) {
      this.sendDREReport(tenantId, config).catch(err =>
        console.error(`[DRE Report] Failed for ${tenantId}:`, err)
      );
    }

    this.schedules.set(`dre-${tenantId}`, job);
  }

  /**
   * Schedule weekly cash flow report
   */
  private scheduleWeeklyCashFlowReport(tenantId, timeStr, dayOfWeek, config) {
    const [hours, minutes] = timeStr.split(':').map(Number);

    const job = setInterval(async () => {
      const now = new Date();
      if (now.getDay() === dayOfWeek) {
        try {
          await this.sendCashFlowReport(tenantId, config);
        } catch (err) {
          console.error(`[Cash Flow Report] Failed for ${tenantId}:`, err);
        }
      }
    }, 60 * 60 * 1000); // Check hourly

    this.schedules.set(`cashflow-${tenantId}`, job);
  }

  /**
   * Schedule monthly full report
   */
  private scheduleMonthlyFullReport(tenantId, timeStr, dayOfMonth, config) {
    const [hours, minutes] = timeStr.split(':').map(Number);

    const job = setInterval(async () => {
      const now = new Date();
      if (now.getDate() === dayOfMonth) {
        try {
          await this.sendFullMonthlyReport(tenantId, config);
        } catch (err) {
          console.error(`[Monthly Report] Failed for ${tenantId}:`, err);
        }
      }
    }, 60 * 60 * 1000); // Check hourly

    this.schedules.set(`monthly-${tenantId}`, job);
  }

  /**
   * Send DRE report email
   */
  async sendDREReport(tenantId, config) {
    try {
      const period = this.getCurrentMonthPeriod();
      const dre = await calculateDRE(tenantId, period);

      const recipients = config.dre_recipients || [];
      if (recipients.length === 0) {
        console.warn(`[DRE Report] No recipients configured for tenant ${tenantId}`);
        return;
      }

      const email = this.formatDREEmail(dre, period);

      await this.emailService.sendEmail({
        to: recipients,
        subject: `DRE Report - ${period}`,
        ...email,
        tenant_id: tenantId
      });

      // Log delivery
      await this.logReportDelivery(tenantId, 'dre', recipients);

      console.log(`[DRE Report] Sent to ${recipients.length} recipients for ${tenantId}`);
    } catch (err) {
      console.error('[DRE Report] Error:', err);
      throw err;
    }
  }

  /**
   * Send cash flow report email
   */
  async sendCashFlowReport(tenantId, config) {
    try {
      const { start_date, end_date } = this.getWeekDateRange();
      const cashFlow = await calculateCashFlow(tenantId, start_date, end_date);

      const recipients = config.cashflow_recipients || [];
      if (recipients.length === 0) {
        console.warn(`[Cash Flow Report] No recipients configured for tenant ${tenantId}`);
        return;
      }

      const email = this.formatCashFlowEmail(cashFlow, start_date, end_date);

      await this.emailService.sendEmail({
        to: recipients,
        subject: `Cash Flow Report - Week of ${start_date}`,
        ...email,
        tenant_id: tenantId
      });

      await this.logReportDelivery(tenantId, 'cashflow', recipients);

      console.log(`[Cash Flow Report] Sent to ${recipients.length} recipients for ${tenantId}`);
    } catch (err) {
      console.error('[Cash Flow Report] Error:', err);
      throw err;
    }
  }

  /**
   * Send monthly full report (all metrics)
   */
  async sendFullMonthlyReport(tenantId, config) {
    try {
      const period = this.getLastMonthPeriod();

      // Fetch all report data in parallel
      const [dre, cashFlow, paymentStatus, metrics, forecast] = await Promise.all([
        calculateDRE(tenantId, period),
        calculateCashFlow(tenantId, this.getMonthDateRange().start_date, this.getMonthDateRange().end_date),
        calculatePaymentStatus(tenantId),
        calculateRecurringMetrics(tenantId),
        calculateForecast30(tenantId)
      ]);

      const recipients = config.monthly_recipients || [];
      if (recipients.length === 0) {
        console.warn(`[Monthly Report] No recipients configured for tenant ${tenantId}`);
        return;
      }

      const email = this.formatFullMonthlyEmail({
        dre,
        cashFlow,
        paymentStatus,
        metrics,
        forecast,
        period
      });

      await this.emailService.sendEmail({
        to: recipients,
        subject: `Monthly Financial Report - ${period}`,
        ...email,
        tenant_id: tenantId,
        attachments: config.include_pdf_attachment ? [
          await this.generatePDFAttachment('dre', dre, period),
          await this.generatePDFAttachment('cashflow', cashFlow, period),
          await this.generatePDFAttachment('metrics', metrics, period)
        ] : []
      });

      await this.logReportDelivery(tenantId, 'monthly', recipients);

      console.log(`[Monthly Report] Sent to ${recipients.length} recipients for ${tenantId}`);
    } catch (err) {
      console.error('[Monthly Report] Error:', err);
      throw err;
    }
  }

  /**
   * Log report delivery to audit trail
   */
  private async logReportDelivery(tenantId, reportType, recipients) {
    const query = `
      INSERT INTO report_deliveries (tenant_id, report_type, recipients, delivered_at)
      VALUES ($1, $2, $3, NOW())
    `;

    try {
      await pool.query(query, [tenantId, reportType, JSON.stringify(recipients)]);
    } catch (err) {
      console.debug('[Report Log] Error logging delivery:', err.message);
    }
  }

  /**
   * Update recipient configuration
   */
  async updateRecipients(tenantId, reportType, emails) {
    const config = await this.loadScheduleConfig(tenantId);
    const key = `${reportType}_recipients`;
    config[key] = emails;
    return this.saveScheduleConfig(tenantId, config);
  }

  /**
   * Stop all schedules for a tenant
   */
  stopScheduler(tenantId) {
    ['dre', 'cashflow', 'monthly'].forEach(type => {
      const scheduleKey = `${type}-${tenantId}`;
      if (this.schedules.has(scheduleKey)) {
        clearInterval(this.schedules.get(scheduleKey));
        this.schedules.delete(scheduleKey);
      }
    });

    console.log(`[ReportScheduler] Schedules stopped for tenant ${tenantId}`);
  }

  // Helper methods

  private getCurrentMonthPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getLastMonthPeriod() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  }

  private getMonthDateRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0]
    };
  }

  private getWeekDateRange() {
    const now = new Date();
    const day = now.getDate() - now.getDay();
    const start = new Date(now.setDate(day));
    const end = new Date(now.setDate(day + 6));
    return {
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0]
    };
  }

  private formatDREEmail(dre, period) {
    return {
      html: `
        <h2>DRE Report - ${period}</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 8px;">Receita Bruta</td>
            <td style="padding: 8px; text-align: right;">R$ ${(dre.receita_bruta / 100).toFixed(2)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 8px;">Taxas</td>
            <td style="padding: 8px; text-align: right;">R$ ${(dre.taxas / 100).toFixed(2)}</td>
          </tr>
          <tr style="border-bottom: 2px solid #333; font-weight: bold;">
            <td style="padding: 8px;">Receita Líquida</td>
            <td style="padding: 8px; text-align: right;">R$ ${(dre.receita_liquida / 100).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px;">MRR</td>
            <td style="padding: 8px; text-align: right;">R$ ${(dre.mrr / 100).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px;">Churn Rate</td>
            <td style="padding: 8px; text-align: right;">${dre.churn_rate}%</td>
          </tr>
        </table>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
          This is an automated report. Please do not reply to this email.
        </p>
      `,
      text: this.formatDREText(dre, period)
    };
  }

  private formatDREText(dre, period) {
    return `
DRE Report - ${period}

Receita Bruta:      R$ ${(dre.receita_bruta / 100).toFixed(2)}
Taxas:              R$ ${(dre.taxas / 100).toFixed(2)}
Receita Líquida:    R$ ${(dre.receita_liquida / 100).toFixed(2)}

MRR:                R$ ${(dre.mrr / 100).toFixed(2)}
Churn Rate:         ${dre.churn_rate}%

---
This is an automated report. Please do not reply to this email.
    `;
  }

  private formatCashFlowEmail(cashFlow, startDate, endDate) {
    const totalInflows = cashFlow.summary.total_inflows / 100;
    const totalOutflows = cashFlow.summary.total_outflows / 100;
    const netCash = (cashFlow.summary.total_inflows - cashFlow.summary.total_outflows) / 100;

    return {
      html: `
        <h2>Cash Flow Report - Week of ${startDate}</h2>
        <h3>Summary</h3>
        <table style="border-collapse: collapse; width: 100%;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 8px;">Total Inflows</td>
            <td style="padding: 8px; text-align: right;">R$ ${totalInflows.toFixed(2)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 8px;">Total Outflows</td>
            <td style="padding: 8px; text-align: right;">R$ ${totalOutflows.toFixed(2)}</td>
          </tr>
          <tr style="border-bottom: 2px solid #333; font-weight: bold;">
            <td style="padding: 8px;">Net Cash</td>
            <td style="padding: 8px; text-align: right;">R$ ${netCash.toFixed(2)}</td>
          </tr>
        </table>
      `,
      text: `
Cash Flow Report - Week of ${startDate}

Total Inflows:    R$ ${totalInflows.toFixed(2)}
Total Outflows:   R$ ${totalOutflows.toFixed(2)}
Net Cash:         R$ ${netCash.toFixed(2)}
      `.trim()
    };
  }

  private formatFullMonthlyEmail(data) {
    // Placeholder - would format all reports into comprehensive HTML/text
    return {
      html: '<h2>Monthly Financial Report</h2><p>Complete monthly report attached or see below.</p>',
      text: 'Monthly Financial Report - See HTML version for details'
    };
  }

  private async generatePDFAttachment(reportType, data, period) {
    // Placeholder - would use pdfkit to generate PDF
    return {
      filename: `${reportType}-${period}.pdf`,
      content: Buffer.from('PDF content placeholder'),
      contentType: 'application/pdf'
    };
  }
}

module.exports = { ReportScheduler };
