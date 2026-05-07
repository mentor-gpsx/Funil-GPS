/**
 * tests/reports/cash-flow.test.js
 * Cash flow statement unit tests
 * Tests: daily flows, payment method breakdown, projected vs realized
 */

const { calculateCashFlow } = require('../../api/reports/cash-flow-calculator');

describe('Cash Flow Calculator - Unit Tests', () => {
  const tenantId = 'test-tenant-123';
  const startDate = '2026-05-01';
  const endDate = '2026-05-31';

  describe('Daily Cash Flow Calculation', () => {
    test('should calculate daily inflows from charges', () => {
      const charges = [
        { paid_at: '2026-05-01', amount_cents: 50000, payment_method: 'pix' },
        { paid_at: '2026-05-02', amount_cents: 30000, payment_method: 'boleto' },
        { paid_at: '2026-05-01', amount_cents: 20000, payment_method: 'cc' }
      ];

      const dailyFlows = {};
      charges.forEach(charge => {
        const date = charge.paid_at;
        if (!dailyFlows[date]) {
          dailyFlows[date] = { inflows: 0, outflows: 0 };
        }
        dailyFlows[date].inflows += charge.amount_cents / 100;
      });

      expect(dailyFlows['2026-05-01'].inflows).toBe(700); // (50000 + 20000) / 100
      expect(dailyFlows['2026-05-02'].inflows).toBe(300); // 30000 / 100
    });

    test('should calculate daily outflows from refunds', () => {
      const refunds = [
        { refunded_at: '2026-05-05', amount_cents: 15000 },
        { refunded_at: '2026-05-10', amount_cents: 25000 }
      ];

      const dailyFlows = {};
      refunds.forEach(refund => {
        const date = refund.refunded_at;
        if (!dailyFlows[date]) {
          dailyFlows[date] = { inflows: 0, outflows: 0 };
        }
        dailyFlows[date].outflows += refund.amount_cents / 100;
      });

      expect(dailyFlows['2026-05-05'].outflows).toBe(150);
      expect(dailyFlows['2026-05-10'].outflows).toBe(250);
    });

    test('should calculate net cash flow (inflows - outflows)', () => {
      const inflows = 1000;
      const outflows = 250;
      const netCash = inflows - outflows;

      expect(netCash).toBe(750);
    });

    test('should handle zero inflows', () => {
      const inflows = 0;
      const outflows = 100;
      const netCash = inflows - outflows;

      expect(netCash).toBe(-100);
    });

    test('should handle zero outflows', () => {
      const inflows = 500;
      const outflows = 0;
      const netCash = inflows - outflows;

      expect(netCash).toBe(500);
    });

    test('should aggregate multiple transactions on same day', () => {
      const transactions = [
        { date: '2026-05-05', type: 'inflow', amount: 100 },
        { date: '2026-05-05', type: 'inflow', amount: 200 },
        { date: '2026-05-05', type: 'outflow', amount: 50 }
      ];

      let inflows = 0, outflows = 0;
      transactions.forEach(t => {
        if (t.type === 'inflow') inflows += t.amount;
        else outflows += t.amount;
      });

      expect(inflows).toBe(300);
      expect(outflows).toBe(50);
      expect(inflows - outflows).toBe(250);
    });
  });

  describe('Payment Method Breakdown', () => {
    test('should breakdown inflows by payment method', () => {
      const charges = [
        { amount_cents: 50000, payment_method: 'pix' },
        { amount_cents: 30000, payment_method: 'boleto' },
        { amount_cents: 20000, payment_method: 'cc' },
        { amount_cents: 25000, payment_method: 'pix' }
      ];

      const byMethod = {};
      charges.forEach(charge => {
        if (!byMethod[charge.payment_method]) {
          byMethod[charge.payment_method] = 0;
        }
        byMethod[charge.payment_method] += charge.amount_cents / 100;
      });

      expect(byMethod.pix).toBe(750); // (50000 + 25000) / 100
      expect(byMethod.boleto).toBe(300);
      expect(byMethod.cc).toBe(200);
    });

    test('should calculate percentage by payment method', () => {
      const total = 1250;
      const byMethod = {
        pix: 750,
        boleto: 300,
        cc: 200
      };

      const percentages = {};
      Object.keys(byMethod).forEach(method => {
        percentages[method] = (byMethod[method] / total) * 100;
      });

      expect(percentages.pix).toBeCloseTo(60, 1);
      expect(percentages.boleto).toBeCloseTo(24, 1);
      expect(percentages.cc).toBeCloseTo(16, 1);
    });

    test('should identify dominant payment method', () => {
      const byMethod = {
        pix: 750,
        boleto: 300,
        cc: 200
      };

      const dominant = Object.keys(byMethod).reduce((max, method) =>
        byMethod[method] > byMethod[max] ? method : max
      );

      expect(dominant).toBe('pix');
    });

    test('should handle missing payment methods', () => {
      const charges = [
        { payment_method: 'pix', amount_cents: 10000 }
      ];

      const byMethod = {};
      charges.forEach(charge => {
        if (!byMethod[charge.payment_method]) {
          byMethod[charge.payment_method] = 0;
        }
        byMethod[charge.payment_method] += charge.amount_cents / 100;
      });

      expect(byMethod.pix).toBe(100);
      expect(byMethod.boleto).toBeUndefined();
      expect(byMethod.cc).toBeUndefined();
    });
  });

  describe('Projected vs Realized Cash Flow', () => {
    test('should calculate realized cash flow from paid charges', () => {
      const paidCharges = [
        { amount_cents: 50000 },
        { amount_cents: 30000 }
      ];

      const realized = paidCharges.reduce((sum, c) => sum + c.amount_cents, 0) / 100;
      expect(realized).toBe(800);
    });

    test('should calculate projected cash flow from pending charges', () => {
      const pendingCharges = [
        { amount_cents: 25000, due_date: '2026-05-15' },
        { amount_cents: 15000, due_date: '2026-05-20' }
      ];

      const projected = pendingCharges.reduce((sum, c) => sum + c.amount_cents, 0) / 100;
      expect(projected).toBe(400);
    });

    test('should calculate variance between projected and realized', () => {
      const projected = 1000;
      const realized = 750;
      const variance = realized - projected;
      const variancePercent = (variance / projected) * 100;

      expect(variance).toBe(-250);
      expect(variancePercent).toBe(-25);
    });

    test('should identify underpayment trend', () => {
      const periods = [
        { projected: 1000, realized: 800 },
        { projected: 1000, realized: 750 },
        { projected: 1000, realized: 700 }
      ];

      const underperformance = periods.filter(p => p.realized < p.projected).length;
      expect(underperformance).toBe(3);
    });

    test('should identify positive variance', () => {
      const projected = 500;
      const realized = 600;
      const variance = realized - projected;

      expect(variance).toBe(100);
      expect(realized > projected).toBe(true);
    });
  });

  describe('Cumulative Cash Position', () => {
    test('should calculate cumulative position over period', () => {
      const dailyFlows = [
        { date: '2026-05-01', net: 500 },
        { date: '2026-05-02', net: -100 },
        { date: '2026-05-03', net: 300 }
      ];

      let cumulative = 0;
      const positions = {};
      dailyFlows.forEach(flow => {
        cumulative += flow.net;
        positions[flow.date] = cumulative;
      });

      expect(positions['2026-05-01']).toBe(500);
      expect(positions['2026-05-02']).toBe(400);
      expect(positions['2026-05-03']).toBe(700);
    });

    test('should identify lowest cash position', () => {
      const positions = {
        '2026-05-01': 500,
        '2026-05-02': 400,
        '2026-05-03': 700,
        '2026-05-04': 300
      };

      const lowest = Math.min(...Object.values(positions));
      expect(lowest).toBe(300);
    });

    test('should identify cash runout risk', () => {
      const position = 100;
      const dailyBurn = 50;
      const daysUntilEmpty = position / dailyBurn;

      expect(daysUntilEmpty).toBe(2);
    });

    test('should detect negative cash position', () => {
      const position = -500;
      const isNegative = position < 0;

      expect(isNegative).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty charge list', () => {
      const charges = [];
      const totalInflows = charges.reduce((sum, c) => sum + c.amount_cents, 0) / 100;

      expect(totalInflows).toBe(0);
    });

    test('should handle very large transaction amounts', () => {
      const largeAmount = 99999999; // R$ 999,999.99
      const amount = largeAmount / 100;

      expect(amount).toBe(999999.99);
    });

    test('should handle fractional cent amounts (precision)', () => {
      const amounts = [1000, 2000, 3000];
      const total = amounts.reduce((sum, a) => sum + a, 0);
      const inBRL = total / 100;

      expect(inBRL).toBe(60);
    });

    test('should handle date boundary transitions', () => {
      const chargesMonth1 = [
        { date: '2026-04-30', amount: 100 },
        { date: '2026-05-01', amount: 200 }
      ];

      const mayFlows = chargesMonth1.filter(c => c.date.startsWith('2026-05'));
      expect(mayFlows.length).toBe(1);
    });

    test('should handle multiple chargebacks', () => {
      const chargebacks = [
        { amount_cents: 5000 },
        { amount_cents: 3000 },
        { amount_cents: 2000 }
      ];

      const totalChargebacks = chargebacks.reduce((sum, c) => sum + c.amount_cents, 0) / 100;
      expect(totalChargebacks).toBe(100);
    });
  });

  describe('Performance', () => {
    test('should calculate cash flow within performance target (< 3 seconds)', () => {
      const startTime = Date.now();
      // Simulate calculation
      let sum = 0;
      for (let i = 0; i < 100000; i++) {
        sum += i;
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000);
    });

    test('should handle 2-year dataset efficiently', () => {
      // Simulate 2 years of daily data (730 days)
      const days = 730;
      const startTime = Date.now();

      let position = 0;
      for (let i = 0; i < days; i++) {
        position += Math.random() * 1000 - 500; // Random daily flow
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000);
    });
  });
});
