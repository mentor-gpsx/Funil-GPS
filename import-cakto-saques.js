/**
 * IMPORTADOR DE SAQUES - CAKTO API
 * Integração com API real da Cakto
 */

const https = require('https');
const sqlite3 = require('sqlite3');

const API_KEY = 'ExWAJakhXqwV2I54fnz33YjW5aq9o2bBkO6rxwRf';
const API_BASE = 'https://app.cakto.com.br';

const db = new sqlite3.Database('./.data/cakto.db');

// Fazer requisição HTTPS
function fetchFromCakto(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'app.cakto.com.br',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'GPS-X-Audit/1.0'
      }
    };

    console.log(`📡 Requisição: ${method} ${path}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Criar tabela saques
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

// Importar saques
async function importarSaques() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔄 IMPORTANDO SAQUES DA CAKTO');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // 1. Criar tabela
    console.log('1️⃣ Criando tabela saques...');
    await createSaquesTable();
    console.log('   ✅ Tabela criada\n');

    // 2. Tentar endpoints comuns
    const endpoints = [
      '/api/v1/extratos',
      '/api/v1/saques',
      '/api/v1/withdrawals',
      '/api/extratos',
      '/api/saques',
      '/extratos',
      '/saques',
      '/financeiro/extratos',
      '/financeiro/saques'
    ];

    let saquesData = null;
    let foundEndpoint = null;

    console.log('2️⃣ Descobrindo endpoint de saques...\n');

    for (const endpoint of endpoints) {
      try {
        const response = await fetchFromCakto(endpoint);

        if (response.status === 200 && response.data) {
          console.log(`   ✅ Encontrado: ${endpoint}`);
          console.log(`      Status: ${response.status}`);

          if (Array.isArray(response.data)) {
            saquesData = response.data;
            foundEndpoint = endpoint;
            break;
          } else if (response.data.data && Array.isArray(response.data.data)) {
            saquesData = response.data.data;
            foundEndpoint = endpoint;
            break;
          } else if (response.data.saques && Array.isArray(response.data.saques)) {
            saquesData = response.data.saques;
            foundEndpoint = endpoint;
            break;
          }
        } else if (response.status === 401) {
          console.log(`   ⚠️ ${endpoint} - Não autorizado (401)`);
        } else {
          console.log(`   ❌ ${endpoint} - Status ${response.status}`);
        }
      } catch (e) {
        console.log(`   ❌ ${endpoint} - Erro: ${e.message}`);
      }
    }

    if (!saquesData) {
      console.log('\n❌ ERRO: Nenhum endpoint de saques encontrado!');
      console.log('\n📋 Endpoints testados:');
      endpoints.forEach(ep => console.log(`   - ${ep}`));
      console.log('\n💡 Próximos passos:');
      console.log('   1. Verifique o endpoint correto na documentação Cakto');
      console.log('   2. Confirme que a API Key tem permissão para saques');
      console.log('   3. Verifique se há firewall bloqueando a requisição');
      process.exit(1);
    }

    console.log(`\n3️⃣ Processando ${saquesData.length} saques...\n`);

    // 3. Inserir saques
    let inserted = 0;
    let duplicates = 0;
    let totalAmount = 0;

    for (const saque of saquesData) {
      const id = saque.id || saque.cakto_id || `saque-${Date.now()}`;
      const data = saque.data || saque.date || saque.created_at || new Date().toISOString();
      const amount = parseFloat(saque.amount || saque.valor || saque.value || 0);
      const taxa = parseFloat(saque.taxa || saque.fee || 4.59 || 0);
      const status = (saque.status || 'PENDENTE').toUpperCase();

      const sql = `
        INSERT INTO saques (cakto_id, data, amount, taxa, status, tipo, descricao)
        VALUES (?, ?, ?, ?, ?, 'Saque', ?)
      `;

      try {
        await new Promise((resolve, reject) => {
          db.run(sql, [id, data, amount, taxa, status, JSON.stringify(saque)], function(err) {
            if (err) {
              if (err.message.includes('UNIQUE')) {
                duplicates++;
              } else {
                console.log(`   ⚠️ Erro ao inserir ${id}: ${err.message}`);
              }
              reject(err);
            } else {
              inserted++;
              totalAmount += amount;
              console.log(`   ✅ ${id}: R$ ${amount.toFixed(2)} (${status})`);
              resolve();
            }
          });
        });
      } catch (e) {
        // Continua mesmo com erro
      }
    }

    console.log(`\n✅ IMPORTAÇÃO CONCLUÍDA!\n`);
    console.log(`   Inseridos: ${inserted}`);
    console.log(`   Duplicados: ${duplicates}`);
    console.log(`   Total: R$ ${totalAmount.toFixed(2)}\n`);

    // 4. Verificar integridade
    db.get('SELECT COUNT(*) as count, SUM(amount) as total FROM saques', [], (err, row) => {
      if (row) {
        console.log(`📊 STATUS FINAL:\n`);
        console.log(`   Saques no banco: ${row.count}`);
        console.log(`   Total: R$ ${(row.total || 0).toFixed(2)}\n`);
      }
      console.log('═══════════════════════════════════════════════════════════\n');
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
importarSaques();
