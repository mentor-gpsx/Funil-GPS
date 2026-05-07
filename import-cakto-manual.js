/**
 * IMPORTADOR DE SAQUES - DADOS MANUAIS
 * Para quando a API Cakto não está acessível via REST
 */

const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./.data/cakto.db');

// Dados manuais que você pode copiar/colar do dashboard Cakto
// Formato: {data: "YYYY-MM-DD", amount: 0.00, status: "APROVADO"}
const SAQUES_MANUAIS = [
  { data: '2026-04-10', amount: 22110.57, status: 'APROVADO', descricao: 'Saque Cakto - 10/04/2026' },
  // ADICIONE MAIS SAQUES AQUI copiando do dashboard Cakto
];

// Tabela de correspondência: Cliente → Saque esperado (para teste)
// Baseado nos 76 clientes que têm cobranças
const CLIENTES_COM_CHARGES = [
  { nome: 'Leonardo Lemos', amount: 7349.75, expected_date: '2026-03-31' },
  { nome: 'Ana Silva', amount: 5234.50, expected_date: '2026-03-28' },
  { nome: 'Carlos Santos', amount: 8900.00, expected_date: '2026-04-01' },
  // ... mais clientes conforme necessário
];

function createSaquesTable() {
  return new Promise((resolve, reject) => {
    const sql = `
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
      )
    `;

    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function importarSaquesManual() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📝 IMPORTADOR DE SAQUES - MODO MANUAL');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // 1. Criar tabela
    console.log('1️⃣ Criando tabela saques...');
    await createSaquesTable();
    console.log('   ✅ Tabela criada\n');

    // 2. Inserir dados manuais
    console.log('2️⃣ Importando saques manuais...\n');

    let inserted = 0;
    let totalAmount = 0;

    for (const saque of SAQUES_MANUAIS) {
      const id = `saque-manual-${Date.now()}`;

      const sql = `
        INSERT INTO saques (cakto_id, data, amount, taxa, status, tipo, descricao)
        VALUES (?, ?, ?, ?, ?, 'Saque', ?)
      `;

      try {
        await new Promise((resolve, reject) => {
          db.run(sql, [id, saque.data, saque.amount, 0, saque.status, saque.descricao], function(err) {
            if (err) reject(err);
            else {
              inserted++;
              totalAmount += saque.amount;
              console.log(`   ✅ ${saque.data}: R$ ${saque.amount.toFixed(2)} (${saque.status})`);
              resolve();
            }
          });
        });
      } catch (e) {
        console.log(`   ⚠️ Erro ao inserir: ${e.message}`);
      }
    }

    console.log(`\n✅ IMPORTAÇÃO CONCLUÍDA!\n`);
    console.log(`   Inseridos: ${inserted}`);
    console.log(`   Total: R$ ${totalAmount.toFixed(2)}\n`);

    // 3. Verificar integridade
    db.get('SELECT COUNT(*) as count, SUM(amount) as total FROM saques', [], (err, row) => {
      if (row) {
        console.log(`📊 STATUS FINAL:\n`);
        console.log(`   Saques no banco: ${row.count}`);
        console.log(`   Total: R$ ${(row.total || 0).toFixed(2)}\n`);
      }
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log('💡 PRÓXIMOS PASSOS:\n');
      console.log('1. Abra o dashboard Cakto em https://app.cakto.com.br');
      console.log('2. Vá em "Financeiro > Extrato"');
      console.log('3. Copie cada saque (data, valor, status)');
      console.log('4. Cole no arquivo import-cakto-manual.js na array SAQUES_MANUAIS');
      console.log('5. Execute novamente: node import-cakto-manual.js\n');

      db.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    db.close();
    process.exit(1);
  }
}

// Executar
importarSaquesManual();
