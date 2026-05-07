/**
 * services/email-service.js
 * Email delivery service for scheduled reports
 * AC-6: Send DRE, cash flow, and monthly reports via email
 */

const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const pool = new Pool();

class EmailService {
  constructor(config = {}) {
    this.config = {
      from: config.from || process.env.EMAIL_FROM || 'reports@example.com',
      host: config.host || process.env.EMAIL_HOST,
      port: config.port || process.env.EMAIL_PORT || 587,
      secure: config.secure !== false, // TLS by default
      auth: {
        user: config.user || process.env.EMAIL_USER,
        pass: config.pass || process.env.EMAIL_PASS
      },
      ...config
    };

    this.transporter = null;
    this.initialized = false;

    if (this.config.host && this.config.auth.user && this.config.auth.pass) {
      this.initialize();
    }
  }

  /**
   * Initialize the email transporter
   */
  private initialize() {
    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth
      });

      this.initialized = true;
      console.log('[EmailService] ✅ Initialized');
    } catch (err) {
      console.error('[EmailService] Initialization failed:', err);
      this.initialized = false;
    }
  }

  /**
   * Send email with report
   */
  async sendEmail(emailData) {
    if (!this.initialized) {
      throw new Error('Email service not initialized. Check SMTP configuration.');
    }

    const {
      to,
      subject,
      html,
      text,
      attachments = [],
      tenant_id,
      replyTo = this.config.from
    } = emailData;

    try {
      // Normalize recipients
      const recipients = Array.isArray(to) ? to : [to];

      if (recipients.length === 0) {
        throw new Error('No recipients specified');
      }

      const mailOptions = {
        from: this.config.from,
        to: recipients.join(','),
        subject,
        html: html || this.textToHtml(text),
        text: text || html,
        replyTo,
        attachments: attachments.filter(a => a !== null)
      };

      const result = await this.transporter.sendMail(mailOptions);

      // Log email in database
      await this.logEmail(tenant_id, {
        to: recipients,
        subject,
        message_id: result.messageId,
        response: result.response,
        status: 'sent',
        sent_at: new Date()
      });

      console.log(`[EmailService] ✅ Email sent: ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (err) {
      console.error('[EmailService] Send failed:', err);

      // Log failure
      if (tenant_id) {
        await this.logEmail(tenant_id, {
          to: Array.isArray(to) ? to : [to],
          subject,
          error: err.message,
          status: 'failed',
          sent_at: new Date()
        });
      }

      throw err;
    }
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail(recipient) {
    const mailOptions = {
      from: this.config.from,
      to: recipient,
      subject: 'Email Service Test',
      html: `
        <h2>Email Service Test</h2>
        <p>This is a test email from the Financial Reports system.</p>
        <p>If you received this, the email service is working correctly.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      `,
      text: 'Test email from Financial Reports system. Timestamp: ' + new Date().toISOString()
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('[EmailService] Test email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (err) {
      console.error('[EmailService] Test email failed:', err);
      throw err;
    }
  }

  /**
   * Log email in database for audit trail
   */
  private async logEmail(tenantId, emailLog) {
    if (!tenantId) return; // Skip logging if no tenant

    const query = `
      INSERT INTO email_logs (tenant_id, recipients, subject, message_id, status, error, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    try {
      await pool.query(query, [
        tenantId,
        JSON.stringify(emailLog.to),
        emailLog.subject,
        emailLog.message_id || null,
        emailLog.status,
        emailLog.error || null,
        emailLog.sent_at
      ]);
    } catch (err) {
      console.debug('[EmailService] Failed to log email:', err.message);
    }
  }

  /**
   * Get email delivery history
   */
  async getEmailHistory(tenantId, limit = 50) {
    const query = `
      SELECT
        id,
        recipients,
        subject,
        status,
        error,
        sent_at
      FROM email_logs
      WHERE tenant_id = $1
      ORDER BY sent_at DESC
      LIMIT $2
    `;

    try {
      const { rows } = await pool.query(query, [tenantId, limit]);
      return rows.map(row => ({
        id: row.id,
        recipients: JSON.parse(row.recipients),
        subject: row.subject,
        status: row.status,
        error: row.error,
        sent_at: row.sent_at
      }));
    } catch (err) {
      console.error('[EmailService] Failed to retrieve history:', err);
      return [];
    }
  }

  /**
   * Get email delivery summary for dashboard
   */
  async getEmailSummary(tenantId, days = 30) {
    const query = `
      SELECT
        status,
        COUNT(*) as count,
        COUNT(CASE WHEN sent_at >= NOW() - INTERVAL '${days} days' THEN 1 END) as recent_count
      FROM email_logs
      WHERE tenant_id = $1
      GROUP BY status
    `;

    try {
      const { rows } = await pool.query(query, [tenantId]);

      const summary = {
        total: 0,
        sent: 0,
        failed: 0,
        recent: 0
      };

      rows.forEach(row => {
        summary.total += row.count;
        summary.recent += row.recent_count;
        if (row.status === 'sent') summary.sent = row.count;
        if (row.status === 'failed') summary.failed = row.count;
      });

      return summary;
    } catch (err) {
      console.error('[EmailService] Failed to get summary:', err);
      return { total: 0, sent: 0, failed: 0, recent: 0 };
    }
  }

  /**
   * Verify email configuration
   */
  async verify() {
    if (!this.transporter) {
      throw new Error('Email service not initialized');
    }

    try {
      await this.transporter.verify();
      console.log('[EmailService] ✅ Configuration verified');
      return true;
    } catch (err) {
      console.error('[EmailService] Verification failed:', err);
      throw err;
    }
  }

  /**
   * Convert plain text to HTML
   */
  private textToHtml(text) {
    if (!text) return '<p>No content</p>';

    return `
      <pre style="font-family: monospace; white-space: pre-wrap; word-wrap: break-word;">
        ${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </pre>
    `;
  }
}

module.exports = { EmailService };
