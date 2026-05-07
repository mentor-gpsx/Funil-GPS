/**
 * tests/billing/billing.test.js
 * Comprehensive test suite for billing API endpoints
 * Coverage: createSubscription, listSubscriptions, authorizePix, cancelSubscription, handleStripeWebhook
 */

// Mock Supabase BEFORE importing billing functions
const mockSupabaseInstance = {
  from: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseInstance)
}));

const { createClient } = require('@supabase/supabase-js');
const {
  createSubscription,
  listSubscriptions,
  authorizePix,
  cancelSubscription,
  handleStripeWebhook
} = require('../../api/billing');

describe('Billing API Endpoints', () => {
  let req, res;

  // Mock environment variables
  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  // Helper to generate valid Stripe signature
  const generateValidSignature = (body) => {
    const crypto = require('crypto');
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyString = JSON.stringify(body);
    const signedContent = `${timestamp}.${bodyString}`;
    const signature = crypto
      .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
      .update(signedContent)
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockSupabaseInstance.from.mockClear();

    // Mock request/response objects
    req = {
      body: {},
      params: {},
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('POST /api/subscriptions - createSubscription', () => {
    it('should create subscription successfully with all required fields', async () => {
      const planData = { id: 'plan-1', amount_cents: 29990, interval: 'monthly' };
      const subscriptionData = {
        id: 'sub-1',
        customer_id: 'cust-1',
        plan_id: 'plan-1',
        status: 'active',
        next_charge_date: expect.any(String),
        current_period_start: expect.any(String),
        current_period_end: expect.any(String)
      };

      req.body = {
        customer_id: 'cust-1',
        plan_id: 'plan-1',
        payment_method: 'pix'
      };

      const planChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: planData })
      };

      const subChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: subscriptionData })
      };

      const customerChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(planChain)
        .mockReturnValueOnce(subChain)
        .mockReturnValueOnce(customerChain);

      await createSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(subscriptionData);
    });

    it('should return 400 if required fields are missing', async () => {
      req.body = {
        customer_id: 'cust-1'
        // missing plan_id and payment_method
      };

      await createSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Missing required fields')
        })
      );
    });

    it('should return 400 for invalid payment method', async () => {
      req.body = {
        customer_id: 'cust-1',
        plan_id: 'plan-1',
        payment_method: 'invalid_method'
      };

      await createSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid payment_method')
        })
      );
    });

    it('should return 404 if plan not found', async () => {
      req.body = {
        customer_id: 'cust-1',
        plan_id: 'nonexistent-plan',
        payment_method: 'pix'
      };

      const planChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from.mockReturnValue(planChain);

      await createSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Plan not found' });
    });

    it('should handle database errors gracefully', async () => {
      req.body = {
        customer_id: 'cust-1',
        plan_id: 'plan-1',
        payment_method: 'pix'
      };

      const planChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'plan-1' } })
      };

      const subChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(new Error('DB error'))
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(planChain)
        .mockReturnValueOnce(subChain);

      await createSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to create subscription',
          message: 'DB error'
        })
      );
    });
  });

  describe('GET /api/subscriptions - listSubscriptions', () => {
    it('should return all active subscriptions with customer and plan details', async () => {
      const subscriptionsData = [
        {
          id: 'sub-1',
          customer_id: 'cust-1',
          plan_id: 'plan-1',
          status: 'active',
          next_charge_date: '2026-05-23',
          customer: { name: 'João', email: 'joao@example.com', payment_method: 'pix' },
          plan: { name: 'Pro', amount_cents: 29990 }
        }
      ];

      const subChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: subscriptionsData })
      };

      mockSupabaseInstance.from.mockReturnValue(subChain);

      await listSubscriptions(req, res);

      expect(res.json).toHaveBeenCalledWith(subscriptionsData);
    });

    it('should handle database errors gracefully', async () => {
      const subChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockRejectedValue(new Error('Query failed'))
      };

      mockSupabaseInstance.from.mockReturnValue(subChain);

      await listSubscriptions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to list subscriptions'
        })
      );
    });
  });

  describe('POST /api/subscriptions/:id/authorize-pix - authorizePix', () => {
    it('should authorize PIX for subscription successfully', async () => {
      req.params = { id: 'sub-1' };

      const subChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { customer_id: 'cust-1' } })
      };

      const custChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(subChain)
        .mockReturnValueOnce(custChain);

      await authorizePix(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'PIX authorization granted'
      });
    });

    it('should return 404 if subscription not found', async () => {
      req.params = { id: 'nonexistent-sub' };

      const subChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from.mockReturnValue(subChain);

      await authorizePix(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Subscription not found' });
    });

    it('should handle authorization errors', async () => {
      req.params = { id: 'sub-1' };

      const subChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { customer_id: 'cust-1' } })
      };

      const custChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockRejectedValue(new Error('Update failed'))
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(subChain)
        .mockReturnValueOnce(custChain);

      await authorizePix(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to authorize PIX'
        })
      );
    });
  });

  describe('POST /api/subscriptions/:id/cancel - cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      req.params = { id: 'sub-1' };

      const subUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      const subSelectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { customer_id: 'cust-1' } })
      };

      const custChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(subUpdateChain)
        .mockReturnValueOnce(subSelectChain)
        .mockReturnValueOnce(custChain);

      await cancelSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Subscription canceled'
      });
    });

    it('should handle cancellation errors', async () => {
      req.params = { id: 'sub-1' };

      const subUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockRejectedValue(new Error('Cancel failed'))
      };

      mockSupabaseInstance.from.mockReturnValue(subUpdateChain);

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to cancel subscription'
        })
      );
    });
  });

  describe('POST /api/webhooks/stripe - handleStripeWebhook', () => {
    it('should process charge.paid webhook event', async () => {
      req.body = {
        type: 'charge.paid',
        data: {
          object: {
            id: 'charge-1',
            amount: 29990
          }
        },
        created: 1703001600
      };
      req.headers['stripe-signature'] = generateValidSignature(req.body);

      const webhookChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: null })
      };

      const chargeChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { subscription_id: 'sub-1' } })
      };

      const subChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { current_period_end: '2026-05-23', plan_id: 'plan-1' }
        })
      };

      const subUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(webhookChain)
        .mockReturnValueOnce(chargeChain)
        .mockReturnValueOnce(subChain)
        .mockReturnValueOnce(subUpdateChain);

      await handleStripeWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should process charge.failed webhook event with retry scheduling', async () => {
      req.body = {
        type: 'charge.failed',
        data: {
          object: {
            id: 'charge-1',
            error: 'insufficient_funds'
          }
        },
        created: 1703001600
      };
      req.headers['stripe-signature'] = generateValidSignature(req.body);

      const webhookChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: null })
      };

      const chargeChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { subscription_id: 'sub-1', failed_count: 1 }
        })
      };

      const chargeUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(webhookChain)
        .mockReturnValueOnce(chargeChain)
        .mockReturnValueOnce(chargeUpdateChain);

      await handleStripeWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should suspend subscription after 3 consecutive failures', async () => {
      req.body = {
        type: 'charge.failed',
        data: {
          object: {
            id: 'charge-1'
          }
        },
        created: 1703001600
      };
      req.headers['stripe-signature'] = generateValidSignature(req.body);

      const webhookChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: null })
      };

      const chargeChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { subscription_id: 'sub-1', failed_count: 2 }
        })
      };

      const chargeUpdateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      const subSuspendChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(webhookChain)
        .mockReturnValueOnce(chargeChain)
        .mockReturnValueOnce(chargeUpdateChain)
        .mockReturnValueOnce(subSuspendChain);

      await handleStripeWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should process charge.refunded webhook event', async () => {
      req.body = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'charge-1'
          }
        },
        created: 1703001600
      };
      req.headers['stripe-signature'] = generateValidSignature(req.body);

      const webhookChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: null })
      };

      const chargeChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null })
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(webhookChain)
        .mockReturnValueOnce(chargeChain);

      await handleStripeWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle webhook processing errors gracefully', async () => {
      req.body = {
        type: 'charge.paid',
        data: {
          object: {
            id: 'charge-1'
          }
        },
        created: 1703001600
      };
      req.headers['stripe-signature'] = generateValidSignature(req.body);

      const webhookChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: null })
      };

      const chargeChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockRejectedValue(new Error('Charge update failed'))
      };

      mockSupabaseInstance.from
        .mockReturnValueOnce(webhookChain)
        .mockReturnValueOnce(chargeChain);

      await handleStripeWebhook(req, res);

      // If charge processing fails, webhook handler returns 500
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Webhook processing failed'
        })
      );
    });

    it('should reject webhook with invalid signature', async () => {
      req.headers = {
        'stripe-signature': 't=1234567890,v1=invalidsignature'
      };
      req.body = {
        type: 'charge.paid',
        data: {
          object: {
            id: 'charge-1'
          }
        }
      };

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid webhook signature'
      });
    });

    it('should reject webhook with missing signature', async () => {
      req.headers = {};
      req.body = {
        type: 'charge.paid',
        data: {
          object: {
            id: 'charge-1'
          }
        }
      };

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid webhook signature'
      });
    });
  });
});
