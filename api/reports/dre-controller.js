/**
 * api/reports/dre-controller.js
 * REST API endpoints for DRE (Demonstração de Resultado do Exercício) reports
 * AC-1, AC-4, AC-8, AC-9, AC-10
 */

const express = require('express');
const { Pool } = require('pg');
const { calculateDRE, comparePeriods } = require('./dre-calculator');
const { validateDRERequest, validatePeriodFormat } = require('./dre-validator');

const router = express.Router();
const pool = new Pool();

/**
 * GET /api/reports/dre
 * Get DRE for specified period
 * Query params:
 *   - period: YYYY-MM (default: current month), YYYY-Q1-Q4, or YYYY
 *   - compare: boolean (default: false) - return variance vs previous period
 *   - cache: boolean (default: true) - use cached results for completed months
 */
router.get('/dre', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized: tenant_id missing' });
    }

    const { period, compare = false, cache = true } = req.query;
    const effectivePeriod = period || getCurrentMonth();

    // AC-9: Input validation
    const validation = validateDRERequest({ period: effectivePeriod, compare });
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.errors
      });
    }

    // AC-8: Check cache for completed months
    let dre;
    if (cache && isCompletedMonth(effectivePeriod)) {
      dre = await getCachedDRE(tenantId, effectivePeriod);
    }

    // If not in cache or cache disabled, calculate
    if (!dre) {
      dre = await calculateDRE(tenantId, effectivePeriod);

      // Cache completed months
      if (isCompletedMonth(effectivePeriod)) {
        await cacheDRE(tenantId, dre);
      }
    }

    // AC-1: Comparison logic (current vs previous period)
    if (compare) {
      const previousPeriod = getPreviousPeriod(effectivePeriod);
      const comparison = await comparePeriods(tenantId, effectivePeriod, previousPeriod);

      return res.json({
        current: dre,
        previous: comparison.previous,
        variance: comparison.variance,
        period: effectivePeriod,
        cached: cache && isCompletedMonth(effectivePeriod)
      });
    }

    res.json({
      ...dre,
      cached: cache && isCompletedMonth(effectivePeriod)
    });

  } catch (error) {
    // AC-9: Error handling
    if (error.message.includes('Invalid period format')) {
      return res.status(400).json({
        error: error.message,
        hint: 'Use YYYY-MM (monthly), YYYY-Q1-Q4 (quarterly), or YYYY (annual) format'
      });
    }

    console.error('[DRE] Controller error:', error);
    res.status(500).json({
      error: 'Failed to generate DRE report',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/dre/history
 * Get historical DRE reports with optional filtering
 * Query params:
 *   - from_date: YYYY-MM start date
 *   - to_date: YYYY-MM end date
 */
router.get('/dre/history', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { from_date, to_date } = req.query;

    // Fetch from cache table
    const query = `
      SELECT period, receita_bruta, taxas, receita_liquida, mrr, churn_rate, cached_at
      FROM dre_cache
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR period >= $2)
        AND ($3::text IS NULL OR period <= $3)
      ORDER BY period DESC
    `;

    const { rows } = await pool.query(query, [tenantId, from_date, to_date]);

    res.json({
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.error('[DRE History] Error:', error);
    res.status(500).json({ error: 'Failed to fetch DRE history' });
  }
});

/**
 * GET /api/reports/dre/audit
 * Get audit trail for DRE calculations (AC-7)
 * Validates data integrity and calculation provenance
 */
router.get('/dre/audit', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { period } = req.query;

    const query = `
      SELECT
        id, report_type, period_start, period_end,
        record_count, validation_errors, generated_at, generated_by
      FROM report_audit
      WHERE tenant_id = $1
        AND report_type = 'dre'
        AND ($2::text IS NULL OR period_start = $2::date)
      ORDER BY generated_at DESC
      LIMIT 100
    `;

    const { rows } = await pool.query(query, [tenantId, period]);

    res.json({
      count: rows.length,
      audits: rows
    });

  } catch (error) {
    console.error('[DRE Audit] Error:', error);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

// Helper functions

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function isCompletedMonth(period) {
  // Months before current month are completed
  // Format: YYYY-MM
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [year, month] = period.split('-');
  const periodDate = new Date(parseInt(year), parseInt(month) - 1, 1);

  return periodDate < currentMonth;
}

function getPreviousPeriod(period) {
  // Handle YYYY-MM, YYYY-Q1-Q4, YYYY formats
  if (period.match(/^\d{4}-\d{2}$/)) {
    // Monthly: 2025-05 → 2025-04
    const [year, month] = period.split('-').map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  }

  if (period.match(/^\d{4}-Q[1-4]$/)) {
    // Quarterly: 2025-Q2 → 2025-Q1
    const [year, quarter] = period.match(/(\d{4})-Q(\d)/).slice(1);
    const q = parseInt(quarter);
    const prevQuarter = q === 1 ? 4 : q - 1;
    const prevYear = q === 1 ? parseInt(year) - 1 : parseInt(year);
    return `${prevYear}-Q${prevQuarter}`;
  }

  if (period.match(/^\d{4}$/)) {
    // Annually: 2025 → 2024
    return String(parseInt(period) - 1);
  }

  return null;
}

async function getCachedDRE(tenantId, period) {
  const query = `
    SELECT receita_bruta, taxas, receita_liquida, mrr, churn_rate
    FROM dre_cache
    WHERE tenant_id = $1 AND period = $2
  `;

  const { rows } = await pool.query(query, [tenantId, period]);
  return rows[0] || null;
}

async function cacheDRE(tenantId, dre) {
  const { period, receita_bruta, taxas, receita_liquida, mrr, churn_rate } = dre;

  const query = `
    INSERT INTO dre_cache (tenant_id, period, receita_bruta, taxas, receita_liquida, mrr, churn_rate, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '30 days')
    ON CONFLICT (tenant_id, period) DO UPDATE SET
      cached_at = NOW(),
      expires_at = NOW() + INTERVAL '30 days'
  `;

  await pool.query(query, [
    tenantId, period, receita_bruta, taxas, receita_liquida, mrr, churn_rate
  ]);
}

function generateErrorReference() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
