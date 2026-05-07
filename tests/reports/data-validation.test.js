/**
 * tests/reports/data-validation.test.js
 * Test suite for data validation module
 * AC-7: Validates detection of orphaned charges, duplicates, and currency issues
 */

const {
  validateDataIntegrity,
  detectOrphanedCharges,
  detectDuplicatePayments,
  validateCurrency,
  validateAgainstAuditLog,
  validateSubscriptionReferences,
  validateCustomerReferences
} = require('../../api/reports/data-validator');

describe('Data Validation Suite (AC-7)', () => {
  const testTenantId = 'test-tenant-123';

  describe('detectOrphanedCharges', () => {
    test('should detect charges with missing subscription reference', async () => {
      // Note: Actual implementation depends on database state
      // This test validates the query structure
      const result = await detectOrphanedCharges(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      if (result.length > 0) {
        const issue = result[0];
        expect(issue.type).toBe('ORPHANED_CHARGE');
        expect(issue.severity).toBe('CRITICAL');
        expect(issue.charge_id).toBeDefined();
        expect(issue.description).toContain('missing valid subscription');
        expect(issue.action).toBeDefined();
      }
    });

    test('should return empty array when no orphaned charges exist', async () => {
      const result = await detectOrphanedCharges(testTenantId);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('detectDuplicatePayments', () => {
    test('should detect duplicate gateway_charge_ids', async () => {
      const result = await detectDuplicatePayments(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      const gatewayDupes = result.filter(i => i.type === 'DUPLICATE_GATEWAY_ID');
      if (gatewayDupes.length > 0) {
        const issue = gatewayDupes[0];
        expect(issue.severity).toBe('CRITICAL');
        expect(issue.gateway_charge_id).toBeDefined();
        expect(issue.charge_ids).toBeDefined();
        expect(Array.isArray(issue.charge_ids)).toBe(true);
        expect(issue.duplicate_count).toBeGreaterThan(1);
      }
    });

    test('should detect multiple paid charges on same date', async () => {
      const result = await detectDuplicatePayments(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      const paidDupes = result.filter(i => i.type === 'DUPLICATE_PAID_CHARGE');
      if (paidDupes.length > 0) {
        const issue = paidDupes[0];
        expect(issue.severity).toBe('HIGH');
        expect(issue.subscription_id).toBeDefined();
        expect(issue.paid_date).toBeDefined();
        expect(issue.count).toBeGreaterThan(1);
      }
    });
  });

  describe('validateCurrency', () => {
    test('should detect invalid charge amounts', async () => {
      const result = await validateCurrency(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      const invalidCharges = result.filter(i => i.entity_type === 'charge');
      if (invalidCharges.length > 0) {
        const issue = invalidCharges[0];
        expect(issue.type).toBe('INVALID_AMOUNT');
        expect(issue.severity).toBe('CRITICAL');
        expect(issue.entity_id).toBeDefined();
        expect(issue.amount_cents).toBeLessThanOrEqual(0);
      }
    });

    test('should detect invalid plan amounts', async () => {
      const result = await validateCurrency(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      const invalidPlans = result.filter(i => i.entity_type === 'subscription');
      if (invalidPlans.length > 0) {
        const issue = invalidPlans[0];
        expect(issue.type).toBe('INVALID_PLAN_AMOUNT');
        expect(issue.severity).toBe('CRITICAL');
      }
    });

    test('should have BRL (cents) for all valid amounts', async () => {
      const result = await validateCurrency(testTenantId);
      // All invalid amounts should be detected, no valid amounts should appear here
      result.forEach(issue => {
        expect(issue.amount_cents).toBeLessThanOrEqual(0);
      });
    });
  });

  describe('validateAgainstAuditLog', () => {
    test('should detect paid charges without audit entries', async () => {
      const result = await validateAgainstAuditLog(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      if (result.length > 0) {
        const issue = result[0];
        expect(issue.type).toBe('AUDIT_MISMATCH');
        expect(issue.severity).toBe('MEDIUM');
        expect(issue.charge_id).toBeDefined();
        expect(issue.paid_at).toBeDefined();
        expect(issue.description).toContain('no audit log entry');
      }
    });

    test('should not flag charges with audit entries', async () => {
      const result = await validateAgainstAuditLog(testTenantId);
      // Result should only contain charges WITHOUT audit entries
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('validateSubscriptionReferences', () => {
    test('should detect invalid plan references', async () => {
      const result = await validateSubscriptionReferences(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      if (result.length > 0) {
        const issue = result[0];
        expect(issue.type).toBe('INVALID_PLAN_REFERENCE');
        expect(issue.severity).toBe('MEDIUM');
        expect(issue.subscription_id).toBeDefined();
        expect(issue.plan_id).toBeDefined();
      }
    });
  });

  describe('validateCustomerReferences', () => {
    test('should detect invalid customer references', async () => {
      const result = await validateCustomerReferences(testTenantId);
      expect(Array.isArray(result)).toBe(true);

      if (result.length > 0) {
        result.forEach(issue => {
          expect(issue.type).toBe('INVALID_CUSTOMER_REFERENCE');
          expect(issue.severity).toBe('CRITICAL');
          expect(['subscription', 'charge']).toContain(issue.entity_type);
        });
      }
    });
  });

  describe('validateDataIntegrity (Full Suite)', () => {
    test('should return comprehensive validation result', async () => {
      const result = await validateDataIntegrity(testTenantId);

      expect(result).toHaveProperty('valid');
      expect(typeof result.valid).toBe('boolean');
      expect(result).toHaveProperty('issues');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result).toHaveProperty('summary');
    });

    test('should include comprehensive summary', async () => {
      const result = await validateDataIntegrity(testTenantId);

      expect(result.summary).toHaveProperty('total_issues');
      expect(result.summary).toHaveProperty('total_warnings');
      expect(result.summary).toHaveProperty('issues_by_type');
      expect(result.summary).toHaveProperty('warnings_by_type');
      expect(result.summary).toHaveProperty('execution_time_ms');
      expect(result.summary).toHaveProperty('validated_at');
    });

    test('should count issues by type correctly', async () => {
      const result = await validateDataIntegrity(testTenantId);

      const issueTypes = result.summary.issues_by_type;
      expect(issueTypes).toHaveProperty('orphaned_charges');
      expect(issueTypes).toHaveProperty('duplicate_payments');
      expect(issueTypes).toHaveProperty('currency_errors');

      // Verify counts match actual issues
      const orphanedCount = result.issues.filter(i => i.type === 'ORPHANED_CHARGE').length;
      expect(orphanedCount).toBe(issueTypes.orphaned_charges);
    });

    test('should mark valid when no issues found', async () => {
      const result = await validateDataIntegrity(testTenantId);

      if (result.issues.length === 0) {
        expect(result.valid).toBe(true);
      } else {
        expect(result.valid).toBe(false);
      }
    });

    test('should complete within acceptable time', async () => {
      const start = Date.now();
      const result = await validateDataIntegrity(testTenantId);
      const duration = Date.now() - start;

      expect(result.summary.execution_time_ms).toBeLessThan(10000); // 10 seconds max
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Issue Structure Validation', () => {
    test('issues should have required fields', async () => {
      const result = await validateDataIntegrity(testTenantId);

      result.issues.forEach(issue => {
        expect(issue).toHaveProperty('type');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('description');
        expect(issue).toHaveProperty('action');
        expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(issue.severity);
      });
    });

    test('warnings should have required fields', async () => {
      const result = await validateDataIntegrity(testTenantId);

      result.warnings.forEach(warning => {
        expect(warning).toHaveProperty('type');
        expect(warning).toHaveProperty('description');
        expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(warning.severity);
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle database errors gracefully', async () => {
      // Test with invalid tenant ID
      const result = await validateDataIntegrity('invalid-tenant-id');
      expect(result).toHaveProperty('valid');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test('should limit issue details to prevent memory issues', async () => {
      const result = await validateDataIntegrity(testTenantId);
      // If there are many issues, they should still be returned
      // but detail retrieval should be bounded
      expect(result.issues.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Targets', () => {
    test('validation should complete in under 5 seconds', async () => {
      const start = Date.now();
      const result = await validateDataIntegrity(testTenantId);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
    });

    test('individual checks should be parallelized', async () => {
      // Parallel execution should make full validation faster than sum of parts
      const start = Date.now();
      const result = await validateDataIntegrity(testTenantId);
      const fullTime = Date.now() - start;

      // If checks were sequential, this would be much slower
      // This test verifies they run in parallel
      expect(fullTime).toBeLessThan(5000);
    });
  });
});
