/**
 * api/reports/forecast-controller.js
 * REST API endpoints for Revenue Forecasts
 * AC-5: 30/90-day forecasts with confidence scores and risk scenarios
 */

const express = require('express');
const { Pool } = require('pg');
const {
  calculateForecast30,
  calculateForecast90,
  calculateRiskScenarios,
  calculateVarianceAnalysis
} = require('./forecast-calculator');

const router = express.Router();
const pool = new Pool();

const CACHE_TTL_HOURS = 24; // AC-8: Cache forecasts for 24 hours

/**
 * GET /api/reports/forecast
 * Get revenue forecast (30 or 90 days)
 * Query params:
 *   - days: 30 or 90 (default: 30)
 *   - cache: boolean (default: true)
 */
router.get('/forecast', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days) || 30;
    const cache = req.query.cache !== 'false';

    // AC-9: Validate days parameter
    if (![30, 90].includes(days)) {
      return res.status(400).json({
        error: 'Invalid days parameter',
        valid_options: [30, 90]
      });
    }

    // AC-8: Check cache
    let forecast;
    if (cache) {
      forecast = await getCachedForecast(tenantId, days);
    }

    // Calculate if not cached
    if (!forecast) {
      forecast = days === 30
        ? await calculateForecast30(tenantId)
        : await calculateForecast90(tenantId);

      // Cache the result
      if (cache) {
        await cacheForecast(tenantId, days, forecast);
      }
    }

    res.json({
      ...forecast,
      cached: cache
    });

  } catch (error) {
    console.error('[Forecast] Controller error:', error);
    res.status(500).json({
      error: 'Failed to generate forecast',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/forecast/confidence
 * Get forecast with detailed confidence breakdown
 * Query params:
 *   - days: 30 or 90 (default: 30)
 */
router.get('/forecast/confidence', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days) || 30;

    if (![30, 90].includes(days)) {
      return res.status(400).json({
        error: 'Invalid days parameter',
        valid_options: [30, 90]
      });
    }

    const forecast = days === 30
      ? await calculateForecast30(tenantId)
      : await calculateForecast90(tenantId);

    // Return forecast with focus on confidence tiers
    res.json({
      period: forecast.period,
      confidence_analysis: {
        high_confidence: {
          ...forecast.confidence.high,
          description: 'PIX payments (95% collection rate)',
          collection_rate: 0.95
        },
        medium_confidence: {
          ...forecast.confidence.medium,
          description: 'Boleto payments (70% collection rate)',
          collection_rate: 0.70
        },
        low_confidence: {
          ...forecast.confidence.low,
          description: 'Credit card payments (40% collection rate)',
          collection_rate: 0.40
        }
      },
      forecast_scenarios: forecast.totals.confidence_scenarios,
      subscription_count: forecast.subscription_count
    });

  } catch (error) {
    console.error('[Confidence Forecast] Error:', error);
    res.status(500).json({ error: 'Failed to generate confidence forecast' });
  }
});

/**
 * GET /api/reports/forecast/risks
 * Get risk scenario analysis
 * Models impact of churn increases (+5%, +10%, +15%)
 */
router.get('/forecast/risks', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const riskScenarios = await calculateRiskScenarios(tenantId);

    res.json({
      analysis: 'Churn Impact Modeling (AC-5)',
      report_date: new Date().toISOString().split('T')[0],
      ...riskScenarios
    });

  } catch (error) {
    console.error('[Risk Scenarios] Error:', error);
    res.status(500).json({ error: 'Failed to generate risk scenarios' });
  }
});

/**
 * GET /api/reports/forecast/variance
 * Get forecast vs actual variance analysis
 * Query params:
 *   - start_date: YYYY-MM-DD (required)
 *   - end_date: YYYY-MM-DD (required)
 */
router.get('/forecast/variance', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['start_date', 'end_date'],
        format: 'YYYY-MM-DD'
      });
    }

    const validation = validateDateRange(start_date, end_date);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid date range',
        details: validation.errors
      });
    }

    const variance = await calculateVarianceAnalysis(
      tenantId,
      new Date(start_date),
      new Date(end_date)
    );

    res.json({
      ...variance,
      interpretation: interpretVariance(variance.variance_percentage)
    });

  } catch (error) {
    console.error('[Variance Analysis] Error:', error);
    res.status(500).json({ error: 'Failed to generate variance analysis' });
  }
});

/**
 * GET /api/reports/forecast/daily
 * Get day-by-day forecast breakdown
 * Query params:
 *   - days: 30 or 90 (default: 30)
 *   - group_by: day or week (default: day)
 */
router.get('/forecast/daily', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days) || 30;
    const groupBy = req.query.group_by || 'day';

    if (![30, 90].includes(days)) {
      return res.status(400).json({
        error: 'Invalid days parameter',
        valid_options: [30, 90]
      });
    }

    const forecast = days === 30
      ? await calculateForecast30(tenantId)
      : await calculateForecast90(tenantId);

    const dailyData = groupBy === 'week'
      ? groupByWeek(forecast.daily_forecast)
      : forecast.daily_forecast;

    res.json({
      period: forecast.period,
      group_by: groupBy,
      daily_forecast: dailyData,
      summary: {
        total_days: dailyData.length,
        total_forecast: forecast.totals.total_forecast,
        weighted_forecast: forecast.totals.weighted_forecast,
        average_daily: forecast.totals.weighted_forecast / dailyData.length
      }
    });

  } catch (error) {
    console.error('[Daily Forecast] Error:', error);
    res.status(500).json({ error: 'Failed to generate daily forecast' });
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

function groupByWeek(dailyData) {
  const byWeek = {};

  dailyData.forEach(day => {
    const date = new Date(day.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());

    const weekKey = weekStart.toISOString().split('T')[0];

    if (!byWeek[weekKey]) {
      byWeek[weekKey] = {
        week_start: weekKey,
        week_end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        total_forecast: 0,
        high_confidence: 0,
        medium_confidence: 0,
        low_confidence: 0,
        days_count: 0
      };
    }

    byWeek[weekKey].total_forecast += day.total_forecast;
    byWeek[weekKey].high_confidence += day.high_confidence;
    byWeek[weekKey].medium_confidence += day.medium_confidence;
    byWeek[weekKey].low_confidence += day.low_confidence;
    byWeek[weekKey].days_count++;
  });

  return Object.values(byWeek);
}

function interpretVariance(variance) {
  if (variance > 15) {
    return 'Significantly outperforming forecast (+revenue)';
  } else if (variance > 5) {
    return 'Outperforming forecast slightly';
  } else if (variance > -5) {
    return 'On track with forecast';
  } else if (variance > -15) {
    return 'Underperforming forecast slightly';
  } else {
    return 'Significantly underperforming forecast (-revenue)';
  }
}

async function getCachedForecast(tenantId, days) {
  const query = `
    SELECT data
    FROM forecast_cache
    WHERE tenant_id = $1
      AND forecast_days = $2
      AND expires_at > NOW()
  `;

  try {
    const { rows } = await pool.query(query, [tenantId, days]);
    return rows[0]?.data || null;
  } catch (err) {
    return null;
  }
}

async function cacheForecast(tenantId, days, data) {
  const query = `
    INSERT INTO forecast_cache (tenant_id, forecast_days, data, expires_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '${CACHE_TTL_HOURS} hours')
    ON CONFLICT (tenant_id, forecast_days) DO UPDATE SET
      data = $3,
      cached_at = NOW(),
      expires_at = NOW() + INTERVAL '${CACHE_TTL_HOURS} hours'
  `;

  try {
    await pool.query(query, [tenantId, days, JSON.stringify(data)]);
  } catch (err) {
    console.debug('[Cache] Unable to cache forecast');
  }
}

function generateErrorReference() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
