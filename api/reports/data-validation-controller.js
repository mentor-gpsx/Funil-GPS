/**
 * api/reports/data-validation-controller.js
 * REST API endpoints for data validation and integrity checking
 * AC-7: Expose validation results via /api/reports/validate
 */

const express = require('express');
const {
  validateDataIntegrity,
  detectOrphanedCharges,
  detectDuplicatePayments,
  validateCurrency,
  validateAgainstAuditLog,
  getIssueDetails
} = require('./data-validator');

const router = express.Router();

/**
 * GET /api/reports/validate
 * Run complete data validation suite
 * Query params:
 *   - include_details: boolean (default: false) - Include detailed issue info
 *   - severity: CRITICAL|HIGH|MEDIUM (default: all)
 */
router.get('/validate', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const includeDetails = req.query.include_details === 'true';
    const severityFilter = req.query.severity;

    const result = await validateDataIntegrity(tenantId);

    // Filter by severity if specified
    if (severityFilter) {
      result.issues = result.issues.filter(issue => issue.severity === severityFilter);
      result.warnings = result.warnings.filter(warning => warning.severity === severityFilter);
    }

    // Include details if requested (fetch from DB for each issue)
    if (includeDetails && result.issues.length > 0) {
      const details = await Promise.all(
        result.issues.slice(0, 50).map(issue => // Limit to 50 for performance
          getIssueDetails(tenantId, issue.type, issue.charge_id || issue.entity_id)
        )
      );
      result.issues_with_details = details.filter(d => d !== null);
    }

    res.json(result);

  } catch (error) {
    console.error('[Data Validation] Controller error:', error);
    res.status(500).json({
      error: 'Validation failed',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/validate/orphaned
 * Check for orphaned charges only
 */
router.get('/validate/orphaned', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const orphaned = await detectOrphanedCharges(tenantId);

    res.json({
      check: 'orphaned_charges',
      found: orphaned.length,
      issues: orphaned,
      status: orphaned.length === 0 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Orphaned Check] Error:', error);
    res.status(500).json({
      error: 'Check failed',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/validate/duplicates
 * Check for duplicate payments only
 */
router.get('/validate/duplicates', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const duplicates = await detectDuplicatePayments(tenantId);

    res.json({
      check: 'duplicate_payments',
      found: duplicates.length,
      issues: duplicates,
      status: duplicates.length === 0 ? 'PASS' : 'FAIL',
      by_type: {
        gateway_id_duplicates: duplicates.filter(d => d.type === 'DUPLICATE_GATEWAY_ID').length,
        paid_date_duplicates: duplicates.filter(d => d.type === 'DUPLICATE_PAID_CHARGE').length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Duplicates Check] Error:', error);
    res.status(500).json({
      error: 'Check failed',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/validate/currency
 * Check for invalid amounts only
 */
router.get('/validate/currency', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currencyIssues = await validateCurrency(tenantId);

    res.json({
      check: 'currency_validation',
      found: currencyIssues.length,
      issues: currencyIssues,
      status: currencyIssues.length === 0 ? 'PASS' : 'FAIL',
      by_type: {
        invalid_charges: currencyIssues.filter(i => i.entity_type === 'charge').length,
        invalid_plans: currencyIssues.filter(i => i.entity_type === 'subscription').length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Currency Check] Error:', error);
    res.status(500).json({
      error: 'Check failed',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/validate/audit
 * Check audit log consistency
 */
router.get('/validate/audit', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auditIssues = await validateAgainstAuditLog(tenantId);

    res.json({
      check: 'audit_log_consistency',
      found: auditIssues.length,
      issues: auditIssues,
      status: auditIssues.length === 0 ? 'PASS' : 'WARNING',
      description: 'Paid charges without corresponding audit log entries',
      recommendation: auditIssues.length > 0
        ? 'Investigate missing audit logs or mark charges as incorrect'
        : 'All paid charges have audit log entries',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Audit Check] Error:', error);
    res.status(500).json({
      error: 'Check failed',
      reference: generateErrorReference()
    });
  }
});

/**
 * GET /api/reports/validate/summary
 * Get summary of data integrity without full details
 * Useful for dashboards and quick health checks
 */
router.get('/validate/summary', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await validateDataIntegrity(tenantId);

    res.json({
      status: result.valid ? 'HEALTHY' : 'ISSUES_DETECTED',
      summary: result.summary,
      critical_issues: result.issues.filter(i => i.severity === 'CRITICAL').length,
      high_issues: result.issues.filter(i => i.severity === 'HIGH').length,
      warnings: result.warnings.length,
      overall_health: calculateHealthScore(result),
      recommendations: generateRecommendations(result),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Summary Check] Error:', error);
    res.status(500).json({
      error: 'Summary check failed',
      reference: generateErrorReference()
    });
  }
});

/**
 * POST /api/reports/validate/export
 * Export validation report in various formats
 * Body:
 *   - format: json|csv|pdf (default: json)
 *   - include_warnings: boolean
 */
router.post('/validate/export', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const format = req.body.format || 'json';
    const includeWarnings = req.body.include_warnings !== false;

    const result = await validateDataIntegrity(tenantId);

    if (format === 'json') {
      const report = {
        generated_at: new Date().toISOString(),
        status: result.valid ? 'HEALTHY' : 'ISSUES_DETECTED',
        summary: result.summary,
        issues: result.issues,
        warnings: includeWarnings ? result.warnings : undefined
      };

      res.json(report);
    } else if (format === 'csv') {
      const csv = generateCSVReport(result, includeWarnings);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="validation-report.csv"');
      res.send(csv);
    } else {
      res.status(400).json({
        error: 'Invalid format',
        valid_formats: ['json', 'csv']
      });
    }

  } catch (error) {
    console.error('[Export] Error:', error);
    res.status(500).json({
      error: 'Export failed',
      reference: generateErrorReference()
    });
  }
});

// Helper functions

function calculateHealthScore(result) {
  const totalIssues = result.issues.length;
  const totalWarnings = result.warnings.length;

  const criticalCount = result.issues.filter(i => i.severity === 'CRITICAL').length;
  const highCount = result.issues.filter(i => i.severity === 'HIGH').length;

  // Score: 100 - (critical*20 + high*10 + medium*5 + warnings*2)
  const score = Math.max(0, 100 - (criticalCount * 20 + highCount * 10 + (totalIssues - criticalCount - highCount) * 5 + totalWarnings * 2));

  return {
    score,
    rating: score >= 90 ? 'EXCELLENT' : score >= 80 ? 'GOOD' : score >= 70 ? 'FAIR' : score >= 50 ? 'POOR' : 'CRITICAL'
  };
}

function generateRecommendations(result) {
  const recommendations = [];

  const criticalIssues = result.issues.filter(i => i.severity === 'CRITICAL');
  if (criticalIssues.length > 0) {
    recommendations.push('⚠️  URGENT: Fix critical data integrity issues immediately');
    const types = new Set(criticalIssues.map(i => i.type));
    types.forEach(type => {
      const count = criticalIssues.filter(i => i.type === type).length;
      recommendations.push(`  - ${count} ${type} issue(s)`);
    });
  }

  const highIssues = result.issues.filter(i => i.severity === 'HIGH');
  if (highIssues.length > 0) {
    recommendations.push('❗ Review and address high-severity issues');
  }

  if (result.warnings.length > 0) {
    recommendations.push('ℹ️  Check warnings for potential data quality issues');
  }

  if (criticalIssues.length === 0 && highIssues.length === 0 && result.warnings.length === 0) {
    recommendations.push('✅ All data integrity checks passed');
  }

  return recommendations;
}

function generateCSVReport(result, includeWarnings) {
  const rows = [];

  // Header
  rows.push(['Data Integrity Validation Report']);
  rows.push([`Generated: ${new Date().toISOString()}`]);
  rows.push([`Status: ${result.valid ? 'HEALTHY' : 'ISSUES_DETECTED'}`]);
  rows.push(['']);

  // Summary
  rows.push(['SUMMARY']);
  rows.push(['Total Issues', result.summary.total_issues]);
  rows.push(['Total Warnings', result.summary.total_warnings]);
  rows.push(['Execution Time (ms)', result.summary.execution_time_ms]);
  rows.push(['']);

  // Issues by type
  rows.push(['ISSUES BY TYPE']);
  rows.push(['Type', 'Count']);
  Object.entries(result.summary.issues_by_type).forEach(([type, count]) => {
    rows.push([type, count]);
  });
  rows.push(['']);

  // Issues details
  if (result.issues.length > 0) {
    rows.push(['CRITICAL & HIGH ISSUES']);
    rows.push(['Type', 'Severity', 'Entity ID', 'Description', 'Action']);
    result.issues.forEach(issue => {
      rows.push([
        issue.type,
        issue.severity,
        issue.charge_id || issue.entity_id || '-',
        issue.description,
        issue.action
      ]);
    });
    rows.push(['']);
  }

  // Warnings
  if (includeWarnings && result.warnings.length > 0) {
    rows.push(['WARNINGS']);
    rows.push(['Type', 'Description', 'Action']);
    result.warnings.forEach(warning => {
      rows.push([
        warning.type,
        warning.description,
        warning.action || '-'
      ]);
    });
  }

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function generateErrorReference() {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
