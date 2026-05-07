/**
 * api/reports/schedule-controller.js
 * REST API endpoints for managing scheduled report delivery
 * AC-6: Configure daily DRE, weekly cash flow, monthly full reports
 */

const express = require('express');
const { ReportScheduler } = require('../../services/report-scheduler');
const { EmailService } = require('../../services/email-service');
const { Pool } = require('pg');

const router = express.Router();
const pool = new Pool();
let scheduler = null;
let emailService = null;

/**
 * Initialize scheduler and email service
 */
function initializeServices() {
  if (!emailService) {
    emailService = new EmailService({
      from: process.env.EMAIL_FROM,
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    });
  }

  if (!scheduler) {
    scheduler = new ReportScheduler(emailService);
  }

  return { scheduler, emailService };
}

/**
 * GET /api/reports/schedules
 * Get current schedule configuration for tenant
 */
router.get('/schedules', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { scheduler } = initializeServices();
    const config = await scheduler.loadScheduleConfig(tenantId);

    res.json({
      tenant_id: tenantId,
      schedules: {
        daily_dre: {
          enabled: config.daily_dre_enabled !== false,
          time: config.daily_dre_time || '08:00',
          recipients: config.dre_recipients || []
        },
        weekly_cashflow: {
          enabled: config.weekly_cashflow_enabled !== false,
          time: config.weekly_cashflow_time || '09:00',
          day: config.weekly_cashflow_day || 1,
          recipients: config.cashflow_recipients || []
        },
        monthly_full: {
          enabled: config.monthly_full_enabled !== false,
          time: config.monthly_full_time || '10:00',
          day: config.monthly_full_day || 1,
          recipients: config.monthly_recipients || []
        }
      },
      last_updated: config.updated_at || null
    });

  } catch (error) {
    console.error('[Schedules] Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve schedules',
      reference: generateErrorReference()
    });
  }
});

/**
 * POST /api/reports/schedules/update
 * Update schedule configuration
 * Body: {
 *   daily_dre_enabled, daily_dre_time, dre_recipients,
 *   weekly_cashflow_enabled, weekly_cashflow_time, weekly_cashflow_day, cashflow_recipients,
 *   monthly_full_enabled, monthly_full_time, monthly_full_day, monthly_recipients
 * }
 */
router.post('/schedules/update', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { scheduler } = initializeServices();
    const newConfig = req.body;

    // Validate email addresses
    const allRecipients = [
      ...(newConfig.dre_recipients || []),
      ...(newConfig.cashflow_recipients || []),
      ...(newConfig.monthly_recipients || [])
    ];

    const invalidEmails = allRecipients.filter(email => !isValidEmail(email));
    if (invalidEmails.length > 0) {
      return res.status(400).json({
        error: 'Invalid email addresses',
        invalid_emails: invalidEmails
      });
    }

    // Save configuration
    await scheduler.saveScheduleConfig(tenantId, newConfig);

    // Restart scheduler with new config
    scheduler.stopScheduler(tenantId);
    await scheduler.startScheduler(tenantId, newConfig);

    res.json({
      status: 'updated',
      message: 'Schedule configuration updated and restarted',
      tenant_id: tenantId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Schedules] Update error:', error);
    res.status(500).json({
      error: 'Failed to update schedules',
      reference: generateErrorReference()
    });
  }
});

/**
 * POST /api/reports/schedules/start
 * Start all scheduled reports for a tenant
 */
router.post('/schedules/start', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { scheduler } = initializeServices();
    await scheduler.startScheduler(tenantId);

    res.json({
      status: 'started',
      message: 'All schedules started',
      tenant_id: tenantId
    });

  } catch (error) {
    console.error('[Schedules] Start error:', error);
    res.status(500).json({
      error: 'Failed to start schedules',
      reference: generateErrorReference()
    });
  }
});

/**
 * POST /api/reports/schedules/stop
 * Stop all scheduled reports for a tenant
 */
router.post('/schedules/stop', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { scheduler } = initializeServices();
    scheduler.stopScheduler(tenantId);

    res.json({
      status: 'stopped',
      message: 'All schedules stopped',
      tenant_id: tenantId
    });

  } catch (error) {
    console.error('[Schedules] Stop error:', error);
    res.status(500).json({
      error: 'Failed to stop schedules',
      reference: generateErrorReference()
    });
  }
});

/**
 * POST /api/reports/schedules/test-email
 * Send a test email to verify configuration
 * Body: { recipient: "email@example.com" }
 */
router.post('/schedules/test-email', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { recipient } = req.body;
    if (!recipient || !isValidEmail(recipient)) {
      return res.status(400).json({
        error: 'Invalid recipient email',
        recipient
      });
    }

    const { emailService } = initializeServices();

    try {
      const result = await emailService.sendTestEmail(recipient);
      res.json({
        status: 'sent',
        message: 'Test email sent successfully',
        message_id: result.messageId,
        recipient
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to send test email',
        details: err.message,
        hint: 'Check SMTP configuration (EMAIL_HOST, EMAIL_USER, EMAIL_PASS)'
      });
    }

  } catch (error) {
    console.error('[Test Email] Error:', error);
    res.status(500).json({
      error: 'Test email failed',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/schedules/email-history
 * Get email delivery history
 * Query params: limit (default: 50)
 */
router.get('/schedules/email-history', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const { emailService } = initializeServices();
    const history = await emailService.getEmailHistory(tenantId, limit);

    res.json({
      tenant_id: tenantId,
      limit,
      total: history.length,
      history
    });

  } catch (error) {
    console.error('[Email History] Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve email history',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/schedules/email-summary
 * Get email delivery summary for dashboard
 * Query params: days (default: 30)
 */
router.get('/schedules/email-summary', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days) || 30;
    const { emailService } = initializeServices();
    const summary = await emailService.getEmailSummary(tenantId, days);

    res.json({
      tenant_id: tenantId,
      period_days: days,
      summary,
      health_status: summary.failed === 0 ? 'HEALTHY' : 'DEGRADED'
    });

  } catch (error) {
    console.error('[Email Summary] Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve email summary',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/schedules/verify-email
 * Verify email service configuration
 */
router.get('/schedules/verify-email', async (req, res) => {
  try {
    const { emailService } = initializeServices();

    if (!emailService.initialized) {
      return res.json({
        status: 'not_configured',
        message: 'Email service not configured',
        required_env: ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM']
      });
    }

    try {
      await emailService.verify();
      res.json({
        status: 'verified',
        message: 'Email configuration is valid',
        ready_for_delivery: true
      });
    } catch (err) {
      res.json({
        status: 'invalid',
        message: 'Email configuration verification failed',
        error: err.message,
        ready_for_delivery: false
      });
    }

  } catch (error) {
    console.error('[Verify Email] Error:', error);
    res.status(500).json({
      error: 'Verification failed',
      reference: generateErrorReference()
    });
  }
});

// Helper functions

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateErrorReference() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
