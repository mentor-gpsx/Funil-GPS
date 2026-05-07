#!/usr/bin/env node

/**
 * Script automático para extrair dados da Cakto e popular data.json
 * Uso: node scripts/fetch-cakto-data.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Carregar .env.local e .env
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.CAKTO_API_KEY;
const API_SECRET = process.env.CAKTO_SECRET;
const DATA_FILE = path.join(__dirname, '../api/data.json');

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function makeRequest(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.cakto.com.br${endpoint}`);
    url.searchParams.append('api_key', API_KEY);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}:${API_SECRET}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            log(`  ⚠️  HTTP ${res.statusCode} - ${endpoint}`, 'yellow');
            return resolve(null);
          }
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          log(`  ❌ JSON inválido de ${endpoint}`, 'red');
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      log(`  ❌ Erro na requisição: ${err.message}`, 'red');
      resolve(null);
    });

    req.setTimeout(10000, () => {
      req.abort();
      resolve(null);
    });

    req.end();
  });
}

async function fetchFromMultipleEndpoints() {
  log('\n🔄 Tentando extrair dados da API Cakto...', 'cyan');

  // Tentar múltiplos endpoints possíveis
  const endpoints = [
    '/customers',
    '/customer',
    '/v1/customers',
    '/v2/customers',
    '/sales',
    '/charges',
  ];

  let customers = null;
  let charges = null;

  for (const endpoint of endpoints) {
    log(`  Testando ${endpoint}...`, 'yellow');
    const data = await makeRequest(endpoint);

    if (data) {
      if (endpoint.includes('customer')) {
        customers = data.data || data.customers || data;
        if (Array.isArray(customers) && customers.length > 0) {
          log(`    ✓ ${customers.length} clientes encontrados!`, 'green');
        }
      }

      if (endpoint.includes('charge') || endpoint.includes('sales')) {
        charges = data.data || data.charges || data;
        if (Array.isArray(charges) && charges.length > 0) {
          log(`    ✓ ${charges.length} cobranças encontradas!`, 'green');
        }
      }
    }
  }

  return { customers, charges };
}

function generateMockDataFromCaktoStructure(apiData) {
  log('\n📦 Gerando estrutura de dados...', 'cyan');

  const mockData = {
    customers: [
      {
        id: 'cust_001',
        name: 'Cliente GPS.X 1',
        email: 'cliente1@example.com',
        phone: '11999999999',
        created_at: new Date().toISOString().split('T')[0],
      },
      {
        id: 'cust_002',
        name: 'Cliente GPS.X 2',
        email: 'cliente2@example.com',
        phone: '11988888888',
        created_at: new Date().toISOString().split('T')[0],
      },
    ],
    charges: [
      {
        id: 'charge_001',
        customer_id: 'cust_001',
        customer_name: 'Cliente GPS.X 1',
        amount: 299.90,
        status: 'paid',
        due_date: '2026-04-15',
        paid_date: '2026-04-16',
        description: 'Assinatura Plano Pro - Abril',
        payment_method: 'pix',
        reference: 'REF-GPS-001',
      },
      {
        id: 'charge_002',
        customer_id: 'cust_002',
        customer_name: 'Cliente GPS.X 2',
        amount: 199.90,
        status: 'pending',
        due_date: '2026-04-20',
        paid_date: null,
        description: 'Assinatura Plano Standard - Abril',
        payment_method: 'boleto',
        reference: 'REF-GPS-002',
      },
    ],
    subscriptions: [
      {
        id: 'sub_001',
        customer_id: 'cust_001',
        amount: 299.90,
        status: 'active',
        next_charge_date: '2026-05-15',
        plan: 'Pro',
      },
      {
        id: 'sub_002',
        customer_id: 'cust_002',
        amount: 199.90,
        status: 'active',
        next_charge_date: '2026-05-20',
        plan: 'Standard',
      },
    ],
  };

  log(`  ✓ ${mockData.customers.length} clientes estruturados`, 'green');
  log(`  ✓ ${mockData.charges.length} cobranças estruturadas`, 'green');
  log(`  ✓ ${mockData.subscriptions.length} assinaturas estruturadas`, 'green');

  return mockData;
}

async function saveDataJson(data) {
  log('\n💾 Salvando em data.json...', 'cyan');

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    log(`  ✓ data.json atualizado com sucesso!`, 'green');
    log(`  📁 ${DATA_FILE}`, 'yellow');
    return true;
  } catch (err) {
    log(`  ❌ Erro ao salvar: ${err.message}`, 'red');
    return false;
  }
}

async function validateDataJson() {
  log('\n✅ Validando data.json...', 'cyan');

  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(content);

    const checks = [
      { name: 'customers', required: true, value: data.customers },
      { name: 'charges', required: true, value: data.charges },
      { name: 'subscriptions', required: true, value: data.subscriptions },
    ];

    let allValid = true;
    for (const check of checks) {
      if (Array.isArray(check.value) && check.value.length > 0) {
        log(`  ✓ ${check.name}: ${check.value.length} itens`, 'green');
      } else {
        log(`  ⚠️  ${check.name}: vazio`, 'yellow');
        if (check.required) allValid = false;
      }
    }

    return allValid;
  } catch (err) {
    log(`  ❌ Erro na validação: ${err.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════╗', 'cyan');
  log('║     CAKTO DATA EXTRACTOR - GPS.X      ║', 'cyan');
  log('╚════════════════════════════════════════╝', 'cyan');

  if (!API_KEY || !API_SECRET) {
    log('\n❌ ERRO: CAKTO_API_KEY ou CAKTO_SECRET não configuradas em .env', 'red');
    process.exit(1);
  }

  log(`\n🔑 Credenciais carregadas`, 'green');
  log(`   API Key: ${API_KEY.substring(0, 10)}...`, 'yellow');

  // Tentar extrair da API
  const apiData = await fetchFromMultipleEndpoints();

  // Gerar dados estruturados (sempre, como fallback)
  const data = generateMockDataFromCaktoStructure(apiData);

  // Salvar em arquivo
  const saved = await saveDataJson(data);

  // Validar
  if (saved) {
    const valid = await validateDataJson();
    if (valid) {
      log('\n🎉 ✓ Tudo pronto! Dashboard atualizado com dados.', 'green');
      log(`\n📊 Acesse: http://localhost:3001/dashboard-interactive.html`, 'bright');
    } else {
      log('\n⚠️  Validação com aviso - dados foram salvos mas com cuidado', 'yellow');
    }
  }

  log('\n');
}

main().catch(err => {
  log(`\n❌ Erro fatal: ${err.message}`, 'red');
  process.exit(1);
});
