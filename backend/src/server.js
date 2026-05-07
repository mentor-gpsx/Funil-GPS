/**
 * Financial Portal Backend API
 * Multi-gateway payment reconciliation system
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../')));

// Database connection
const dbPath = path.join(__dirname, '../../.data/cakto.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB Error:', err.message);
  else console.log('✅ Database connected:', dbPath);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard KPIs
app.get('/api/dashboard', (req, res) => {
  const queries = {
    totalCharges: 'SELECT COALESCE(SUM(amount), 0) as total FROM charges',
    totalPaid: 'SELECT COALESCE(SUM(amount), 0) as total FROM saques WHERE status = "APROVADO"',
    totalCustomers: 'SELECT COUNT(DISTINCT customer_id) as count FROM charges',
    chargesByStatus: `
      SELECT status, COUNT(*) as count, SUM(amount) as total
      FROM charges
      GROUP BY status
    `
  };

  db.get(queries.totalCharges, [], (err, chargesRow) => {
    db.get(queries.totalPaid, [], (err, saquesRow) => {
      db.get(queries.totalCustomers, [], (err, customersRow) => {
        db.all(queries.chargesByStatus, [], (err, statusRows) => {
          const totalCharges = chargesRow?.total || 0;
          const totalPaid = saquesRow?.total || 0;
          const discrepancy = totalCharges - totalPaid;
          const reconciliationRatio = totalCharges > 0 ? ((totalPaid / totalCharges) * 100).toFixed(2) : 0;

          res.json({
            timestamp: new Date().toISOString(),
            kpis: {
              expectedAmount: totalCharges,
              receivedAmount: totalPaid,
              discrepancyAmount: discrepancy,
              reconciliationRatio: parseFloat(reconciliationRatio),
              totalCustomers: customersRow?.count || 0,
              healthScore: Math.max(0, 100 - (discrepancy > 0 ? (discrepancy / totalCharges) * 100 : 0))
            },
            byStatus: statusRows || []
          });
        });
      });
    });
  });
});

// List all charges
app.get('/api/charges', (req, res) => {
  const query = `
    SELECT
      id,
      customer_id,
      gateway,
      external_id,
      product_name,
      amount,
      fee,
      method,
      status,
      created_at,
      paid_at
    FROM charges
    ORDER BY created_at DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// List saques (withdrawals)
app.get('/api/saques', (req, res) => {
  const query = `
    SELECT
      id,
      cakto_id,
      data,
      amount,
      taxa,
      status,
      tipo,
      descricao
    FROM saques
    ORDER BY data DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// Reconciliation analysis
app.get('/api/reconciliation', (req, res) => {
  const query = `
    SELECT
      c.id as charge_id,
      c.external_id,
      c.amount as expected,
      COALESCE(
        (SELECT amount FROM saques
         WHERE data = DATE(c.paid_at)
         LIMIT 1),
        0
      ) as received,
      c.status,
      c.created_at,
      c.paid_at,
      CASE
        WHEN c.status = 'paid' AND paid_at IS NOT NULL THEN 'MATCHED'
        WHEN c.status = 'pending' THEN 'PENDING'
        ELSE 'UNMATCHED'
      END as reconciliation_status
    FROM charges c
    ORDER BY c.created_at DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const summary = {
      total: rows?.length || 0,
      matched: rows?.filter(r => r.reconciliation_status === 'MATCHED').length || 0,
      pending: rows?.filter(r => r.reconciliation_status === 'PENDING').length || 0,
      unmatched: rows?.filter(r => r.reconciliation_status === 'UNMATCHED').length || 0,
      data: rows || []
    };

    res.json(summary);
  });
});

// Revenue forecast (30 days)
app.get('/api/forecast', (req, res) => {
  const query = `
    SELECT
      DATE(created_at) as date,
      COUNT(*) as charge_count,
      SUM(amount) as daily_total
    FROM charges
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// Customer details
app.get('/api/customers', (req, res) => {
  const query = `
    SELECT DISTINCT
      c.customer_id,
      COUNT(c.id) as charge_count,
      SUM(CASE WHEN c.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
      SUM(CASE WHEN c.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(c.amount) as total_amount,
      SUM(CASE WHEN c.status = 'paid' THEN c.amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN c.status = 'pending' THEN c.amount ELSE 0 END) as pending_amount
    FROM charges c
    GROUP BY c.customer_id
    ORDER BY total_amount DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// Audit data
app.get('/api/audit', (req, res) => {
  const queries = {
    chargesByMethod: `
      SELECT method, COUNT(*) as count, SUM(amount) as total
      FROM charges
      GROUP BY method
    `,
    chargesByGateway: `
      SELECT gateway, COUNT(*) as count, SUM(amount) as total
      FROM charges
      GROUP BY gateway
    `,
    chargesByProduct: `
      SELECT product_name, COUNT(*) as count, SUM(amount) as total
      FROM charges
      GROUP BY product_name
    `,
    feeSummary: `
      SELECT SUM(fee) as total_fees, AVG(fee) as avg_fee, MAX(fee) as max_fee
      FROM charges
    `
  };

  Promise.all([
    new Promise((resolve) => db.all(queries.chargesByMethod, [], (err, rows) => resolve(rows || []))),
    new Promise((resolve) => db.all(queries.chargesByGateway, [], (err, rows) => resolve(rows || []))),
    new Promise((resolve) => db.all(queries.chargesByProduct, [], (err, rows) => resolve(rows || []))),
    new Promise((resolve) => db.get(queries.feeSummary, [], (err, row) => resolve(row || {})))
  ]).then(([byMethod, byGateway, byProduct, feeSummary]) => {
    res.json({
      byMethod,
      byGateway,
      byProduct,
      feeSummary
    });
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Financial Portal API running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard.html`);
});
