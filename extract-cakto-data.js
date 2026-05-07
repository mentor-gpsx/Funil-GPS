/**
 * Extrator de Dados da Cakto
 *
 * USO:
 * 1. Abrir: https://app.cakto.com.br/dashboard/my-sales
 * 2. F12 (DevTools) → Console
 * 3. Copiar TODO o conteúdo deste arquivo
 * 4. Colar no console e pressionar Enter
 * 5. Copiar o JSON que aparecer
 * 6. POST para: http://localhost:3001/api/save-data
 */

(async function extractCaktoData() {
  console.log('🔍 Iniciando extração de dados da Cakto...\n');

  const data = {
    customers: [],
    charges: [],
    subscriptions: []
  };

  // ═════════════════════════════════════════════════════════════
  // MÉTODO 1: Procurar dados no window global
  // ═════════════════════════════════════════════════════════════

  // Cakto pode armazenar dados em window.__INITIAL_STATE__ ou similar
  if (window.__INITIAL_STATE__) {
    console.log('✅ Encontrado window.__INITIAL_STATE__');
    const state = window.__INITIAL_STATE__;

    if (state.sales) {
      console.log(`  → ${state.sales.length} vendas encontradas`);
      data.charges = state.sales.map(sale => ({
        id: sale.id || `sale-${Math.random()}`,
        customer_id: sale.customer_id,
        customer_name: sale.customer_name,
        amount: parseFloat(sale.amount),
        status: sale.status || 'pending',
        payment_method: sale.payment_method || 'desconhecido',
        reference: sale.reference,
        due_date: sale.due_date,
        paid_date: sale.paid_date,
        created_at: sale.created_at || new Date().toISOString()
      }));
    }

    if (state.customers) {
      console.log(`  → ${state.customers.length} clientes encontrados`);
      data.customers = state.customers.map(cust => ({
        id: cust.id,
        name: cust.name,
        email: cust.email,
        phone: cust.phone,
        created_at: cust.created_at || new Date().toISOString()
      }));
    }

    if (state.subscriptions) {
      console.log(`  → ${state.subscriptions.length} assinaturas encontradas`);
      data.subscriptions = state.subscriptions.map(sub => ({
        id: sub.id,
        customer_id: sub.customer_id,
        amount: parseFloat(sub.amount),
        status: sub.status || 'active',
        plan: sub.plan,
        next_charge_date: sub.next_charge_date,
        created_at: sub.created_at || new Date().toISOString()
      }));
    }
  }

  // ═════════════════════════════════════════════════════════════
  // MÉTODO 2: Extrair de tabelas HTML (se visíveis)
  // ═════════════════════════════════════════════════════════════

  if (data.charges.length === 0) {
    console.log('🔍 Procurando dados nas tabelas HTML...');

    // Procurar linhas de vendas/cobranças
    const chargeRows = document.querySelectorAll('[data-testid*="sale"], [data-testid*="charge"], tr[class*="sale"], tr[class*="charge"]');
    if (chargeRows.length > 0) {
      console.log(`  → ${chargeRows.length} linhas de cobranças encontradas`);
      chargeRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          data.charges.push({
            id: `charge-${Math.random()}`,
            customer_id: row.getAttribute('data-customer-id') || '',
            customer_name: cells[0]?.textContent || '',
            amount: parseFloat(cells[1]?.textContent.replace(/[^\d.]/g, '')) || 0,
            status: (cells[2]?.textContent || 'pending').toLowerCase(),
            payment_method: 'desconhecido',
            reference: row.getAttribute('data-ref'),
            due_date: cells[3]?.textContent,
            paid_date: null,
            created_at: new Date().toISOString()
          });
        }
      });
    }
  }

  // ═════════════════════════════════════════════════════════════
  // MÉTODO 3: Verificar localStorage/sessionStorage
  // ═════════════════════════════════════════════════════════════

  if (data.customers.length === 0 && localStorage.getItem('cakto_data')) {
    console.log('✅ Encontrado dados em localStorage');
    try {
      const stored = JSON.parse(localStorage.getItem('cakto_data'));
      if (stored.customers) data.customers = stored.customers;
      if (stored.charges) data.charges = stored.charges;
      if (stored.subscriptions) data.subscriptions = stored.subscriptions;
    } catch (e) {
      console.error('⚠️ Erro ao parsear localStorage');
    }
  }

  // ═════════════════════════════════════════════════════════════
  // RESULTADO
  // ═════════════════════════════════════════════════════════════

  console.log('\n📊 RESUMO EXTRAÍDO:');
  console.log(`  • Clientes: ${data.customers.length}`);
  console.log(`  • Cobranças: ${data.charges.length}`);
  console.log(`  • Assinaturas: ${data.subscriptions.length}`);

  if (data.customers.length === 0 && data.charges.length === 0) {
    console.warn('\n⚠️ Nenhum dado foi encontrado!');
    console.log('\nTente:');
    console.log('1. Certifique-se de que está na página correta (my-sales/dashboard)');
    console.log('2. Aguarde a página carregar completamente');
    console.log('3. Se os dados não aparecem no console, a estrutura pode ter mudado');
    return;
  }

  // ═════════════════════════════════════════════════════════════
  // ENVIAR PARA SERVIDOR
  // ═════════════════════════════════════════════════════════════

  console.log('\n🚀 Enviando para servidor...');
  try {
    const response = await fetch('http://localhost:3001/api/save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      console.log('✅ Dados enviados com sucesso!');
      console.log('\n📊 Dashboard atualizado em: http://localhost:3001/financial-dashboard.html');
    } else {
      console.error('❌ Erro ao enviar:', response.status);
      console.log('\n📋 DADOS EXTRAÍDOS (copie para API manualmente):');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Erro de conexão:', error.message);
    console.log('\n📋 DADOS EXTRAÍDOS (copie para API manualmente):');
    console.log(JSON.stringify(data, null, 2));
    console.log('\nPaste no terminal:');
    console.log(`curl -X POST http://localhost:3001/api/save-data \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(data)}'`);
  }

  return data;
})();
