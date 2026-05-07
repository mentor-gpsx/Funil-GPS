/**
 * api/billing.js — Automatic Billing System API
 * Handles subscriptions, charges, webhooks, and payment processing
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ============================================
// ENDPOINTS
// ============================================

/**
 * POST /api/subscriptions
 * Create new subscription with payment method
 */
async function createSubscription(req, res) {
  try {
    const { customer_id, plan_id, payment_method } = req.body;

    if (!customer_id || !plan_id || !payment_method) {
      return res.status(400).json({
        error: 'Missing required fields: customer_id, plan_id, payment_method'
      });
    }

    if (!['pix', 'boleto', 'cc'].includes(payment_method)) {
      return res.status(400).json({
        error: 'Invalid payment_method. Must be pix, boleto, or cc'
      });
    }

    // Get plan to calculate next charge date
    const { data: plan } = await supabase
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Calculate next charge date (30 days from now)
    const nextChargeDate = new Date();
    nextChargeDate.setDate(nextChargeDate.getDate() + 30);

    // Create subscription
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        customer_id,
        plan_id,
        status: 'active',
        next_charge_date: nextChargeDate.toISOString().split('T')[0],
        current_period_start: new Date().toISOString(),
        current_period_end: nextChargeDate.toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update customer payment method
    await supabase
      .from('customers')
      .update({ payment_method })
      .eq('id', customer_id);

    res.status(201).json(subscription);
  } catch (err) {
    console.error('Error creating subscription:', err.message);
    res.status(500).json({
      error: 'Failed to create subscription',
      message: err.message
    });
  }
}

/**
 * GET /api/subscriptions
 * List all active subscriptions with plan details
 */
async function listSubscriptions(req, res) {
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select(`
        *,
        customer:customers(name, email, payment_method),
        plan:plans(name, amount_cents)
      `)
      .eq('status', 'active')
      .order('next_charge_date', { ascending: true });

    if (error) throw error;

    res.json(subscriptions);
  } catch (err) {
    console.error('Error listing subscriptions:', err.message);
    res.status(500).json({
      error: 'Failed to list subscriptions',
      message: err.message
    });
  }
}

/**
 * POST /api/subscriptions/:id/authorize-pix
 * Authorize PIX Automático (one-time authorization)
 */
async function authorizePix(req, res) {
  try {
    const { id } = req.params;

    // Get subscription and customer
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('customer_id')
      .eq('id', id)
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Mark customer as PIX authorized
    const { error } = await supabase
      .from('customers')
      .update({
        pix_authorized: true,
        payment_method: 'pix'
      })
      .eq('id', subscription.customer_id);

    if (error) throw error;

    res.json({ success: true, message: 'PIX authorization granted' });
  } catch (err) {
    console.error('Error authorizing PIX:', err.message);
    res.status(500).json({
      error: 'Failed to authorize PIX',
      message: err.message
    });
  }
}

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel subscription and revoke authorizations
 */
async function cancelSubscription(req, res) {
  try {
    const { id } = req.params;

    // Update subscription status
    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString()
      })
      .eq('id', id);

    if (subError) throw subError;

    // Get customer to revoke PIX auth
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('customer_id')
      .eq('id', id)
      .single();

    if (subscription) {
      await supabase
        .from('customers')
        .update({ pix_authorized: false })
        .eq('id', subscription.customer_id);
    }

    res.json({ success: true, message: 'Subscription canceled' });
  } catch (err) {
    console.error('Error canceling subscription:', err.message);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      message: err.message
    });
  }
}

/**
 * Validate Stripe webhook signature
 * Stripe signs each webhook with HMAC SHA256 using the webhook secret
 */
function verifyStripeSignature(req) {
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return false;
  }

  try {
    const timestamp = signature.split(',')[0].split('=')[1];
    const providedSignature = signature.split(',')[1].split('=')[1];

    const signedContent = `${timestamp}.${JSON.stringify(req.body)}`;
    const hash = crypto
      .createHmac('sha256', secret)
      .update(signedContent)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(providedSignature)
    );
  } catch (err) {
    console.error('Signature validation error:', err.message);
    return false;
  }
}

/**
 * POST /api/webhooks/stripe
 * Receive and process Stripe webhook events
 */
async function handleStripeWebhook(req, res) {
  try {
    // Validate webhook signature
    if (!verifyStripeSignature(req)) {
      return res.status(401).json({
        error: 'Invalid webhook signature'
      });
    }

    const event = req.body;

    // Store webhook for audit
    const { error: webhookError } = await supabase
      .from('webhooks')
      .insert({
        event: event.type,
        charge_id: event.data?.object?.id,
        payload: event,
        received_at: new Date().toISOString()
      });

    if (webhookError) {
      console.error('Webhook storage error:', webhookError.message);
    }

    // Process event
    if (event.type === 'charge.paid') {
      await handleChargePaid(event);
    } else if (event.type === 'charge.failed') {
      await handleChargeFailed(event);
    } else if (event.type === 'charge.refunded') {
      await handleChargeRefunded(event);
    }

    // Mark webhook as processed
    if (webhookError === null) {
      await supabase
        .from('webhooks')
        .update({ processed_at: new Date().toISOString() })
        .eq('event', event.type)
        .eq('received_at', event.created);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: err.message
    });
  }
}

/**
 * Handle charge.paid event
 */
async function handleChargePaid(event) {
  const chargeData = event.data.object;

  // Update charge status
  const { data: charge } = await supabase
    .from('charges')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      failed_count: 0
    })
    .eq('gateway_charge_id', chargeData.id)
    .select('subscription_id')
    .single();

  if (!charge) return;

  // Get subscription to schedule next charge
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_id, current_period_end')
    .eq('id', charge.subscription_id)
    .single();

  if (subscription) {
    // Schedule next charge (30 days from current_period_end)
    const nextChargeDate = new Date(subscription.current_period_end);
    nextChargeDate.setDate(nextChargeDate.getDate() + 30);

    await supabase
      .from('subscriptions')
      .update({
        next_charge_date: nextChargeDate.toISOString().split('T')[0],
        current_period_start: new Date().toISOString(),
        current_period_end: nextChargeDate.toISOString()
      })
      .eq('id', charge.subscription_id);
  }
}

/**
 * Handle charge.failed event
 */
async function handleChargeFailed(event) {
  const chargeData = event.data.object;

  // Get existing charge
  const { data: charge } = await supabase
    .from('charges')
    .select('subscription_id, failed_count')
    .eq('gateway_charge_id', chargeData.id)
    .single();

  if (!charge) return;

  const newFailedCount = (charge.failed_count || 0) + 1;
  const nextRetryAt = new Date();
  nextRetryAt.setDate(nextRetryAt.getDate() + 7);

  // Update charge with retry info
  await supabase
    .from('charges')
    .update({
      status: 'failed',
      failed_count: newFailedCount,
      next_retry_at: nextRetryAt.toISOString()
    })
    .eq('gateway_charge_id', chargeData.id);

  // If 3 failures, suspend subscription
  if (newFailedCount >= 3) {
    await supabase
      .from('subscriptions')
      .update({ status: 'suspended' })
      .eq('id', charge.subscription_id);
  }
}

/**
 * Handle charge.refunded event
 */
async function handleChargeRefunded(event) {
  const chargeData = event.data.object;

  await supabase
    .from('charges')
    .update({
      status: 'refunded',
      paid_at: null
    })
    .eq('gateway_charge_id', chargeData.id);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  createSubscription,
  listSubscriptions,
  authorizePix,
  cancelSubscription,
  handleStripeWebhook
};
