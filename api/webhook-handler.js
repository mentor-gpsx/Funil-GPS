/**
 * Webhook Handler - Recebe dados da Cakto em tempo real
 */

class WebhookHandler {
  constructor(database) {
    this.db = database;
  }

  async handleCaktoWebhook(payload) {
    console.log('[Webhook] 📡 Recebido webhook da Cakto');

    try {
      // Processar vendas/cobranças
      if (payload.sales || payload.charges) {
        const charges = payload.sales || payload.charges;
        this.importCharges(charges);
      }

      // Processar clientes
      if (payload.customers) {
        this.importCustomers(payload.customers);
      }

      // Processar assinaturas
      if (payload.subscriptions) {
        this.importSubscriptions(payload.subscriptions);
      }

      console.log('[Webhook] ✅ Dados importados com sucesso');
      return { success: true, message: 'Webhook processado' };
    } catch (error) {
      console.error('[Webhook] ❌ Erro ao processar webhook:', error.message);
      return { success: false, error: error.message };
    }
  }

  importCharges(charges) {
    charges.forEach(charge => {
      this.db.run(
        `INSERT OR REPLACE INTO charges 
         (id, customer_id, customer_name, amount, status, payment_method, reference, due_date, paid_date, created_at, source) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          charge.id,
          charge.customer_id || charge.customer,
          charge.customer_name || `Cliente ${charge.customer_id}`,
          parseFloat(charge.total || charge.amount || 0),
          (charge.status || 'pending').toLowerCase(),
          charge.payment_method || 'desconhecido',
          charge.id,
          charge.due_date,
          charge.paid_date,
          charge.created_at || new Date().toISOString(),
          'cakto_webhook'
        ]
      );
    });
  }

  importCustomers(customers) {
    customers.forEach(customer => {
      this.db.run(
        `INSERT OR REPLACE INTO customers (id, name, email, phone, created_at, source) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          customer.id,
          customer.name || customer.company_name,
          customer.email || '',
          customer.phone || '',
          customer.created_at || new Date().toISOString(),
          'cakto_webhook'
        ]
      );
    });
  }

  importSubscriptions(subscriptions) {
    subscriptions.forEach(sub => {
      this.db.run(
        `INSERT OR REPLACE INTO subscriptions (id, customer_id, amount, status, plan, next_charge_date, created_at, source) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sub.id,
          sub.customer_id || sub.customer,
          parseFloat(sub.amount || 0),
          (sub.status || 'active').toLowerCase(),
          sub.plan || 'standard',
          sub.next_charge_date,
          sub.created_at || new Date().toISOString(),
          'cakto_webhook'
        ]
      );
    });
  }
}

module.exports = { WebhookHandler };
