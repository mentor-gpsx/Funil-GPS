/**
 * api/reports/metrics-controller.js
 * REST API endpoints for Recurring Revenue Metrics
 * AC-4: MRR, ARR, Churn, LTV, CAC
 */

const express = require('express');
const { Pool } = require('pg');
const {
  calculateMRR,
  calculateARR,
  calculateChurn,
  calculateLTV,
  calculateCAC,
  calculateRecurringMetrics,
  getSubscriptionCohorts
} = require('./metrics-calculator');

const router = express.Router();
const pool = new Pool();

const CACHE_TTL_HOURS = 24; // AC-8: Cache metrics for 24 hours

/**
 * GET /api/reports/metrics
 * Get all recurring revenue metrics
 * Query params:
 *   - start_date: YYYY-MM-DD (default: period start)
 *   - end_date: YYYY-MM-DD (default: today)
 *   - marketing_spend: number (optional, for CAC calculation)
 *   - cache: boolean (default: true)
 */
router.get('/metrics', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      start_date = get30DaysAgo(),
      end_date = getTodayDate(),
      marketing_spend = 0,
      cache = true
    } = req.query;

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const marketingSpend = parseFloat(marketing_spend) || 0;

    // AC-9: Validate date range
    const validation = validateDateRange(start_date, end_date);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid date range',
        details: validation.errors
      });
    }

    // AC-8: Check cache
    let metrics;
    if (cache) {
      metrics = await getCachedMetrics(tenantId, start_date, end_date);
    }

    // Calculate if not cached
    if (!metrics) {
      metrics = await calculateRecurringMetrics(tenantId, startDate, endDate, marketingSpend);

      // Cache the result
      if (cache) {
        await cacheMetrics(tenantId, start_date, end_date, metrics);
      }
    }

    res.json({
      ...metrics,
      cached: cache
    });

  } catch (error) {
    console.error('[Metrics] Controller error:', error);
    res.status(500).json({
      error: 'Failed to generate metrics report',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/metrics/mrr
 * Get Monthly Recurring Revenue (current)
 */
router.get('/metrics/mrr', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const mrr = await calculateMRR(tenantId);

    res.json({
      metric: 'MRR',
      value: mrr,
      currency: 'BRL',
      calculated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[MRR] Error:', error);
    res.status(500).json({ error: 'Failed to calculate MRR' });
  }
});

/**
 * GET /api/reports/metrics/arr
 * Get Annual Recurring Revenue (current)
 */
router.get('/metrics/arr', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const arr = await calculateARR(tenantId);

    res.json({
      metric: 'ARR',
      value: arr,
      currency: 'BRL',
      calculated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[ARR] Error:', error);
    res.status(500).json({ error: 'Failed to calculate ARR' });
  }
});

/**
 * GET /api/reports/metrics/churn
 * Get Churn Rate for period
 * Query params:
 *   - start_date: YYYY-MM-DD
 *   - end_date: YYYY-MM-DD
 */
router.get('/metrics/churn', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      start_date = getMonthAgo(),
      end_date = getTodayDate()
    } = req.query;

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    const churnRate = await calculateChurn(tenantId, startDate, endDate);

    res.json({
      metric: 'Churn Rate',
      value: churnRate,
      unit: '%',
      period: { start_date, end_date },
      calculated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Churn] Error:', error);
    res.status(500).json({ error: 'Failed to calculate churn rate' });
  }
});

/**
 * GET /api/reports/metrics/ltv
 * Get Customer Lifetime Value
 */
router.get('/metrics/ltv', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      start_date = get90DaysAgo(),
      end_date = getTodayDate(),
      expected_lifetime = 24
    } = req.query;

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    const ltv = await calculateLTV(tenantId, startDate, endDate, parseInt(expected_lifetime));

    res.json({
      metric: 'LTV',
      value: ltv,
      currency: 'BRL',
      expected_lifetime_months: expected_lifetime,
      period: { start_date, end_date },
      calculated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[LTV] Error:', error);
    res.status(500).json({ error: 'Failed to calculate LTV' });
  }
});

/**
 * GET /api/reports/metrics/cac
 * Get Customer Acquisition Cost
 * Query params:
 *   - marketing_spend: number (required, in BRL)
 *   - start_date: YYYY-MM-DD
 *   - end_date: YYYY-MM-DD
 */
router.get('/metrics/cac', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      marketing_spend,
      start_date = getMonthAgo(),
      end_date = getTodayDate()
    } = req.query;

    if (!marketing_spend) {
      return res.status(400).json({
        error: 'marketing_spend parameter is required'
      });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const spend = parseFloat(marketing_spend);

    const cac = await calculateCAC(tenantId, startDate, endDate, spend);

    res.json({
      metric: 'CAC',
      value: cac,
      currency: 'BRL',
      marketing_spend: spend,
      period: { start_date, end_date },
      calculated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CAC] Error:', error);
    res.status(500).json({ error: 'Failed to calculate CAC' });
  }
});

/**
 * GET /api/reports/metrics/cohorts
 * Get subscription cohort analysis
 * Shows cohort health by start month
 */
router.get('/metrics/cohorts', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cohorts = await getSubscriptionCohorts(tenantId);

    res.json({
      cohorts,
      report_date: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('[Cohorts] Error:', error);
    res.status(500).json({ error: 'Failed to fetch cohort analysis' });
  }
});

// Helper functions

function validateDateRange(startDate, endDate) {
  const errors = [];

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate)) {
    errors.push(`start_date "${startDate}" is invalid (use YYYY-MM-DD)`);
  }
  if (!dateRegex.test(endDate)) {
    errors.push(`end_date "${endDate}" is invalid (use YYYY-MM-DD)`);
  }

  if (startDate > endDate) {
    errors.push('start_date must be before or equal to end_date');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function getMonthAgo() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().split('T')[0];
}

function get30DaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().split('T')[0];
}

function get90DaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().split('T')[0];
}

async function getCachedMetrics(tenantId, startDate, endDate) {
  const query = `
    SELECT data
    FROM metrics_cache
    WHERE tenant_id = $1
      AND start_date = $2
      AND end_date = $3
      AND cached_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'
  `;

  try {
    const { rows } = await pool.query(query, [tenantId, startDate, endDate]);
    return rows[0]?.data || null;
  } catch (err) {
    return null;
  }
}

async function cacheMetrics(tenantId, startDate, endDate, data) {
  const query = `
    INSERT INTO metrics_cache (tenant_id, start_date, end_date, data)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, start_date, end_date) DO UPDATE SET
      data = $4,
      cached_at = NOW()
  `;

  try {
    await pool.query(query, [tenantId, startDate, endDate, JSON.stringify(data)]);
  } catch (err) {
    console.debug('[Cache] Unable to cache metrics');
  }
}

function generateErrorReference() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
