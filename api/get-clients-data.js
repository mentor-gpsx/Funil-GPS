/**
 * Retorna dados detalhados dos clientes para o dashboard
 * Uso: node get-clients-data.js
 */

const { Database } = require('./database-schema.js');

async function getClientsData() {
  try {
    const db = new Database();
    await db.init();

    const clients = await db.all(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.created_at,
        COUNT(DISTINCT ch.id) as total_charges,
        COUNT(DISTINCT CASE WHEN ch.status = 'paid' THEN ch.id END) as paid_charges,
        COUNT(DISTINCT CASE WHEN ch.status = 'pending' THEN ch.id END) as pending_charges,
        COUNT(DISTINCT CASE WHEN ch.status = 'failed' THEN ch.id END) as failed_charges,
        COALESCE(SUM(CASE WHEN ch.status = 'paid' THEN ch.amount ELSE 0 END), 0) as total_paid,
        COALESCE(MAX(CASE WHEN ch.status = 'paid' THEN ch.paid_date END), NULL) as last_payment_date,
        COUNT(DISTINCT s.id) as active_subscriptions,
        COALESCE(SUM(s.amount), 0) as monthly_revenue
      FROM customers c
      LEFT JOIN charges ch ON c.id = ch.customer_id
      LEFT JOIN subscriptions s ON c.id = s.customer_id AND s.status = 'active'
      GROUP BY c.id
      ORDER BY total_paid DESC
    `) || [];

    await db.close();
    console.log(JSON.stringify(clients, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
}

getClientsData();
