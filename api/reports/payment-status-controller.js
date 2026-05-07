/**
 * api/reports/payment-status-controller.js
 * REST API endpoints for Payment Status reports
 * AC-3: Payment Status Analysis
 */

const express = require('express');
const { Pool } = require('pg');
const { calculatePaymentStatus } = require('./payment-status-calculator');

const router = express.Router();
const pool = new Pool();

/**
 * GET /api/reports/payment-status
 * Get payment status analysis with aging breakdown
 * Returns: pagamentos_em_dia, pagamentos_pendentes, pagamentos_atrasados
 * with aging analysis (0-30, 31-60, 61-90, 90+)
 */
router.get('/payment-status', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Calculate payment status (not cached as this is real-time)
    const paymentStatus = await calculatePaymentStatus(tenantId);

    res.json(paymentStatus);

  } catch (error) {
    console.error('[Payment Status] Controller error:', error);
    res.status(500).json({
      error: 'Failed to generate payment status report',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/payment-status/by-customer
 * Get payment status breakdown by customer
 * Shows overdue and pending amounts per customer
 */
router.get('/payment-status/by-customer', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        COUNT(DISTINCT ch.id) as total_charges,
        SUM(ch.amount_cents) FILTER (WHERE ch.status = 'paid') / 100.0 as paid_amount,
        SUM(ch.amount_cents) FILTER (WHERE ch.status IN ('pending', 'overdue')) / 100.0 as pending_amount,
        SUM(CASE
          WHEN ch.status != 'paid' AND NOW()::date - ch.due_date::date > 0
          THEN ch.amount_cents ELSE 0
        END) / 100.0 as overdue_amount,
        MAX(CASE
          WHEN ch.status != 'paid' AND NOW()::date - ch.due_date::date > 0
          THEN NOW()::date - ch.due_date::date ELSE 0
        END) as max_days_overdue
      FROM customers c
      LEFT JOIN charges ch ON c.id = ch.customer_id AND ch.tenant_id = $1
      WHERE c.tenant_id = $1
      GROUP BY c.id, c.name
      ORDER BY overdue_amount DESC
    `;

    const { rows } = await pool.query(query, [tenantId]);

    res.json({
      customers: rows,
      report_date: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('[Payment Status by Customer] Error:', error);
    res.status(500).json({ error: 'Failed to fetch customer breakdown' });
  }
});

/**
 * GET /api/reports/payment-status/by-method
 * Get payment status breakdown by payment method
 * Shows success rates and effectiveness by method
 */
router.get('/payment-status/by-method', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `
      SELECT
        payment_method,
        COUNT(*) as total_attempts,
        COUNT(*) FILTER (WHERE status = 'paid') as successful,
        COUNT(*) FILTER (WHERE status IN ('pending', 'overdue')) as pending,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'refunded') as refunded,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'paid') / COUNT(*),
          2
        ) as success_rate,
        SUM(amount_cents) / 100.0 as total_amount,
        SUM(amount_cents) FILTER (WHERE status = 'paid') / 100.0 as collected_amount
      FROM charges
      WHERE tenant_id = $1
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `;

    const { rows } = await pool.query(query, [tenantId]);

    res.json({
      payment_methods: rows,
      report_date: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('[Payment Status by Method] Error:', error);
    res.status(500).json({ error: 'Failed to fetch payment method breakdown' });
  }
});

/**
 * GET /api/reports/payment-status/at-risk
 * Get list of at-risk customers
 * Criteria: > 60 days overdue OR > 20% of value overdue
 */
router.get('/payment-status/at-risk', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `
      WITH customer_summary AS (
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          SUM(ch.amount_cents) FILTER (WHERE ch.status = 'paid') / 100.0 as paid_total,
          SUM(ch.amount_cents) FILTER (WHERE ch.status != 'paid') / 100.0 as pending_total,
          SUM(CASE
            WHEN ch.status != 'paid' AND NOW()::date - ch.due_date::date > 0
            THEN ch.amount_cents ELSE 0
          END) / 100.0 as overdue_total,
          MAX(CASE
            WHEN ch.status != 'paid' AND NOW()::date - ch.due_date::date > 0
            THEN NOW()::date - ch.due_date::date ELSE 0
          END) as max_days_overdue
        FROM customers c
        LEFT JOIN charges ch ON c.id = ch.customer_id AND ch.tenant_id = $1
        WHERE c.tenant_id = $1
        GROUP BY c.id, c.name, c.email
      )
      SELECT
        customer_id,
        customer_name,
        email,
        paid_total,
        pending_total,
        overdue_total,
        max_days_overdue,
        ROUND(
          COALESCE(100.0 * overdue_total / NULLIF(pending_total + paid_total, 0), 0),
          2
        ) as overdue_percentage,
        CASE
          WHEN max_days_overdue > 90 THEN 'CRITICAL'
          WHEN max_days_overdue > 60 THEN 'HIGH'
          WHEN overdue_percentage > 20 THEN 'MEDIUM'
          ELSE 'LOW'
        END as risk_level
      FROM customer_summary
      WHERE (max_days_overdue > 60 OR ROUND(
        COALESCE(100.0 * overdue_total / NULLIF(pending_total + paid_total, 0), 0),
        2
      ) > 20)
      ORDER BY max_days_overdue DESC, overdue_total DESC
    `;

    const { rows } = await pool.query(query, [tenantId]);

    res.json({
      at_risk_customers: rows,
      count: rows.length,
      report_date: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('[At-Risk Customers] Error:', error);
    res.status(500).json({ error: 'Failed to fetch at-risk customers' });
  }
});

/**
 * GET /api/reports/payment-status/aging
 * Get detailed aging analysis
 * Returns breakdown by age buckets: 0-30, 31-60, 61-90, 90+
 */
router.get('/payment-status/aging', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = `
      SELECT
        CASE
          WHEN NOW()::date - ch.due_date::date < 0 THEN '0-future'
          WHEN NOW()::date - ch.due_date::date BETWEEN 0 AND 30 THEN '1-0to30'
          WHEN NOW()::date - ch.due_date::date BETWEEN 31 AND 60 THEN '2-31to60'
          WHEN NOW()::date - ch.due_date::date BETWEEN 61 AND 90 THEN '3-61to90'
          ELSE '4-90plus'
        END as aging_bucket,
        COUNT(*) as charge_count,
        SUM(amount_cents) / 100.0 as total_amount,
        ROUND(
          100.0 * COUNT(*) / SUM(COUNT(*)) OVER (),
          2
        ) as percentage,
        MIN(due_date) as oldest_due_date,
        MAX(due_date) as newest_due_date
      FROM charges
      WHERE tenant_id = $1
        AND status != 'paid'
      GROUP BY aging_bucket
      ORDER BY aging_bucket ASC
    `;

    const { rows } = await pool.query(query, [tenantId]);

    res.json({
      aging_buckets: rows,
      report_date: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('[Aging Analysis] Error:', error);
    res.status(500).json({ error: 'Failed to fetch aging analysis' });
  }
});

function generateErrorReference() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
