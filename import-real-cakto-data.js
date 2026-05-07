#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Importa dados reais do CSV da Cakto para o sistema
 */

// Lê o CSV
const csvPath = process.argv[2] || '/c/Users/venda/Downloads/orders_report.csv';

if (!fs.existsSync(csvPath)) {
  console.error(`❌ Arquivo não encontrado: ${csvPath}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n');

// Parse header
const header = lines[0].split(',');
const idIdx = header.findIndex(h => h.includes('ID da Venda'));
const nameIdx = header.findIndex(h => h.includes('Nome do Cliente'));
const emailIdx = header.findIndex(h => h.includes('Email do Cliente'));
const phoneIdx = header.findIndex(h => h.includes('Telefone'));
const amountIdx = header.findIndex(h => h.includes('Valor Pago'));
const methodIdx = header.findIndex(h => h.includes('Método de Pagamento'));
const statusIdx = header.findIndex(h => h.includes('Status da Venda'));
const dateIdx = header.findIndex(h => h.includes('Data de Pagamento'));

console.log('[Import] 📊 Analisando CSV...');
console.log(`   - ID: ${idIdx}, Name: ${nameIdx}, Email: ${emailIdx}`);
console.log(`   - Amount: ${amountIdx}, Method: ${methodIdx}, Date: ${dateIdx}\n`);

const customers = {};
const charges = [];

// Parse dados
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const cols = line.split(',');

  const id = cols[idIdx]?.trim();
  const name = cols[nameIdx]?.trim();
  const email = cols[emailIdx]?.trim();
  const phone = cols[phoneIdx]?.trim();
  const amountStr = cols[amountIdx]?.trim();
  const method = cols[methodIdx]?.trim();
  const status = cols[statusIdx]?.trim();
  const dateStr = cols[dateIdx]?.trim();

  if (!email || !amountStr) continue;

  const amount = parseFloat(amountStr);
  if (amount <= 0) continue;

  // Map payment methods
  let paymentMethod = 'pix';
  if (method.includes('CartÃ£o') || method.includes('Cartão')) paymentMethod = 'cc';
  if (method.includes('Boleto')) paymentMethod = 'boleto';
  if (method.includes('Transferência') || method.includes('Transferencia')) paymentMethod = 'transferencia';

  // Add customer
  if (!customers[email]) {
    customers[email] = {
      id: `cust_${email.split('@')[0]}`,
      name: name || 'Cliente',
      email: email,
      phone: phone || '',
      created_at: new Date().toISOString(),
      source: 'cakto_real'
    };
  }

  // Add charge
  charges.push({
    id: id,
    customer_id: `cust_${email.split('@')[0]}`,
    customer_name: name || 'Cliente',
    amount: amount,
    status: status === 'paid' ? 'paid' : 'pending',
    payment_method: paymentMethod,
    due_date: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
    paid_date: status === 'paid' && dateStr ? new Date(dateStr).toISOString() : null,
    created_at: new Date().toISOString(),
    source: 'cakto_real'
  });
}

console.log(`[Import] ✅ Parse concluído:`);
console.log(`   - ${Object.keys(customers).length} clientes únicos`);
console.log(`   - ${charges.length} cobranças\n`);

// Calcula totais
const totalRevenue = charges.reduce((sum, c) => sum + c.amount, 0);
console.log(`[Import] 💰 Receita total: R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`);

// Export para JSON
const payload = {
  customers: Object.values(customers),
  charges: charges,
  subscriptions: []
};

const outputFile = path.join(__dirname, 'cakto-real-data.json');
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
console.log(`[Import] 💾 Salvo em: ${outputFile}\n`);

// Prepara curl command
console.log('[Import] 📤 Importando para o servidor...\n');

const http = require('http');
const body = JSON.stringify(payload);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/import/data',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('[Import] ✅ Importação bem-sucedida!\n');
      console.log('📊 Resultado:');
      console.log(`   - Clientes: ${json.customers?.inserted || 0}`);
      console.log(`   - Cobranças: ${json.charges?.inserted || 0}\n`);
      console.log('🌐 Dashboard: http://localhost:3001/dashboard-sync.html\n');
    } catch (e) {
      console.log('[Import] Resposta:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('[Import] ❌ Erro ao conectar:', e.message);
  console.log('\n💡 Verifique se o servidor está rodando em http://localhost:3001\n');
});

req.write(body);
req.end();
