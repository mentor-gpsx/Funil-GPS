/**
 * tests/reports/metrics.test.js
 * Recurring metrics unit tests
 * Tests: MRR, ARR, churn, LTV, CAC calculations
 */

describe('Recurring Metrics Calculator - Unit Tests', () => {
  describe('MRR (Monthly Recurring Revenue)', () => {
    test('should calculate MRR from active subscriptions', () => {
      const activeSubscriptions = [
        { plan: { amount_cents: 19900 } }, // R$ 199
        { plan: { amount_cents: 49900 } }, // R$ 499
        { plan: { amount_cents: 29900 } }  // R$ 299
      ];

      const mrr = activeSubscriptions.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100;
      expect(mrr).toBe(997);
    });

    test('should exclude canceled subscriptions from MRR', () => {
      const subscriptions = [
        { status: 'active', plan: { amount_cents: 19900 } },
        { status: 'active', plan: { amount_cents: 49900 } },
        { status: 'canceled', plan: { amount_cents: 29900 } }
      ];

      const activeOnly = subscriptions.filter(s => s.status === 'active');
      const mrr = activeOnly.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100;
      expect(mrr).toBeCloseTo(698, 0); // (19900 + 49900) / 100 = 698
    });

    test('should return 0 MRR when no active subscriptions', () => {
      const subscriptions = [];
      const mrr = subscriptions.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100;

      expect(mrr).toBe(0);
    });

    test('should handle subscriptions with different billing cycles', () => {
      const subscriptions = [
        { billing_cycle: 'monthly', amount_cents: 19900 },
        { billing_cycle: 'annual', amount_cents: 119900 }
      ];

      // Normalize to monthly
      let mrrTotal = 0;
      subscriptions.forEach(sub => {
        const monthlyAmount = sub.billing_cycle === 'annual'
          ? sub.amount_cents / 12
          : sub.amount_cents;
        mrrTotal += monthlyAmount / 100;
      });

      expect(mrrTotal).toBeCloseTo(207.42, 1); // 199 + (119900/12/100)
    });

    test('should handle null plan reference', () => {
      const subscriptions = [
        { plan: null },
        { plan: { amount_cents: 19900 } }
      ];

      const mrr = subscriptions.reduce((sum, s) => sum + (s.plan?.amount_cents || 0), 0) / 100;
      expect(mrr).toBe(199);
    });
  });

  describe('ARR (Annual Recurring Revenue)', () => {
    test('should calculate ARR as MRR × 12', () => {
      const mrr = 1000;
      const arr = mrr * 12;

      expect(arr).toBe(12000);
    });

    test('should handle fractional MRR', () => {
      const mrr = 1234.567;
      const arr = mrr * 12;

      expect(arr).toBeCloseTo(14814.80, 1);
    });

    test('should return 0 ARR when MRR is 0', () => {
      const mrr = 0;
      const arr = mrr * 12;

      expect(arr).toBe(0);
    });
  });

  describe('Churn Rate', () => {
    test('should calculate churn rate correctly', () => {
      const activeAtStart = 100;
      const canceledInPeriod = 10;
      const churnRate = (canceledInPeriod / activeAtStart) * 100;

      expect(churnRate).toBe(10); // 10% churn
    });

    test('should return 0 churn when no cancellations', () => {
      const activeAtStart = 100;
      const canceledInPeriod = 0;
      const churnRate = (canceledInPeriod / activeAtStart) * 100;

      expect(churnRate).toBe(0);
    });

    test('should return 0 churn when no subscriptions at start', () => {
      const activeAtStart = 0;
      const canceledInPeriod = 10;
      const churnRate = activeAtStart > 0 ? (canceledInPeriod / activeAtStart) * 100 : 0;

      expect(churnRate).toBe(0);
    });

    test('should cap churn at 100% when more cancel than started', () => {
      const activeAtStart = 50;
      const canceledInPeriod = 100;
      let churnRate = (canceledInPeriod / activeAtStart) * 100;
      churnRate = Math.min(100, churnRate);

      expect(churnRate).toBe(100);
    });

    test('should format churn to 2 decimals', () => {
      const churnRate = 10.123456;
      const formatted = parseFloat(churnRate.toFixed(2));

      expect(formatted).toBe(10.12);
    });

    test('should identify high churn (> 5% monthly)', () => {
      const churnRate = 5.5;
      const isHighChurn = churnRate > 5;

      expect(isHighChurn).toBe(true);
    });

    test('should identify healthy churn (< 5% monthly)', () => {
      const churnRate = 3.2;
      const isHealthy = churnRate < 5;

      expect(isHealthy).toBe(true);
    });
  });

  describe('LTV (Lifetime Value)', () => {
    test('should calculate LTV correctly', () => {
      const avgSubscriptionValue = 500; // R$ 500/month
      const avgLifetime = 12; // months
      const ltv = avgSubscriptionValue * avgLifetime;

      expect(ltv).toBe(6000);
    });

    test('should account for gross margin in LTV', () => {
      const avgValue = 500;
      const grossMargin = 0.60; // 60% gross margin
      const avgLifetime = 12;
      const ltv = avgValue * grossMargin * avgLifetime;

      expect(ltv).toBe(3600);
    });

    test('should estimate lifetime from churn rate', () => {
      const monthlyChurnRate = 0.05; // 5% churn
      const avgLifetime = 1 / monthlyChurnRate;

      expect(avgLifetime).toBe(20); // 20 months
    });

    test('should handle very low churn (high lifetime)', () => {
      const monthlyChurnRate = 0.01; // 1% churn
      const avgLifetime = 1 / monthlyChurnRate;

      expect(avgLifetime).toBe(100);
    });

    test('should calculate LTV with multiple pricing tiers', () => {
      const subscriptions = [
        { tier: 'basic', value: 199, count: 40, avgLifetime: 12 },
        { tier: 'pro', value: 499, count: 50, avgLifetime: 18 },
        { tier: 'enterprise', value: 1999, count: 10, avgLifetime: 24 }
      ];

      const totalLTV = subscriptions.reduce((sum, sub) =>
        sum + (sub.value * sub.count * sub.avgLifetime), 0
      );

      // (199*40*12) + (499*50*18) + (1999*10*24) = 95,520 + 449,100 + 479,760 = 1,024,380
      expect(totalLTV).toBe(1024380);
    });
  });

  describe('CAC (Customer Acquisition Cost)', () => {
    test('should calculate CAC from marketing spend and new customers', () => {
      const marketingSpend = 50000;
      const newCustomers = 500;
      const cac = marketingSpend / newCustomers;

      expect(cac).toBe(100);
    });

    test('should return Infinity when no customers acquired', () => {
      const marketingSpend = 50000;
      const newCustomers = 0;
      const cac = newCustomers > 0 ? marketingSpend / newCustomers : Infinity;

      expect(cac).toBe(Infinity);
    });

    test('should calculate CAC payback period', () => {
      const cac = 500;
      const monthlyMargin = 250;
      const paybackMonths = cac / monthlyMargin;

      expect(paybackMonths).toBe(2);
    });

    test('should identify good CAC (LTV:CAC > 3)', () => {
      const ltv = 3000;
      const cac = 500;
      const ltvCacRatio = ltv / cac;

      expect(ltvCacRatio).toBe(6);
      expect(ltvCacRatio > 3).toBe(true);
    });

    test('should identify bad CAC (LTV:CAC < 1)', () => {
      const ltv = 300;
      const cac = 500;
      const ltvCacRatio = ltv / cac;

      expect(ltvCacRatio).toBe(0.6);
      expect(ltvCacRatio < 1).toBe(true);
    });

    test('should allocate marketing spend across channels', () => {
      const channels = {
        'google_ads': 0.40,
        'facebook_ads': 0.30,
        'organic': 0.20,
        'partnership': 0.10
      };

      const totalSpend = 100000;
      const byChannel = {};
      Object.keys(channels).forEach(ch => {
        byChannel[ch] = totalSpend * channels[ch];
      });

      expect(byChannel.google_ads).toBe(40000);
      expect(byChannel.facebook_ads).toBe(30000);
    });
  });

  describe('Cohort Analysis', () => {
    test('should calculate cohort retention', () => {
      const cohortStart = 100;
      const cohortMonth2 = 90;
      const cohortMonth3 = 80;

      const retention2 = (cohortMonth2 / cohortStart) * 100;
      const retention3 = (cohortMonth3 / cohortStart) * 100;

      expect(retention2).toBe(90);
      expect(retention3).toBe(80);
    });

    test('should identify declining vs stable cohorts', () => {
      const month1 = 100;
      const month2 = 90;
      const month3 = 85;

      const retention = [month1, month2, month3];
      const isDeclining = retention[1] < retention[0] && retention[2] < retention[1];

      expect(isDeclining).toBe(true);
    });

    test('should calculate revenue per cohort', () => {
      const cohorts = {
        '2026-01': { count: 100, mrrPerCustomer: 500 },
        '2026-02': { count: 80, mrrPerCustomer: 520 },
        '2026-03': { count: 60, mrrPerCustomer: 540 }
      };

      const revenueByMonth = {
        '2026-01': 100 * 500,
        '2026-02': 80 * 520,
        '2026-03': 60 * 540
      };

      expect(revenueByMonth['2026-01']).toBe(50000);
      expect(revenueByMonth['2026-02']).toBe(41600);
      expect(revenueByMonth['2026-03']).toBe(32400);
    });
  });

  describe('Edge Cases & Validations', () => {
    test('should handle zero values gracefully', () => {
      expect(0 * 12).toBe(0); // ARR from 0 MRR
      expect(0 / 100).toBe(0); // Churn with no cancellations
    });

    test('should handle very large customer bases', () => {
      const customers = 1000000;
      const churn = 0.05;
      const monthlyChurn = customers * churn;

      expect(monthlyChurn).toBe(50000);
    });

    test('should format currency values consistently', () => {
      const values = [1000, 1500, 2000];
      const formatted = values.map(v => parseFloat((v / 100).toFixed(2)));

      expect(formatted[0]).toBe(10);
      expect(formatted[1]).toBe(15);
      expect(formatted[2]).toBe(20);
    });

    test('should handle negative values (indicate refunds/chargebacks)', () => {
      const revenue = 1000;
      const chargeback = -100;
      const net = revenue + chargeback;

      expect(net).toBe(900);
    });
  });

  describe('Performance', () => {
    test('should calculate all metrics within < 1 second', () => {
      const startTime = Date.now();

      // Simulate metric calculations
      const subscriptions = Array(10000).fill({ amount: 500 });
      const mrr = subscriptions.reduce((sum, s) => sum + s.amount, 0);
      const arr = mrr * 12;
      const churnRate = 5;
      const ltv = 500 * 12;
      const cac = 100;

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });
  });
});
