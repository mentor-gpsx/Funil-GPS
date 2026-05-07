#!/usr/bin/env node

/**
 * Financial Portal Setup
 * Initializes database and imports CSV data
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { parse } = require('csv-parse/sync');

const DATA_DIR = path.join(__dirname, '.data');
const DB_PATH = path.join(DATA_DIR, 'cakto.db');
const CSV_PATH = path.join(__dirname, 'orders_report.csv');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('🚀 SETUP - Portal Financeiro');
console.log('═══════════════════════════════════════════════════════════\n');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✅ Diretório de dados criado\n');
}

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    process.exit(1);
  }

  console.log('✅ Conectado ao banco de dados SQLite\n');

  // Create tables
  console.log('1️⃣ Criando tabelas...\n');

  const createTablesSql = `
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      phone TEXT,
      document TEXT,
      total_spent REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS charges (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      gateway TEXT DEFAULT 'infinitepay',
      external_id TEXT UNIQUE NOT NULL,
      product_name TEXT,
      amount REAL NOT NULL,
      fee REAL DEFAULT 0,
      method TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT,
      paid_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS saques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cakto_id TEXT UNIQUE,
      data TEXT NOT NULL,
      amount REAL NOT NULL,
      taxa REAL DEFAULT 0,
      status TEXT DEFAULT 'PENDENTE',
      tipo TEXT DEFAULT 'Saque',
      descricao TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_charges_customer ON charges(customer_id);
    CREATE INDEX IF NOT EXISTS idx_charges_status ON charges(status);
    CREATE INDEX IF NOT EXISTS idx_charges_external_id ON charges(external_id);
    CREATE INDEX IF NOT EXISTS idx_saques_data ON saques(data);
    CREATE INDEX IF NOT EXISTS idx_saques_status ON saques(status);
  `;

  db.exec(createTablesSql, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabelas:', err.message);
      db.close();
      process.exit(1);
    }

    console.log('✅ Tabelas criadas com sucesso\n');

    // Import CSV data
    if (fs.existsSync(CSV_PATH)) {
      importCsvData(db);
    } else {
      console.log('⚠️ Arquivo orders_report.csv não encontrado');
      console.log('   Execute o import manual com: node import-csv.js\n');
      db.close();
      process.exit(0);
    }
  });
});

function importCsvData(db) {
  console.log('2️⃣ Importando dados do CSV...\n');

  try {
    const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`   📊 ${records.length} registros encontrados\n`);

    let customerCount = 0;
    let chargeCount = 0;
    let processedCount = 0;

    const insertCustomer = (email, name, phone, document, amount) => {
      return new Promise((resolve) => {
        const customerId = `cust-${email.replace(/[^a-zA-Z0-9]/g, '-')}`;
        db.run(
          `INSERT OR REPLACE INTO customers (id, email, name, phone, document, total_spent)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [customerId, email, name || 'Sem nome', phone, document, amount],
          (err) => {
            if (!err) customerCount++;
            resolve(customerId);
          }
        );
      });
    };

    const insertCharge = (customerId, external_id, product, amount, fee, method, status, created_at, paid_at) => {
      return new Promise((resolve) => {
        const chargeId = `charge-${external_id}`;
        db.run(
          `INSERT OR IGNORE INTO charges
           (id, customer_id, external_id, product_name, amount, fee, method, status, created_at, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [chargeId, customerId, external_id, product, amount, fee, method, status, created_at, paid_at],
          (err) => {
            if (!err) chargeCount++;
            resolve(chargeId);
          }
        );
      });
    };

    // Process records sequentially
    (async () => {
      for (const record of records) {
        try {
          const email = record['Email do Cliente']?.trim();
          const name = record['Nome do Cliente']?.trim();
          const phone = record['Telefone do Cliente']?.trim();
          const document = record['Número do Documento do Cliente']?.trim();
          const amount = parseFloat(record['Valor Pago pelo Cliente']) || 0;
          const fee = parseFloat(record['Taxas']) || 0;
          const method = record['Método de Pagamento']?.trim();
          const product = record['Produto']?.trim();
          const saleDate = record['Data da Venda']?.split('T')[0];
          const status = record['Status da Venda']?.toLowerCase() === 'paid' ? 'paid' : 'open';
          const paymentDate = record['Data de Pagamento']?.split('T')[0];

          if (!email) continue;

          // Insert customer
          const customerId = await insertCustomer(email, name, phone, document, amount);

          // Insert charge
          await insertCharge(customerId, record['ID da Venda'], product, amount, fee, method, status, saleDate, status === 'paid' ? paymentDate : null);

          processedCount++;
          if (processedCount % 10 === 0) {
            process.stdout.write(`\r   ⏳ Processados: ${processedCount}/${records.length}`);
          }
        } catch (e) {
          console.error(`\n   ❌ Erro na linha: ${e.message}`);
        }
      }

      console.log(`\r   ✅ Processados: ${processedCount}/${records.length}\n`);
      console.log('✅ IMPORTAÇÃO CONCLUÍDA!\n');
      console.log(`   📍 Clientes: ${customerCount}`);
      console.log(`   📍 Cobranças: ${chargeCount}\n`);

      // Verify database
      db.get('SELECT COUNT(*) as count, SUM(amount) as total FROM charges', [], (err, row) => {
        if (row) {
          console.log('📊 STATUS DO BANCO:\n');
          console.log(`   Cobranças: ${row.count}`);
          console.log(`   Total: ${(row.total || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}\n`);
        }

        console.log('═══════════════════════════════════════════════════════════\n');
        console.log('🚀 PRÓXIMO PASSO:\n');
        console.log('   1. Abra outro terminal');
        console.log('   2. Execute: npm start');
        console.log('   3. Abra: http://localhost:3000/dashboard.html\n');
        console.log('═══════════════════════════════════════════════════════════\n');

        db.close();
        process.exit(0);
      });
    })();

  } catch (error) {
    console.error('❌ Erro ao importar CSV:', error.message);
    db.close();
    process.exit(1);
  }
}
