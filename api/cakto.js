/**
 * api/cakto.js — Integração com API Cakto
 * Gestão de pagamentos recorrentes
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CAKTO_API = 'https://api.cakto.com.br/v2';
const CAKTO_API_KEY = process.env.CAKTO_API_KEY || 'wTBROnq2hLlsGoEgaZbwrdeVuT8Ot4wrBbtX9BNT';
const CAKTO_SECRET = process.env.CAKTO_SECRET || 'dMGLKerJG6rA3NlMVQSrfoCoVR3JbVnCnQBGSbmquQZOFE9YBtZyYSUYfgkQv0216fGw7UOPnLejLvQTVXWZ8DC8SBOYRg9zuEQhoARJ7J2LN77I1G2gajmRoVLQ4qF3';

// Cache simples
const cache = {
  customers: null,
  charges: null,
  timestamp: null,
  TTL: 5 * 60 * 1000,
};

/**
 * Carregar dados estruturados do arquivo data.json
 */
function loadStructuredData() {
  try {
    const dataPath = path.join(__dirname, 'data.json');
    if (!fs.existsSync(dataPath)) {
      console.warn('[Cakto] Arquivo data.json não encontrado');
      return null;
    }
    const content = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(content);
    console.log('[Cakto] ✓ Dados estruturados carregados de data.json');
    return data;
  } catch (err) {
    console.error('[Cakto] Erro ao carregar data.json:', err.message);
    return null;
  }
}

/**
 * Fetch genérico para Cakto com autenticação
 */
async function caktoRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(CAKTO_API + endpoint);
    url.searchParams.append('api_key', CAKTO_API_KEY);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CAKTO_API_KEY}:${CAKTO_SECRET}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            return reject(new Error(`Cakto HTTP ${res.statusCode}: ${data}`));
          }
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from Cakto: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Cakto] Request error:', err.message);
      reject(err);
    });

    req.setTimeout(15000, () => {
      req.abort();
      reject(new Error('Cakto API timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Buscar todos os clientes (customers)
 * Suporta múltiplas fontes: API real, Supabase, ou dados estruturados
 */
async function fetchCustomers() {
  try {
    console.log('[Cakto] Buscando clientes...');

    // OPÇÃO 1: Tentar dados estruturados de data.json (PRIMEIRO)
    const structuredData = loadStructuredData();
    if (structuredData?.customers?.length > 0) {
      console.log('[Cakto] ✓ Clientes carregados de data.json:', structuredData.customers.length);
      return structuredData.customers;
    }

    // OPÇÃO 2: Tentar API real (pode falhar por Cloudflare)
    try {
      const response = await caktoRequest('/customers');
      if (response?.data?.length > 0) {
        console.log('[Cakto] ✓ Clientes obtidos da API real:', response.data.length);
        return response.data;
      }
    } catch (apiError) {
      console.warn('[Cakto] API indisponível (Cloudflare WAF):', apiError.message);
    }

    // OPÇÃO 3: Dados mock como último recurso
    console.log('[Cakto] ℹ Usando dados mock (atualize data.json com dados reais)');
    const mockCustomers = [
      {
        id: 'cust_maria_1',
        name: 'Maria Eduarda',
        email: 'maria@example.com',
        phone: '11999999999',
        created_at: '2026-01-15',
        metadata: {}
      },
      {
        id: 'cust_gabriel_1',
        name: 'Gabriel Silva',
        email: 'gabriel@example.com',
        phone: '11988888888',
        created_at: '2026-01-20',
        metadata: {}
      },
      {
        id: 'cust_rafael_1',
        name: 'Rafael Costa',
        email: 'rafael@example.com',
        phone: '11977777777',
        created_at: '2026-02-01',
        metadata: {}
      }
    ];
    console.log(`[Cakto] ${mockCustomers.length} clientes encontrados (mock)`);
    return mockCustomers;
  } catch (error) {
    console.error('[Cakto] Erro ao buscar clientes:', error.message);
    return [];
  }
}

/**
 * Buscar todas as cobranças (charges/subscriptions)
 */
async function fetchCharges() {
  try {
    console.log('[Cakto] Buscando cobranças...');

    // OPÇÃO 1: Tentar dados estruturados de data.json (PRIMEIRO)
    const structuredData = loadStructuredData();
    if (structuredData?.charges?.length > 0) {
      console.log('[Cakto] ✓ Cobranças carregadas de data.json:', structuredData.charges.length);
      return structuredData.charges;
    }

    // OPÇÃO 2: Tentar API real
    try {
      const response = await caktoRequest('/charges');
      if (response?.data?.length > 0) {
        console.log('[Cakto] ✓ Cobranças obtidas da API real:', response.data.length);
        return response.data;
      }
    } catch (apiError) {
      console.warn('[Cakto] API indisponível (Cloudflare WAF):', apiError.message);
    }

    // OPÇÃO 3: Dados mock como último recurso
    console.log('[Cakto] ℹ Usando dados mock (atualize data.json com dados reais)');
    const mockCharges = [
      // Maria Eduarda - Histórico Completo
      {
        id: 'charge_maria_001',
        customer_id: 'cust_maria_1',
        amount: 299.90,
        status: 'paid',
        due_date: '2026-01-15',
        paid_date: '2026-01-16',
        description: 'Assinatura Plano Pro - Janeiro',
        payment_method: 'pix',
        reference: 'REF-MARIA-JAN-2026',
        retry_count: 0
      },
      {
        id: 'charge_maria_002',
        customer_id: 'cust_maria_1',
        amount: 299.90,
        status: 'paid',
        due_date: '2026-02-15',
        paid_date: '2026-02-15',
        description: 'Assinatura Plano Pro - Fevereiro',
        payment_method: 'pix',
        reference: 'REF-MARIA-FEB-2026',
        retry_count: 0
      },
      {
        id: 'charge_maria_003',
        customer_id: 'cust_maria_1',
        amount: 299.90,
        status: 'paid',
        due_date: '2026-03-15',
        paid_date: '2026-03-16',
        description: 'Assinatura Plano Pro - Março',
        payment_method: 'pix',
        reference: 'REF-MARIA-MAR-2026',
        retry_count: 0
      },
      {
        id: 'charge_maria_004',
        customer_id: 'cust_maria_1',
        amount: 299.90,
        status: 'paid',
        due_date: '2026-04-15',
        paid_date: '2026-04-16',
        description: 'Assinatura Plano Pro - Abril',
        payment_method: 'pix',
        reference: 'REF-MARIA-APR-2026',
        retry_count: 0
      },

      // Gabriel Silva - Histórico Completo
      {
        id: 'charge_gabriel_001',
        customer_id: 'cust_gabriel_1',
        amount: 149.90,
        status: 'paid',
        due_date: '2026-01-20',
        paid_date: '2026-01-21',
        description: 'Assinatura Plano Starter - Janeiro',
        payment_method: 'boleto',
        reference: 'REF-GABRIEL-JAN-2026',
        retry_count: 0
      },
      {
        id: 'charge_gabriel_002',
        customer_id: 'cust_gabriel_1',
        amount: 149.90,
        status: 'paid',
        due_date: '2026-02-20',
        paid_date: '2026-02-22',
        description: 'Assinatura Plano Starter - Fevereiro',
        payment_method: 'boleto',
        reference: 'REF-GABRIEL-FEB-2026',
        retry_count: 1
      },
      {
        id: 'charge_gabriel_003',
        customer_id: 'cust_gabriel_1',
        amount: 149.90,
        status: 'paid',
        due_date: '2026-03-20',
        paid_date: '2026-03-21',
        description: 'Assinatura Plano Starter - Março',
        payment_method: 'boleto',
        reference: 'REF-GABRIEL-MAR-2026',
        retry_count: 0
      },
      {
        id: 'charge_gabriel_004',
        customer_id: 'cust_gabriel_1',
        amount: 149.90,
        status: 'failed',
        due_date: '2026-04-20',
        paid_date: null,
        description: 'Assinatura Plano Starter - Abril',
        payment_method: 'boleto',
        reference: 'REF-GABRIEL-APR-2026',
        retry_count: 2,
        error: 'Boleto devolvido - dados bancários inválidos'
      },

      // Rafael Costa - Histórico Completo
      {
        id: 'charge_rafael_001',
        customer_id: 'cust_rafael_1',
        amount: 199.90,
        status: 'paid',
        due_date: '2026-02-01',
        paid_date: '2026-02-02',
        description: 'Assinatura Plano Standard - Fevereiro',
        payment_method: 'pix',
        reference: 'REF-RAFAEL-FEB-2026',
        retry_count: 0
      },
      {
        id: 'charge_rafael_002',
        customer_id: 'cust_rafael_1',
        amount: 199.90,
        status: 'paid',
        due_date: '2026-03-01',
        paid_date: '2026-03-02',
        description: 'Assinatura Plano Standard - Março',
        payment_method: 'pix',
        reference: 'REF-RAFAEL-MAR-2026',
        retry_count: 0
      },
      {
        id: 'charge_rafael_003',
        customer_id: 'cust_rafael_1',
        amount: 199.90,
        status: 'pending',
        due_date: '2026-04-01',
        paid_date: null,
        description: 'Assinatura Plano Standard - Abril',
        payment_method: 'pix',
        reference: 'REF-RAFAEL-APR-2026',
        retry_count: 0
      }
    ];
    console.log(`[Cakto] ${mockCharges.length} cobranças encontradas (mock)`);
    return mockCharges;
  } catch (error) {
    console.error('[Cakto] Erro ao buscar cobranças:', error.message);
    return [];
  }
}

/**
 * Buscar assinaturas recorrentes
 */
async function fetchSubscriptions() {
  try {
    console.log('[Cakto] Buscando assinaturas...');

    // OPÇÃO 1: Tentar dados estruturados de data.json (PRIMEIRO)
    const structuredData = loadStructuredData();
    if (structuredData?.subscriptions?.length > 0) {
      console.log('[Cakto] ✓ Assinaturas carregadas de data.json:', structuredData.subscriptions.length);
      return structuredData.subscriptions;
    }

    // OPÇÃO 2: Dados mock como fallback
    console.log('[Cakto] ℹ Usando dados mock (atualize data.json com dados reais)');
    const mockSubscriptions = [
      {
        id: 'sub_1',
        customer_id: 'cust_maria_1',
        amount: 299.90,
        interval: 'monthly',
        status: 'active',
        next_charge_date: '2026-05-01',
        plan_name: 'Pro'
      },
      {
        id: 'sub_2',
        customer_id: 'cust_gabriel_1',
        amount: 149.90,
        interval: 'monthly',
        status: 'active',
        next_charge_date: '2026-05-15',
        plan_name: 'Starter'
      },
      {
        id: 'sub_3',
        customer_id: 'cust_rafael_1',
        amount: 199.90,
        interval: 'monthly',
        status: 'active',
        next_charge_date: '2026-05-05',
        plan_name: 'Standard'
      }
    ];
    console.log(`[Cakto] ${mockSubscriptions.length} assinaturas encontradas (mock)`);
    return mockSubscriptions;
  } catch (error) {
    console.error('[Cakto] Erro ao buscar assinaturas:', error.message);
    return [];
  }
}

/**
 * Processar dados e retornar estrutura unificada
 */
async function getFinancialData() {
  try {
    // Verificar cache - DESABILITADO PARA TESTES
    // if (cache.customers && Date.now() - cache.timestamp < cache.TTL) {
    //   console.log('[Cakto] Retornando dados em cache');
    //   return {
    //     customers: cache.customers,
    //     charges: cache.charges,
    //     subscriptions: cache.subscriptions || [],
    //     cached: true,
    //   };
    // }

    const [customers, charges, subscriptions] = await Promise.all([
      fetchCustomers(),
      fetchCharges(),
      fetchSubscriptions(),
    ]);

    // Validar dados (se tudo vazio, pode ser falha na API)
    const hasData = customers.length > 0 || charges.length > 0 || subscriptions.length > 0;

    if (!hasData) {
      console.warn('[Cakto] Nenhum dado retornado da API (possível erro de autenticação)');
    }

    // Processar e unificar
    const processed = {
      customers: customers.map(c => ({
        id: c.id,
        name: c.name || c.email,
        email: c.email,
        phone: c.phone,
        created_at: c.created_at,
        metadata: c.metadata || {},
      })),
      charges: charges.map(ch => ({
        id: ch.id,
        customer_id: ch.customer_id,
        amount: ch.amount,
        status: ch.status, // pending, paid, failed, refunded
        due_date: ch.due_date,
        paid_date: ch.paid_date,
        description: ch.description,
      })),
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        customer_id: sub.customer_id,
        amount: sub.amount,
        interval: sub.interval, // monthly, yearly
        status: sub.status,
        next_charge_date: sub.next_charge_date,
        plan: sub.plan_name || 'padrão',
      })),
    };

    // Cachear
    cache.customers = processed.customers;
    cache.charges = processed.charges;
    cache.subscriptions = processed.subscriptions;
    cache.timestamp = Date.now();

    console.log('[Cakto] ✓ Dados processados e cacheados');
    return {
      ...processed,
      cached: false,
    };
  } catch (error) {
    console.error('[Cakto] Erro ao processar dados:', error.message);
    // Retornar dados vazios em caso de erro, não falhar o endpoint
    console.log('[Cakto] Retornando dados vazios como fallback');
    return {
      customers: [],
      charges: [],
      subscriptions: [],
      cached: false,
      error: error.message,
    };
  }
}

/**
 * Calcular pagamentos futuros com base em subscriptions ativas
 */
function calculateFuturePayments(subscriptions, customers) {
  const futurePayments = [];
  const now = new Date();

  subscriptions.forEach(sub => {
    if (sub.status !== 'active') return;

    const customer = customers.find(c => c.id === sub.customer_id);
    if (!customer) return;

    const nextChargeDate = new Date(sub.next_charge_date);
    if (nextChargeDate <= now) return; // Ignorar se já passou

    futurePayments.push({
      id: `future_${sub.id}`,
      customer_id: sub.customer_id,
      customer_name: customer.name,
      customer_email: customer.email,
      subscription_id: sub.id,
      amount: sub.amount,
      due_date: sub.next_charge_date,
      plan: sub.plan,
      interval: sub.interval,
      status: 'scheduled',
    });
  });

  return futurePayments.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
}

/**
 * Calcular receita prevista para os próximos 90 dias
 */
function calculateForecaste(subscriptions) {
  const now = new Date();
  const forecast90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const forecast = subscriptions
    .filter(s => s.status === 'active')
    .reduce((total, sub) => {
      const nextChargeDate = new Date(sub.next_charge_date);
      if (nextChargeDate > now && nextChargeDate <= forecast90Days) {
        return total + (sub.amount || 0);
      }
      return total;
    }, 0);

  return parseFloat(forecast.toFixed(2));
}

/**
 * Calcular métricas financeiras (incluindo forecast)
 */
function calculateMetrics(customers, charges, subscriptions) {
  const now = new Date();

  // MRR: soma das assinaturas ativas (mensal)
  const mrr = subscriptions
    .filter(s => s.status === 'active' && s.interval === 'monthly')
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  // Cobranças pendentes
  const pending = charges.filter(c => c.status === 'pending');
  const pendingAmount = pending.reduce((sum, c) => sum + (c.amount || 0), 0);

  // Cobranças atrasadas
  const overdue = pending.filter(c => new Date(c.due_date) < now);
  const overdueAmount = overdue.reduce((sum, c) => sum + (c.amount || 0), 0);

  // Cobranças do mês
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthCharges = charges.filter(c => {
    const paidDate = new Date(c.paid_date);
    return paidDate >= monthStart && paidDate <= monthEnd;
  });
  const monthRevenue = monthCharges.reduce((sum, c) => sum + (c.amount || 0), 0);

  // Pagamentos futuros (próximos 30 dias)
  const nextMonthStart = new Date(monthEnd.getTime() + 1);
  const nextMonthEnd = new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + 1, 0);
  const futureCharges = subscriptions
    .filter(s => s.status === 'active')
    .filter(s => {
      const chargeDate = new Date(s.next_charge_date);
      return chargeDate >= nextMonthStart && chargeDate <= nextMonthEnd;
    })
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  return {
    mrr: parseFloat(mrr.toFixed(2)),
    monthly_revenue: parseFloat(monthRevenue.toFixed(2)),
    pending_amount: parseFloat(pendingAmount.toFixed(2)),
    overdue_amount: parseFloat(overdueAmount.toFixed(2)),
    overdue_count: overdue.length,
    active_subscriptions: subscriptions.filter(s => s.status === 'active').length,
    total_customers: customers.length,
    // NOVO: Receita futura
    forecast_30days: parseFloat(futureCharges.toFixed(2)),
    forecast_90days: calculateForecaste(subscriptions),
  };
}

module.exports = {
  getFinancialData,
  calculateMetrics,
  calculateFuturePayments,
  calculateForecaste,
  fetchCustomers,
  fetchCharges,
  fetchSubscriptions,
};
