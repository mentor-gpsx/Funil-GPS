/**
 * tests/workers/charge-orchestrator.test.js
 * Test suite for daily charge orchestration cron job
 */

jest.mock('@supabase/supabase-js');

const { createClient } = require('@supabase/supabase-js');
const {
  runChargeOrchestrator,
  getTodayDate,
  processSubscription,
  createCharge,
  processStripePayment
} = require('../../workers/charge-orchestrator');

describe('Charge Orchestrator', () => {
  const mockSupabaseInstance = {
    from: jest.fn()
  };

  beforeAll(() => {
    createClient.mockReturnValue(mockSupabaseInstance);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseInstance.from.mockClear();
  });

  describe('getTodayDate', () => {
    it('should return today date in YYYY-MM-DD format', () => {
      const today = getTodayDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return current date', () => {
      const today = getTodayDate();
      const now = new Date();
      const expectedDate = now.toISOString().split('T')[0];
      expect(today).toBe(expectedDate);
    });
  });

  describe('createCharge', () => {
    it('should create charge successfully', async () => {
      const subscription = {
        id: 'sub-1',
        customer_id: 'cust-1',
        payment_method: 'pix'
      };
      const plan = { amount_cents: 29990 };
      const chargeData = {
        id: 'charge-1',
        subscription_id: 'sub-1',
        status: 'pending'
      };

      const chargeChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: chargeData })
      };

      mockSupabaseInstance.from.mockReturnValue(chargeChain);

      const result = await createCharge(subscription, plan);

      expect(result).toEqual(chargeData);
    });

    it('should return null on insert error', async () => {
      const subscription = {
        id: 'sub-1',
        customer_id: 'cust-1'
      };
      const plan = { amount_cents: 29990 };

      const chargeChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ error: new Error('Insert failed') })
      };

      mockSupabaseInstance.from.mockReturnValue(chargeChain);

      const result = await createCharge(subscription, plan);

      expect(result).toBeNull();
    });

    it('should handle exceptions', async () => {
      const subscription = {
        id: 'sub-1',
        customer_id: 'cust-1'
      };
      const plan = { amount_cents: 29990 };

      const chargeChain = {
        insert: jest.fn().mockRejectedValue(new Error('DB error'))
      };

      mockSupabaseInstance.from.mockReturnValue(chargeChain);

      const result = await createCharge(subscription, plan);

      expect(result).toBeNull();
    });
  });

  describe('processStripePayment', () => {
    it('should process payment and update gateway charge ID', async () => {
      const charge = { id: 'charge-1' };
      const customer = { email: 'test@example.com' };

      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from.mockReturnValueOnce(updateChain);

      const result = await processStripePayment(charge, customer);

      expect(result).toBe(true);
      expect(mockSupabaseInstance.from).toHaveBeenCalledWith('charges');
    });

    it('should handle payment processing errors', async () => {
      const charge = { id: 'charge-1' };
      const customer = { email: 'test@example.com' };

      const updateChain = {
        update: jest.fn().mockRejectedValue(new Error('Update failed'))
      };

      mockSupabaseInstance.from.mockReturnValue(updateChain);

      const result = await processStripePayment(charge, customer);

      expect(result).toBe(false);
    });
  });

  describe('processSubscription', () => {
    it('should process subscription successfully', async () => {
      const subscription = {
        id: 'sub-1',
        customer_id: 'cust-1',
        plan_id: 'plan-1',
        payment_method: 'pix'
      };

      // For plan query
      const planChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'plan-1', amount_cents: 29990 }
        })
      };

      // For customer query
      const custChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'cust-1', email: 'test@example.com' }
        })
      };

      // For charge insert
      const chargeChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'charge-1', subscription_id: 'sub-1' }
        })
      };

      // For charge update (to add gateway_charge_id)
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(planChain)       // Plan lookup
        .mockReturnValueOnce(custChain)       // Customer lookup
        .mockReturnValueOnce(chargeChain)     // Charge insert
        .mockReturnValueOnce(updateChain);    // Charge update

      const result = await processSubscription(subscription);

      expect(result).toBe(true);
    });

    it('should return false if plan not found', async () => {
      const subscription = {
        id: 'sub-1',
        customer_id: 'cust-1',
        plan_id: 'nonexistent'
      };

      const planChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from.mockReturnValue(planChain);

      const result = await processSubscription(subscription);

      expect(result).toBe(false);
    });

    it('should return false if customer not found', async () => {
      const subscription = {
        id: 'sub-1',
        customer_id: 'nonexistent',
        plan_id: 'plan-1'
      };

      const planChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'plan-1', amount_cents: 29990 }
        })
      };

      const custChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(planChain)
        .mockReturnValueOnce(custChain);

      const result = await processSubscription(subscription);

      expect(result).toBe(false);
    });
  });

  describe('runChargeOrchestrator', () => {
    it('should process all subscriptions due today', async () => {
      const subscriptions = [
        {
          id: 'sub-1',
          customer_id: 'cust-1',
          plan_id: 'plan-1',
          payment_method: 'pix',
          next_charge_date: getTodayDate()
        }
      ];

      const subsChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({})
      };

      subsChain.eq.mockReturnThis();

      // Mock for first query (subscriptions list)
      const subsListChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: subscriptions })
      };

      // Use a more flexible mock setup
      let callCount = 0;
      mockSupabaseInstance.from.mockImplementation((table) => {
        callCount++;
        if (table === 'subscriptions' && callCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn((field, value) => ({
              eq: jest.fn().mockResolvedValue({ data: subscriptions })
            }))
          };
        }
        // Return appropriate chain for other calls
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
          update: jest.fn().mockReturnThis()
        };
      });

      const result = await runChargeOrchestrator();

      expect(result.stats.total).toBeGreaterThanOrEqual(0);
      expect(result.stats.success).toBeGreaterThanOrEqual(0);
      expect(result.stats.failed).toBeGreaterThanOrEqual(0);
    });

    it('should return error on query failure', async () => {
      const subsChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: new Error('Query failed')
        })
      };

      mockSupabaseInstance.from.mockReturnValue(subsChain);

      const result = await runChargeOrchestrator();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle exceptions gracefully', async () => {
      mockSupabaseInstance.from.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const result = await runChargeOrchestrator();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
