/**
 * api/reports/cash-flow-controller.js
 * REST API endpoints for Cash Flow reports
 * AC-2: Cash Flow Statement
 */

const express = require('express');
const { Pool } = require('pg');
const { calculateCashFlow, calculateProjectedCashFlow } = require('./cash-flow-calculator');

const router = express.Router();
const pool = new Pool();

const CACHE_TTL_HOURS = 1; // AC-8: Cache cash flow for 1 hour

/**
 * GET /api/reports/cash-flow
 * Get cash flow for date range
 * Query params:
 *   - start_date: YYYY-MM-DD (required)
 *   - end_date: YYYY-MM-DD (required)
 *   - include_projection: boolean (default: false)
 *   - cache: boolean (default: true)
 */
router.get('/cash-flow', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { start_date, end_date, include_projection = false, cache = true } = req.query;

    // AC-9: Validate date parameters
    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['start_date', 'end_date'],
        format: 'YYYY-MM-DD'
      });
    }

    // Validate date format and range
    const validation = validateDateRange(start_date, end_date);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid date range',
        details: validation.errors
      });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // AC-8: Check cache
    let cashFlow;
    if (cache) {
      cashFlow = await getCachedCashFlow(tenantId, start_date, end_date);
    }

    // Calculate if not cached
    if (!cashFlow) {
      if (include_projection === 'true' || include_projection === true) {
        cashFlow = await calculateProjectedCashFlow(tenantId, startDate, endDate);
      } else {
        cashFlow = await calculateCashFlow(tenantId, startDate, endDate);
      }

      // AC-8: Cache the result
      if (cache) {
        await cacheCashFlow(tenantId, start_date, end_date, cashFlow);
      }
    }

    res.json({
      ...cashFlow,
      cached: cache
    });

  } catch (error) {
    console.error('[Cash Flow] Controller error:', error);

    if (error.message.includes('Invalid date')) {
      return res.status(400).json({
        error: error.message,
        hint: 'Use YYYY-MM-DD format (e.g., 2025-01-01)'
      });
    }

    res.status(500).json({
      error: 'Failed to generate cash flow report',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/cash-flow/by-method
 * Get cash flow breakdown by payment method
 * Query params:
 *   - start_date: YYYY-MM-DD (required)
 *   - end_date: YYYY-MM-DD (required)
 */
router.get('/cash-flow/by-method', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { start_date, end_date } = req.query;

    const validation = validateDateRange(start_date, end_date);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const query = `
      SELECT
        payment_method,
        COUNT(*) FILTER (WHERE status = 'paid') as successful_count,
        COUNT(*) FILTER (WHERE status IN ('refunded', 'chargeback')) as failed_count,
        SUM(amount_cents) FILTER (WHERE status = 'paid') / 100.0 as total_inflows,
        SUM(amount_cents) FILTER (WHERE status IN ('refunded', 'chargeback')) / 100.0 as total_outflows,
        AVG(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) * 100 as success_rate
      FROM charges
      WHERE tenant_id = $1
        AND paid_at::date >= $2::date
        AND paid_at::date <= $3::date
      GROUP BY payment_method
      ORDER BY total_inflows DESC
    `;

    const { rows } = await pool.query(query, [tenantId, start_date, end_date]);

    res.json({
      payment_methods: rows,
      period: { start_date, end_date }
    });

  } catch (error) {
    console.error('[Cash Flow by Method] Error:', error);
    res.status(500).json({ error: 'Failed to fetch payment method breakdown' });
  }
});

/**
 * GET /api/reports/cash-flow/position
 * Get current cash position trend
 * Query params:
 *   - days: number (default: 30, max: 365)
 */
router.get('/cash-flow/position', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let days = parseInt(req.query.days) || 30;
    days = Math.min(Math.max(days, 1), 365); // Clamp between 1-365

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const endDate = new Date();

    const query = `
      SELECT
        DATE(paid_at) as date,
        SUM(amount_cents) FILTER (WHERE status = 'paid') / 100.0 as inflows,
        SUM(amount_cents) FILTER (WHERE status IN ('refunded', 'chargeback')) / 100.0 as outflows,
        (SUM(amount_cents) FILTER (WHERE status = 'paid') -
         SUM(amount_cents) FILTER (WHERE status IN ('refunded', 'chargeback'))) / 100.0 as net_cash
      FROM charges
      WHERE tenant_id = $1
        AND paid_at::date >= $2::date
        AND paid_at::date <= $3::date
      GROUP BY DATE(paid_at)
      ORDER BY DATE(paid_at) ASC
    `;

    const { rows } = await pool.query(query, [tenantId, startDate, endDate]);

    // Calculate cumulative
    let cumulative = 0;
    const withCumulative = rows.map(row => ({
      ...row,
      cumulative: (cumulative += row.net_cash)
    }));

    res.json({
      period: {
        days,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      },
      position_trend: withCumulative
    });

  } catch (error) {
    console.error('[Cash Flow Position] Error:', error);
    res.status(500).json({ error: 'Failed to fetch cash position trend' });
  }
});

// Helper functions

function validateDateRange(startDate, endDate) {
  const errors = [];

  if (!startDate || !endDate) {
    errors.push('Both start_date and end_date are required');
    return { valid: false, errors };
  }

  // Validate format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate)) {
    errors.push(`start_date "${startDate}" is invalid (use YYYY-MM-DD)`);
  }
  if (!dateRegex.test(endDate)) {
    errors.push(`end_date "${endDate}" is invalid (use YYYY-MM-DD)`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check date order
  if (startDate > endDate) {
    errors.push('start_date must be before or equal to end_date');
  }

  // Check range (max 2 years for cash flow)
  const diffDays = Math.floor(
    (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
  );

  if (diffDays > 730) {
    errors.push('date range cannot exceed 2 years');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function getCachedCashFlow(tenantId, startDate, endDate) {
  const query = `
    SELECT data
    FROM cash_flow_cache
    WHERE tenant_id = $1
      AND start_date = $2
      AND end_date = $3
      AND cached_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'
  `;

  try {
    const { rows } = await pool.query(query, [tenantId, startDate, endDate]);
    return rows[0]?.data || null;
  } catch (err) {
    // Table might not exist yet, silently fail
    return null;
  }
}

async function cacheCashFlow(tenantId, startDate, endDate, data) {
  const query = `
    INSERT INTO cash_flow_cache (tenant_id, start_date, end_date, data)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, start_date, end_date) DO UPDATE SET
      data = $4,
      cached_at = NOW()
  `;

  try {
    await pool.query(query, [tenantId, startDate, endDate, JSON.stringify(data)]);
  } catch (err) {
    // Silently fail if cache table doesn't exist
    console.debug('[Cache] Warning: Unable to cache cash flow');
  }
}

function generateErrorReference() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
