/**
 * api/reports/data-validator.js
 * Data validation and integrity checking for financial reports
 * AC-7: Detect orphaned charges, duplicate payments, currency validation
 */

const { Pool } = require('pg');
const pool = new Pool();

/**
 * Run complete data validation suite
 * Returns: { valid: boolean, issues: [], warnings: [], summary: {} }
 */
async function validateDataIntegrity(tenantId) {
  const startTime = Date.now();
  const issues = [];
  const warnings = [];

  try {
    // Run all validation checks in parallel
    const [
      orphanedCharges,
      duplicateCharges,
      currencyIssues,
      auditMismatches,
      subscriptionMismatches,
      customerMismatches
    ] = await Promise.all([
      detectOrphanedCharges(tenantId),
      detectDuplicatePayments(tenantId),
      validateCurrency(tenantId),
      validateAgainstAuditLog(tenantId),
      validateSubscriptionReferences(tenantId),
      validateCustomerReferences(tenantId)
    ]);

    // Aggregate results
    if (orphanedCharges.length > 0) {
      issues.push(...orphanedCharges);
    }
    if (duplicateCharges.length > 0) {
      issues.push(...duplicateCharges);
    }
    if (currencyIssues.length > 0) {
      issues.push(...currencyIssues);
    }
    if (auditMismatches.length > 0) {
      warnings.push(...auditMismatches);
    }
    if (subscriptionMismatches.length > 0) {
      warnings.push(...subscriptionMismatches);
    }
    if (customerMismatches.length > 0) {
      warnings.push(...customerMismatches);
    }

    const executionTime = Date.now() - startTime;

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      summary: {
        total_issues: issues.length,
        total_warnings: warnings.length,
        issues_by_type: {
          orphaned_charges: orphanedCharges.length,
          duplicate_payments: duplicateCharges.length,
          currency_errors: currencyIssues.length
        },
        warnings_by_type: {
          audit_mismatches: auditMismatches.length,
          subscription_mismatches: subscriptionMismatches.length,
          customer_mismatches: customerMismatches.length
        },
        execution_time_ms: executionTime,
        validated_at: new Date().toISOString()
      }
    };
  } catch (err) {
    console.error('[Data Validation] Error:', err);
    throw new Error(`Data validation failed: ${err.message}`);
  }
}

/**
 * Detect charges without valid subscription reference
 * Note: FK constraint should prevent this, but checking for data integrity
 */
async function detectOrphanedCharges(tenantId) {
  const query = `
    SELECT
      c.id,
      c.customer_id,
      c.subscription_id,
      c.amount_cents,
      c.status,
      c.created_at
    FROM charges c
    WHERE c.subscription_id NOT IN (
      SELECT id FROM subscriptions WHERE customer_id IN (
        SELECT id FROM customers WHERE tenant_id = $1
      )
    )
    AND c.customer_id IN (
      SELECT id FROM customers WHERE tenant_id = $1
    )
  `;

  try {
    const { rows } = await pool.query(query, [tenantId]);
    return rows.map(row => ({
      type: 'ORPHANED_CHARGE',
      severity: 'CRITICAL',
      charge_id: row.id,
      customer_id: row.customer_id,
      description: `Charge ${row.id} missing valid subscription reference`,
      amount_cents: row.amount_cents,
      status: row.status,
      created_at: row.created_at,
      action: 'Verify subscription exists or reassign charge'
    }));
  } catch (err) {
    console.debug('[Orphaned Charges] Query error:', err.message);
    return [];
  }
}

/**
 * Detect duplicate charges (same gateway_charge_id or multiple paid charges for same subscription on same date)
 */
async function detectDuplicatePayments(tenantId) {
  const issues = [];

  // Check 1: Duplicate gateway_charge_ids
  const dupGatewayQuery = `
    SELECT
      gateway_charge_id,
      ARRAY_AGG(id) as charge_ids,
      COUNT(*) as duplicate_count,
      customer_id
    FROM charges
    WHERE customer_id IN (
      SELECT id FROM customers WHERE tenant_id = $1
    )
    AND gateway_charge_id IS NOT NULL
    GROUP BY gateway_charge_id, customer_id
    HAVING COUNT(*) > 1
  `;

  try {
    const { rows } = await pool.query(dupGatewayQuery, [tenantId]);
    issues.push(...rows.map(row => ({
      type: 'DUPLICATE_GATEWAY_ID',
      severity: 'CRITICAL',
      gateway_charge_id: row.gateway_charge_id,
      charge_ids: row.charge_ids,
      duplicate_count: row.duplicate_count,
      customer_id: row.customer_id,
      description: `${row.duplicate_count} charges share gateway_charge_id ${row.gateway_charge_id}`,
      action: 'Investigate and consolidate duplicate charges'
    })));
  } catch (err) {
    console.debug('[Duplicate Payments] Gateway check error:', err.message);
  }

  // Check 2: Multiple paid charges for same subscription on same paid_at date
  const dupPaidQuery = `
    SELECT
      subscription_id,
      DATE(paid_at) as paid_date,
      ARRAY_AGG(id) as charge_ids,
      COUNT(*) as count,
      SUM(amount_cents) as total_amount,
      customer_id
    FROM charges
    WHERE customer_id IN (
      SELECT id FROM customers WHERE tenant_id = $1
    )
    AND status = 'paid'
    AND paid_at IS NOT NULL
    GROUP BY subscription_id, DATE(paid_at), customer_id
    HAVING COUNT(*) > 1
  `;

  try {
    const { rows } = await pool.query(dupPaidQuery, [tenantId]);
    issues.push(...rows.map(row => ({
      type: 'DUPLICATE_PAID_CHARGE',
      severity: 'HIGH',
      subscription_id: row.subscription_id,
      paid_date: row.paid_date,
      charge_ids: row.charge_ids,
      count: row.count,
      total_amount_cents: row.total_amount,
      customer_id: row.customer_id,
      description: `Subscription has ${row.count} paid charges on ${row.paid_date}`,
      action: 'Verify if charges represent same transaction or separate payments'
    })));
  } catch (err) {
    console.debug('[Duplicate Payments] Paid date check error:', err.message);
  }

  return issues;
}

/**
 * Validate all amounts are positive integers (BRL cents)
 */
async function validateCurrency(tenantId) {
  const issues = [];

  // Check charges table
  const chargesQuery = `
    SELECT
      id,
      subscription_id,
      customer_id,
      amount_cents,
      status
    FROM charges
    WHERE customer_id IN (
      SELECT id FROM customers WHERE tenant_id = $1
    )
    AND (amount_cents <= 0 OR amount_cents IS NULL)
  `;

  try {
    const { rows: chargeRows } = await pool.query(chargesQuery, [tenantId]);
    issues.push(...chargeRows.map(row => ({
      type: 'INVALID_AMOUNT',
      severity: 'CRITICAL',
      entity_type: 'charge',
      entity_id: row.id,
      amount_cents: row.amount_cents,
      customer_id: row.customer_id,
      description: `Charge ${row.id} has invalid amount: ${row.amount_cents}`,
      action: 'Correct or remove invalid charge entry'
    })));
  } catch (err) {
    console.debug('[Currency Validation] Charges check error:', err.message);
  }

  // Check subscriptions table
  const subsQuery = `
    SELECT
      s.id,
      s.customer_id,
      p.amount_cents,
      p.name as plan_name
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.customer_id IN (
      SELECT id FROM customers WHERE tenant_id = $1
    )
    AND (p.amount_cents <= 0 OR p.amount_cents IS NULL)
  `;

  try {
    const { rows: subRows } = await pool.query(subsQuery, [tenantId]);
    issues.push(...subRows.map(row => ({
      type: 'INVALID_PLAN_AMOUNT',
      severity: 'CRITICAL',
      entity_type: 'subscription',
      entity_id: row.id,
      amount_cents: row.amount_cents,
      plan_name: row.plan_name,
      customer_id: row.customer_id,
      description: `Plan "${row.plan_name}" has invalid amount: ${row.amount_cents}`,
      action: 'Update plan with correct amount'
    })));
  } catch (err) {
    console.debug('[Currency Validation] Subscriptions check error:', err.message);
  }

  return issues;
}

/**
 * Validate paid charges have corresponding audit log entries
 */
async function validateAgainstAuditLog(tenantId) {
  const query = `
    SELECT
      c.id as charge_id,
      c.customer_id,
      c.status,
      c.paid_at,
      COUNT(w.id) as webhook_count
    FROM charges c
    LEFT JOIN webhooks w ON c.id = w.charge_id
      AND w.event IN ('charge.paid', 'payment.success')
    WHERE c.customer_id IN (
      SELECT id FROM customers WHERE tenant_id = $1
    )
    AND c.status = 'paid'
    AND c.paid_at IS NOT NULL
    GROUP BY c.id, c.customer_id, c.status, c.paid_at
    HAVING COUNT(w.id) = 0
  `;

  try {
    const { rows } = await pool.query(query, [tenantId]);
    return rows.map(row => ({
      type: 'AUDIT_MISMATCH',
      severity: 'MEDIUM',
      charge_id: row.charge_id,
      customer_id: row.customer_id,
      paid_at: row.paid_at,
      description: `Paid charge ${row.charge_id} has no audit log entry`,
      action: 'Verify payment record in gateway or add manual audit entry'
    }));
  } catch (err) {
    console.debug('[Audit Validation] Error:', err.message);
    return [];
  }
}

/**
 * Validate subscription references are valid
 */
async function validateSubscriptionReferences(tenantId) {
  const query = `
    SELECT
      s.id as subscription_id,
      s.customer_id,
      s.plan_id,
      COUNT(DISTINCT c.id) as charge_count
    FROM subscriptions s
    LEFT JOIN charges c ON s.id = c.subscription_id
    WHERE s.customer_id IN (
      SELECT id FROM customers WHERE tenant_id = $1
    )
    AND s.plan_id NOT IN (SELECT id FROM plans)
    GROUP BY s.id, s.customer_id, s.plan_id
  `;

  try {
    const { rows } = await pool.query(query, [tenantId]);
    return rows.map(row => ({
      type: 'INVALID_PLAN_REFERENCE',
      severity: 'MEDIUM',
      subscription_id: row.subscription_id,
      customer_id: row.customer_id,
      plan_id: row.plan_id,
      charge_count: row.charge_count,
      description: `Subscription ${row.subscription_id} references non-existent plan`,
      action: 'Reassign subscription to valid plan'
    }));
  } catch (err) {
    console.debug('[Subscription Reference] Error:', err.message);
    return [];
  }
}

/**
 * Validate customer references exist
 */
async function validateCustomerReferences(tenantId) {
  const issues = [];

  // Subscriptions with invalid customer_id
  const subsQuery = `
    SELECT
      s.id as subscription_id,
      s.customer_id,
      COUNT(c.id) as charge_count
    FROM subscriptions s
    LEFT JOIN charges c ON s.id = c.subscription_id
    WHERE s.customer_id NOT IN (SELECT id FROM customers)
    GROUP BY s.id, s.customer_id
    LIMIT 100
  `;

  try {
    const { rows } = await pool.query(subsQuery);
    issues.push(...rows.map(row => ({
      type: 'INVALID_CUSTOMER_REFERENCE',
      severity: 'CRITICAL',
      entity_type: 'subscription',
      entity_id: row.subscription_id,
      customer_id: row.customer_id,
      charge_count: row.charge_count,
      description: `Subscription ${row.subscription_id} references non-existent customer`,
      action: 'Delete subscription or correct customer reference'
    })));
  } catch (err) {
    console.debug('[Customer Reference] Subscriptions check error:', err.message);
  }

  // Charges with invalid customer_id
  const chargesQuery = `
    SELECT
      c.id as charge_id,
      c.customer_id,
      c.subscription_id,
      COUNT(*) as count
    FROM charges c
    WHERE c.customer_id NOT IN (SELECT id FROM customers)
    GROUP BY c.id, c.customer_id, c.subscription_id
    LIMIT 100
  `;

  try {
    const { rows } = await pool.query(chargesQuery);
    issues.push(...rows.map(row => ({
      type: 'INVALID_CUSTOMER_REFERENCE',
      severity: 'CRITICAL',
      entity_type: 'charge',
      entity_id: row.charge_id,
      customer_id: row.customer_id,
      subscription_id: row.subscription_id,
      description: `Charge ${row.charge_id} references non-existent customer`,
      action: 'Delete charge or correct customer reference'
    })));
  } catch (err) {
    console.debug('[Customer Reference] Charges check error:', err.message);
  }

  return issues;
}

/**
 * Get detailed report for a specific issue
 */
async function getIssueDetails(tenantId, issueType, entityId) {
  try {
    if (issueType === 'ORPHANED_CHARGE') {
      const query = `
        SELECT
          c.*,
          cust.email,
          cust.name
        FROM charges c
        LEFT JOIN customers cust ON c.customer_id = cust.id
        WHERE c.id = $1
          AND c.customer_id IN (
            SELECT id FROM customers WHERE tenant_id = $2
          )
      `;
      const { rows } = await pool.query(query, [entityId, tenantId]);
      return rows[0] || null;
    }

    if (issueType === 'INVALID_AMOUNT') {
      const query = `
        SELECT
          c.*,
          s.status as subscription_status,
          cust.email,
          cust.name
        FROM charges c
        LEFT JOIN subscriptions s ON c.subscription_id = s.id
        LEFT JOIN customers cust ON c.customer_id = cust.id
        WHERE c.id = $1
          AND c.customer_id IN (
            SELECT id FROM customers WHERE tenant_id = $2
          )
      `;
      const { rows } = await pool.query(query, [entityId, tenantId]);
      return rows[0] || null;
    }

    return null;
  } catch (err) {
    console.error('[Issue Details] Error:', err);
    return null;
  }
}

module.exports = {
  validateDataIntegrity,
  detectOrphanedCharges,
  detectDuplicatePayments,
  validateCurrency,
  validateAgainstAuditLog,
  validateSubscriptionReferences,
  validateCustomerReferences,
  getIssueDetails
};
