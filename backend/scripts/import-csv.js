const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pg = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/financial_portal';
const client = new pg.Client({ connectionString });

async function importCSV() {
  await client.connect();

  try {
    // 1. Criar tabelas
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        phone VARCHAR(20),
        document VARCHAR(20),
        total_spent DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS charges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES customers(id),
        gateway VARCHAR(50),
        external_id VARCHAR(100) UNIQUE,
        product_name VARCHAR(255),
        amount DECIMAL(15,2) NOT NULL,
        fee DECIMAL(15,2) DEFAULT 0,
        method VARCHAR(50),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW(),
        paid_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        charge_id UUID REFERENCES charges(id),
        gateway VARCHAR(50),
        external_id VARCHAR(100) UNIQUE,
        amount DECIMAL(15,2),
        fee DECIMAL(15,2),
        method VARCHAR(20),
        status VARCHAR(20),
        received_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reconciliation (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        charge_id UUID REFERENCES charges(id),
        payment_id UUID REFERENCES payments(id),
        expected DECIMAL(15,2),
        received DECIMAL(15,2),
        discrepancy DECIMAL(15,2),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
      CREATE INDEX IF NOT EXISTS idx_charges_customer ON charges(customer_id);
      CREATE INDEX IF NOT EXISTS idx_charges_status ON charges(status);
      CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(charge_id);
      CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON reconciliation(status);
    `);
    console.log('✅ Tabelas criadas');

    // 2. Ler CSV
    const csvPath = path.join(__dirname, '../data/orders_report.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`📊 Importando ${records.length} registros...`);

    // 3. Importar registros
    let customerCount = 0;
    let chargeCount = 0;

    for (const record of records) {
      try {
        const email = record['Email do Cliente']?.trim();
        const name = record['Nome do Cliente']?.trim();
        const phone = record['Telefone do Cliente']?.trim();
        const document = record['Número do Documento do Cliente']?.trim();
        const amount = parseFloat(record['Valor Pago pelo Cliente']) || 0;
        const fee = parseFloat(record['Taxas']) || 0;
        const method = record['Método de Pagamento']?.trim();
        const status = record['Status da Venda']?.toLowerCase() === 'paid' ? 'paid' : 'open';
        const product = record['Produto']?.trim();
        const saleDate = record['Data da Venda']?.split('T')[0];
        const paymentDate = record['Data de Pagamento']?.split('T')[0];

        if (!email) continue;

        // Upsert customer
        const customerResult = await client.query(
          `INSERT INTO customers (email, name, phone, document, total_spent)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (email) DO UPDATE SET total_spent = total_spent + $5
           RETURNING id`,
          [email, name || 'Sem nome', phone, document, amount]
        );
        const customerId = customerResult.rows[0].id;
        customerCount++;

        // Insert charge
        const chargeResult = await client.query(
          `INSERT INTO charges (customer_id, gateway, external_id, product_name, amount, fee, method, status, created_at, paid_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (external_id) DO NOTHING
           RETURNING id`,
          [
            customerId,
            'infinitepay',
            record['ID da Venda'],
            product,
            amount,
            fee,
            method,
            status,
            saleDate,
            status === 'paid' ? paymentDate : null
          ]
        );

        if (chargeResult.rows.length > 0) {
          const chargeId = chargeResult.rows[0].id;
          chargeCount++;

          // Insert corresponding payment
          if (status === 'paid') {
            await client.query(
              `INSERT INTO payments (charge_id, gateway, external_id, amount, fee, method, status, received_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (external_id) DO NOTHING`,
              [
                chargeId,
                'infinitepay',
                'PAY-' + record['ID da Venda'],
                amount,
                fee,
                method,
                'approved',
                paymentDate
              ]
            );

            // Auto-reconcile
            await client.query(
              `INSERT INTO reconciliation (charge_id, payment_id, expected, received, discrepancy, status)
               SELECT $1, p.id, $2, $3, 0, 'matched'
               FROM payments p WHERE p.charge_id = $1`,
              [chargeId, amount, amount]
            );
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar linha:', error.message);
      }
    }

    console.log(`✅ Importação concluída!`);
    console.log(`   Clientes: ${customerCount}`);
    console.log(`   Cobranças: ${chargeCount}`);

  } finally {
    await client.end();
  }
}

importCSV().catch(console.error);
