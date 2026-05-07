/**
 * SCRIPT DE TESTE - Simula saques baseado em charges reais
 * Cria dados de teste para validar o dashboard sem API Cakto
 */

const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./.data/cakto.db');

// Dados de teste: saques que correspondem aos charges já no banco
// Baseado na análise: 76 charges, ~R$ 95.512, esperando ~R$ 22.110 em saques
const SAQUES_TESTE = [
  { data: '2026-04-10', amount: 22110.57, status: 'APROVADO' },
  { data: '2026-04-15', amount: 15000.00, status: 'APROVADO' },
  { data: '2026-04-20', amount: 18000.00, status: 'APROVADO' },
  { data: '2026-04-25', amount: 12500.00, status: 'PENDENTE' },
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

async function importarSaquesTest() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🧪 IMPORTADOR DE SAQUES - DADOS DE TESTE');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Deletar dados antigos se existirem
    console.log('1️⃣ Limpando dados antigos...');
    await new Promise((resolve) => {
      db.run('DELETE FROM saques', () => {
        console.log('   ✅ Tabela limpa\n');
        resolve();
      });
    });

    // Criar tabela
    console.log('2️⃣ Criando tabela saques...');
    await createSaquesTable();
    console.log('   ✅ Tabela criada\n');

    // Inserir dados de teste
    console.log('3️⃣ Importando saques de teste...\n');

    let inserted = 0;
    let totalAmount = 0;

    for (let i = 0; i < SAQUES_TESTE.length; i++) {
      const saque = SAQUES_TESTE[i];
      const id = `saque-test-${i+1}`;

      const sql = `
        INSERT INTO saques (cakto_id, data, amount, taxa, status, tipo, descricao)
        VALUES (?, ?, ?, ?, ?, 'Saque', ?)
      `;

      try {
        await new Promise((resolve, reject) => {
          db.run(sql, [id, saque.data, saque.amount, 0, saque.status, `Saque Teste ${i+1}`], function(err) {
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

    // Verificar integridade
    db.get('SELECT COUNT(*) as count, SUM(amount) as total FROM saques', [], (err, row) => {
      if (row) {
        console.log(`📊 STATUS FINAL:\n`);
        console.log(`   Saques no banco: ${row.count}`);
        console.log(`   Total: R$ ${(row.total || 0).toFixed(2)}\n`);
      }

      console.log('═══════════════════════════════════════════════════════════\n');

      console.log('🚀 PRÓXIMAS AÇÕES:\n');
      console.log('1. Abra o dashboard: http://localhost:3001/reconciliation-dashboard.html');
      console.log('2. Verifique o Health Score (deve mostrar ~77% = R$ 67.610 / R$ 95.512)');
      console.log('3. Abra a aba "Evidências" para ver as correspondências');
      console.log('4. Teste os filtros e expandir/recolher cards\n');
      console.log('✅ Dados de teste carregados. Sistema pronto para validação!\n');

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
importarSaquesTest();
