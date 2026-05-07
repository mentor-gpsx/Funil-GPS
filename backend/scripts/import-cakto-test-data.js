const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../.data/cakto.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    process.exit(1);
  }

  console.log('✅ Conectado ao banco de dados\n');

  // Insert test customers and charges
  const customers = [
    { id: 'cust-email1', email: 'cliente1@email.com', name: 'Cliente 1', phone: '11999999999', document: '12345678900', total_spent: 5000 },
    { id: 'cust-email2', email: 'cliente2@email.com', name: 'Cliente 2', phone: '11988888888', document: '98765432100', total_spent: 3000 },
    { id: 'cust-email3', email: 'cliente3@email.com', name: 'Cliente 3', phone: '11977777777', document: '55555555500', total_spent: 8000 }
  ];

  const charges = [
    { id: 'charge-001', customer_id: 'cust-email1', gateway: 'infinitepay', external_id: 'ext-001', product_name: 'Produto A', amount: 500, fee: 25, method: 'credit_card', status: 'paid', created_at: '2026-05-01', paid_at: '2026-05-02' },
    { id: 'charge-002', customer_id: 'cust-email1', gateway: 'infinitepay', external_id: 'ext-002', product_name: 'Produto B', amount: 1500, fee: 75, method: 'credit_card', status: 'paid', created_at: '2026-04-28', paid_at: '2026-04-29' },
    { id: 'charge-003', customer_id: 'cust-email1', gateway: 'infinitepay', external_id: 'ext-003', product_name: 'Produto C', amount: 3000, fee: 150, method: 'bank_transfer', status: 'open', created_at: '2026-05-03', paid_at: null },
    { id: 'charge-004', customer_id: 'cust-email2', gateway: 'infinitepay', external_id: 'ext-004', product_name: 'Produto A', amount: 1000, fee: 50, method: 'credit_card', status: 'paid', created_at: '2026-04-25', paid_at: '2026-04-26' },
    { id: 'charge-005', customer_id: 'cust-email2', gateway: 'infinitepay', external_id: 'ext-005', product_name: 'Produto D', amount: 2000, fee: 100, method: 'credit_card', status: 'open', created_at: '2026-05-02', paid_at: null },
    { id: 'charge-006', customer_id: 'cust-email3', gateway: 'infinitepay', external_id: 'ext-006', product_name: 'Produto B', amount: 4000, fee: 200, method: 'bank_transfer', status: 'paid', created_at: '2026-04-20', paid_at: '2026-04-21' },
    { id: 'charge-007', customer_id: 'cust-email3', gateway: 'infinitepay', external_id: 'ext-007', product_name: 'Produto E', amount: 4000, fee: 200, method: 'credit_card', status: 'open', created_at: '2026-05-04', paid_at: null }
  ];

  const saques = [
    { cakto_id: 'saque-001', data: '2026-05-02', amount: 2000, taxa: 50, status: 'APROVADO', tipo: 'Saque', descricao: 'Saque aprovado' },
    { cakto_id: 'saque-002', data: '2026-04-29', amount: 3000, taxa: 75, status: 'APROVADO', tipo: 'Saque', descricao: 'Saque aprovado' },
    { cakto_id: 'saque-003', data: '2026-04-26', amount: 2500, taxa: 62.5, status: 'APROVADO', tipo: 'Saque', descricao: 'Saque aprovado' },
    { cakto_id: 'saque-004', data: '2026-04-21', amount: 4800, taxa: 120, status: 'APROVADO', tipo: 'Saque', descricao: 'Saque aprovado' },
    { cakto_id: 'saque-005', data: '2026-05-03', amount: 5610.57, taxa: 140, status: 'APROVADO', tipo: 'Saque', descricao: 'Saque aprovado' }
  ];

  // Insert customers
  let customerCount = 0;
  customers.forEach(customer => {
    db.run(
      `INSERT OR REPLACE INTO customers (id, email, name, phone, document, total_spent) VALUES (?, ?, ?, ?, ?, ?)`,
      [customer.id, customer.email, customer.name, customer.phone, customer.document, customer.total_spent],
      (err) => {
        if (!err) customerCount++;
      }
    );
  });

  // Insert charges
  let chargeCount = 0;
  charges.forEach(charge => {
    db.run(
      `INSERT OR IGNORE INTO charges (id, customer_id, gateway, external_id, product_name, amount, fee, method, status, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [charge.id, charge.customer_id, charge.gateway, charge.external_id, charge.product_name, charge.amount, charge.fee, charge.method, charge.status, charge.created_at, charge.paid_at],
      (err) => {
        if (!err) chargeCount++;
      }
    );
  });

  // Insert saques
  let saquesCount = 0;
  saques.forEach(saque => {
    db.run(
      `INSERT INTO saques (cakto_id, data, amount, taxa, status, tipo, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [saque.cakto_id, saque.data, saque.amount, saque.taxa, saque.status, saque.tipo, saque.descricao],
      (err) => {
        if (!err) saquesCount++;
      }
    );
  });

  // Wait and close
  setTimeout(() => {
    console.log('\n✅ DADOS IMPORTADOS!\n');
    console.log(`   📍 Clientes: ${customerCount}`);
    console.log(`   📍 Cobranças: ${chargeCount}`);
    console.log(`   📍 Saques: ${saquesCount}\n`);

    db.get('SELECT COUNT(*) as count, SUM(amount) as total FROM charges', [], (err, row) => {
      if (row) {
        console.log('📊 STATUS DO BANCO:\n');
        console.log(`   Cobranças: ${row.count}`);
        console.log(`   Total: ${(row.total || 0).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}\n`);
      }
      db.close();
      process.exit(0);
    });
  }, 1000);
});
