/**
 * Import Handler - Importar dados Cakto via JSON/CSV
 * Permite coleta manual de dados da Cakto e persistência em SQLite
 */

const fs = require('fs');
const path = require('path');

class ImportHandler {
  constructor(db) {
    this.db = db;
  }

  /**
   * Importar clientes em bulk
   */
  async importCustomers(customers) {
    if (!Array.isArray(customers)) {
      throw new Error('Clientes deve ser um array');
    }

    const inserted = [];
    const errors = [];

    for (const customer of customers) {
      try {
        this.validateCustomer(customer);

        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO customers (id, name, email, phone, created_at, source)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          customer.id,
          customer.name,
          customer.email || '',
          customer.phone || '',
          customer.created_at || new Date().toISOString(),
          'import_manual'
        );

        inserted.push(customer.id);
      } catch (error) {
        errors.push({ customerId: customer.id, error: error.message });
      }
    }

    return { inserted: inserted.length, errors, total: customers.length };
  }

  /**
   * Importar cobranças em bulk
   */
  async importCharges(charges) {
    if (!Array.isArray(charges)) {
      throw new Error('Cobranças deve ser um array');
    }

    const inserted = [];
    const errors = [];

    for (const charge of charges) {
      try {
        this.validateCharge(charge);

        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO charges (
            id, customer_id, amount, status, payment_method,
            reference, due_date, paid_date, created_at, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          charge.id,
          charge.customer_id,
          parseFloat(charge.amount),
          charge.status || 'pending',
          charge.payment_method || 'unknown',
          charge.reference || charge.id,
          charge.due_date || null,
          charge.paid_date || null,
          charge.created_at || new Date().toISOString(),
          'import_manual'
        );

        inserted.push(charge.id);
      } catch (error) {
        errors.push({ chargeId: charge.id, error: error.message });
      }
    }

    return { inserted: inserted.length, errors, total: charges.length };
  }

  /**
   * Importar assinaturas em bulk
   */
  async importSubscriptions(subscriptions) {
    if (!Array.isArray(subscriptions)) {
      throw new Error('Assinaturas deve ser um array');
    }

    const inserted = [];
    const errors = [];

    for (const sub of subscriptions) {
      try {
        this.validateSubscription(sub);

        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO subscriptions (
            id, customer_id, amount, status, plan,
            next_charge_date, created_at, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          sub.id,
          sub.customer_id,
          parseFloat(sub.amount),
          sub.status || 'active',
          sub.plan || 'standard',
          sub.next_charge_date || null,
          sub.created_at || new Date().toISOString(),
          'import_manual'
        );

        inserted.push(sub.id);
      } catch (error) {
        errors.push({ subscriptionId: sub.id, error: error.message });
      }
    }

    return { inserted: inserted.length, errors, total: subscriptions.length };
  }

  /**
   * Importar arquivo completo (com customers, charges, subscriptions)
   */
  async importFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let data;

    try {
      if (ext === '.json') {
        const content = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(content);
      } else {
        throw new Error(`Formato ${ext} não suportado. Use .json`);
      }
    } catch (error) {
      throw new Error(`Erro ao ler arquivo: ${error.message}`);
    }

    const results = {
      customers: { inserted: 0, errors: [] },
      charges: { inserted: 0, errors: [] },
      subscriptions: { inserted: 0, errors: [] },
      timestamp: new Date().toISOString()
    };

    // Importar em transação
    const transaction = this.db.transaction(() => {
      if (data.customers && Array.isArray(data.customers)) {
        results.customers = this.importCustomers(data.customers);
      }

      if (data.charges && Array.isArray(data.charges)) {
        results.charges = this.importCharges(data.charges);
      }

      if (data.subscriptions && Array.isArray(data.subscriptions)) {
        results.subscriptions = this.importSubscriptions(data.subscriptions);
      }
    });

    try {
      transaction();
      console.log('[Import] ✅ Dados importados com sucesso');
      return results;
    } catch (error) {
      console.error('[Import] ❌ Erro na importação:', error.message);
      throw error;
    }
  }

  /**
   * Validações
   */
  validateCustomer(customer) {
    if (!customer.id) throw new Error('ID obrigatório');
    if (!customer.name) throw new Error('Nome obrigatório');
  }

  validateCharge(charge) {
    if (!charge.id) throw new Error('ID obrigatório');
    if (!charge.customer_id) throw new Error('customer_id obrigatório');
    if (!charge.amount) throw new Error('amount obrigatório');
  }

  validateSubscription(sub) {
    if (!sub.id) throw new Error('ID obrigatório');
    if (!sub.customer_id) throw new Error('customer_id obrigatório');
    if (!sub.amount) throw new Error('amount obrigatório');
  }

  /**
   * Gerar template de arquivo para importação
   */
  static generateTemplate() {
    return {
      customers: [
        {
          id: '1',
          name: 'Cliente Exemplo',
          email: 'cliente@example.com',
          phone: '(11) 98765-4321',
          created_at: new Date().toISOString()
        }
      ],
      charges: [
        {
          id: '1',
          customer_id: '1',
          amount: 1000.00,
          status: 'paid',
          payment_method: 'credit_card',
          due_date: new Date().toISOString(),
          paid_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
      ],
      subscriptions: [
        {
          id: '1',
          customer_id: '1',
          amount: 500.00,
          status: 'active',
          plan: 'premium',
          next_charge_date: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
      ]
    };
  }
}

module.exports = { ImportHandler };
