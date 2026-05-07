/**
 * lib/billing-utils.js
 * Utility functions for billing operations: calculations, status, retry logic
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Calculate MRR (Monthly Recurring Revenue)
 * Sum of all active subscription amounts
 */
async function calculateMRR() {
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('status', 'active');

    if (error) throw error;

    let total = 0;
    for (const sub of subscriptions) {
      const { data: plan } = await supabase
        .from('plans')
        .select('amount_cents')
        .eq('id', sub.plan_id)
        .single();

      if (plan) {
        total += plan.amount_cents;
      }
    }

    return total / 100; // Convert cents to currency
  } catch (err) {
    console.error('MRR calculation error:', err.message);
    return 0;
  }
}

/**
 * Calculate 30-day forecast with confidence scores
 * Weights by payment method reliability: PIX=95%, Boleto=60%, CC=40%
 */
async function calculateForecast(days = 30) {
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;

    let forecast = 0;

    for (const sub of subscriptions) {
      const { data: plan } = await supabase
        .from('plans')
        .select('amount_cents')
        .eq('id', sub.plan_id)
        .single();

      if (plan) {
        // Determine confidence multiplier based on payment method
        let confidence = 0.4; // Credit card: 40%
        if (sub.payment_method === 'pix') {
          confidence = 0.95; // PIX: 95%
        } else if (sub.payment_method === 'boleto') {
          confidence = 0.6; // Boleto: 60%
        }

        // Add weighted amount to forecast
        forecast += (plan.amount_cents * confidence) / 100;
      }
    }

    return forecast / 100; // Convert cents to currency
  } catch (err) {
    console.error('Forecast calculation error:', err.message);
    return 0;
  }
}

/**
 * Handle charge retry logic
 * Called when charge.failed webhook is received
 * Returns updated failed_count and next_retry_at
 */
async function handleChargeRetry(chargeId) {
  try {
    const { data: charge, error: getError } = await supabase
      .from('charges')
      .select('*')
      .eq('id', chargeId)
      .single();

    if (getError || !charge) {
      throw new Error('Charge not found');
    }

    const newFailedCount = (charge.failed_count || 0) + 1;
    const nextRetryAt = new Date();
    nextRetryAt.setDate(nextRetryAt.getDate() + 7); // Retry in 7 days

    // Update charge
    const { error: updateError } = await supabase
      .from('charges')
      .update({
        failed_count: newFailedCount,
        next_retry_at: nextRetryAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', chargeId);

    if (updateError) throw updateError;

    // Check if 3 failures reached - suspend subscription
    if (newFailedCount >= 3) {
      const { error: suspendError } = await supabase
        .from('subscriptions')
        .update({
          status: 'suspended',
          updated_at: new Date().toISOString()
        })
        .eq('id', charge.subscription_id);

      if (suspendError) {
        console.error('Subscription suspension error:', suspendError.message);
      }

      // Notify customer of suspension
      await notifyCustomerFailure(charge.customer_id, 'suspended', newFailedCount);
    } else {
      // Notify customer of retry scheduled
      await notifyCustomerFailure(charge.customer_id, 'retry', newFailedCount);
    }

    return {
      failed_count: newFailedCount,
      next_retry_at: nextRetryAt.toISOString(),
      suspended: newFailedCount >= 3
    };
  } catch (err) {
    console.error('Charge retry handling error:', err.message);
    throw err;
  }
}

/**
 * Notify customer of payment failure
 * TODO: Integrate with email/SMS service
 */
async function notifyCustomerFailure(customerId, status, failedCount) {
  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('email, name')
      .eq('id', customerId)
      .single();

    if (!customer) return;

    let subject, message;

    if (status === 'suspended') {
      subject = 'Sua assinatura foi suspensa';
      message = `Sua assinatura foi suspensa após ${failedCount} tentativas de cobrança falhadas. Entre em contato conosco para reativar.`;
    } else {
      subject = 'Tentativa de cobrança falhada';
      message = `Tentativa ${failedCount} de cobrança falhou. Uma nova tentativa será feita em 7 dias.`;
    }

    // TODO: Call email service (SendGrid, Mailgun, etc.)
    console.log(`[NOTIFY] ${customer.email}: ${subject}`, {
      message,
      status,
      failedCount
    });
  } catch (err) {
    console.error('Customer notification error:', err.message);
  }
}

/**
 * Check if subscription can retry
 * Returns true if charge can be retried (next_retry_at <= now)
 */
async function canRetryCharge(chargeId) {
  try {
    const { data: charge } = await supabase
      .from('charges')
      .select('next_retry_at, status')
      .eq('id', chargeId)
      .single();

    if (!charge || charge.status !== 'failed') {
      return false;
    }

    const nextRetry = new Date(charge.next_retry_at);
    const now = new Date();

    return nextRetry <= now;
  } catch (err) {
    console.error('Charge retry check error:', err.message);
    return false;
  }
}

/**
 * Determine subscription status from charge history
 */async function determineSubscriptionStatus(subscriptionId) {
  try {
    const { data: charges } = await supabase
      .from('charges')
      .select('status, failed_count')
      .eq('subscription_id', subscriptionId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!charges || charges.length === 0) {
      return 'active';
    }

    const lastCharge = charges[0];

    if (lastCharge.status === 'paid') {
      return 'active';
    } else if (lastCharge.failed_count >= 3) {
      return 'suspended';
    } else if (lastCharge.status === 'failed') {
      return 'past_due';
    }

    return 'active';
  } catch (err) {
    console.error('Status determination error:', err.message);
    return 'active';
  }
}

module.exports = {
  calculateMRR,
  calculateForecast,
  handleChargeRetry,
  notifyCustomerFailure,
  canRetryCharge,
  determineSubscriptionStatus
};
