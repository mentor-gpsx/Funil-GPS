/**
 * workers/charge-orchestrator.js
 * Daily charge orchestration job that processes subscriptions due for payment
 * Runs daily at 00:05 UTC-3 (03:05 UTC)
 *
 * Features:
 * - Finds all active subscriptions with next_charge_date = today
 * - Creates charge records for each subscription
 * - Initiates Stripe payment processing
 * - Logs success/failure for monitoring
 * - Notifies admin on critical failures
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Create a charge for a subscription
 * Returns charge ID or null on failure
 */
async function createCharge(subscription, plan) {
  try {
    const { data: charge, error } = await supabase
      .from('charges')
      .insert({
        subscription_id: subscription.id,
        customer_id: subscription.customer_id,
        amount_cents: plan.amount_cents,
        status: 'pending',
        payment_method: subscription.payment_method,
        due_date: getTodayDate(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error(`[CHARGE_CREATE] Failed for subscription ${subscription.id}:`, error.message);
      return null;
    }

    console.log(`[CHARGE_CREATE] Created charge ${charge.id} for subscription ${subscription.id}`);
    return charge;
  } catch (err) {
    console.error(`[CHARGE_CREATE] Exception for subscription ${subscription.id}:`, err.message);
    return null;
  }
}

/**
 * Process payment via Stripe
 * In production, this would call Stripe API
 * For MVP, we log the intent and return a mock gateway charge ID
 */
async function processStripePayment(charge, customer) {
  try {
    // TODO: Implement actual Stripe API call
    // For now, generate a mock charge ID and log the intent
    const gatewayChargeId = `ch_${Date.now()}`;

    console.log(`[STRIPE_PAYMENT] Processing charge ${charge.id} for customer ${customer.email}`, {
      amount_cents: charge.amount_cents,
      payment_method: charge.payment_method,
      customer_email: customer.email
    });

    // Update charge with gateway charge ID
    await supabase
      .from('charges')
      .update({ gateway_charge_id: gatewayChargeId })
      .eq('id', charge.id);

    return true;
  } catch (err) {
    console.error(`[STRIPE_PAYMENT] Failed for charge ${charge.id}:`, err.message);
    return false;
  }
}

/**
 * Process a single subscription due for payment
 */
async function processSubscription(subscription) {
  try {
    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', subscription.plan_id)
      .single();

    if (planError || !plan) {
      console.error(`[ORCHESTRATE] Plan not found for subscription ${subscription.id}`);
      return false;
    }

    // Get customer details
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', subscription.customer_id)
      .single();

    if (custError || !customer) {
      console.error(`[ORCHESTRATE] Customer not found for subscription ${subscription.id}`);
      return false;
    }

    // Create charge
    const charge = await createCharge(subscription, plan);
    if (!charge) {
      return false;
    }

    // Process payment
    const paymentSuccess = await processStripePayment(charge, customer);

    return paymentSuccess;
  } catch (err) {
    console.error(`[ORCHESTRATE] Exception processing subscription ${subscription.id}:`, err.message);
    return false;
  }
}

/**
 * Main orchestration function
 * Runs daily to process all subscriptions due for payment
 */
async function runChargeOrchestrator() {
  const startTime = Date.now();
  console.log(`[ORCHESTRATE] Starting charge orchestration at ${new Date().toISOString()}`);

  try {
    const today = getTodayDate();

    // Find all active subscriptions with next_charge_date = today
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'active')
      .eq('next_charge_date', today);

    if (error) {
      console.error('[ORCHESTRATE] Failed to query subscriptions:', error.message);
      return {
        success: false,
        error: error.message,
        stats: { total: 0, success: 0, failed: 0 }
      };
    }

    console.log(`[ORCHESTRATE] Found ${subscriptions.length} subscriptions due for charge today`);

    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    // Process each subscription
    for (const subscription of subscriptions) {
      const processResult = await processSubscription(subscription);

      if (processResult) {
        successCount++;
      } else {
        failureCount++;
        failures.push({
          subscription_id: subscription.id,
          customer_id: subscription.customer_id
        });
      }
    }

    const duration = Date.now() - startTime;
    const result = {
      success: failureCount === 0,
      stats: {
        total: subscriptions.length,
        success: successCount,
        failed: failureCount,
        duration_ms: duration
      },
      failures: failures
    };

    console.log(`[ORCHESTRATE] Completed in ${duration}ms`, result.stats);

    // Alert admin if there are failures
    if (failureCount > 0) {
      console.error(`[ALERT] ${failureCount} subscriptions failed charge processing`, failures);
    }

    return result;
  } catch (err) {
    console.error('[ORCHESTRATE] Fatal error:', err.message);
    return {
      success: false,
      error: err.message,
      stats: { total: 0, success: 0, failed: 0 }
    };
  }
}

// Export for testing and scheduling
module.exports = {
  runChargeOrchestrator,
  getTodayDate,
  processSubscription,
  createCharge,
  processStripePayment
};

// If run directly (e.g., via cron), execute immediately
if (require.main === module) {
  runChargeOrchestrator().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}
