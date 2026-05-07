/**
 * Seed Database - Popula banco com dados de teste
 * Execute: node api/seed-database.js
 */

const { Database } = require('./database-schema');

async function seedDatabase() {
  try {
    const db = new Database();
    await db.init();

    console.log('[Seed] 🌱 Iniciando população do banco...\n');

    // ════════════════════════════════════════════════════════════════
    // CLIENTES DE TESTE
    // ════════════════════════════════════════════════════════════════

    const customers = [
      {
        id: 'cust-001',
        name: 'Acme Corporation',
        email: 'contact@acme.com',
        phone: '11987654321',
        created_at: '2026-01-15',
        source: 'manual'
      },
      {
        id: 'cust-002',
        name: 'Tech Startup Inc',
        email: 'hello@techstartup.com',
        phone: '11987654322',
        created_at: '2026-02-01',
        source: 'manual'
      },
      {
        id: 'cust-003',
        name: 'Global Services Ltd',
        email: 'info@globalservices.com',
        phone: '11987654323',
        created_at: '2026-02-15',
        source: 'manual'
      },
      {
        id: 'cust-004',
        name: 'Digital Solutions',
        email: 'sales@digitalsolutions.com',
        phone: '11987654324',
        created_at: '2026-03-01',
        source: 'manual'
      },
      {
        id: 'cust-005',
        name: 'Cloud Consulting',
        email: 'contact@cloudconsulting.com',
        phone: '11987654325',
        created_at: '2026-03-10',
        source: 'manual'
      }
    ];

    console.log('📝 Inserindo clientes...');
    for (const customer of customers) {
      await db.upsertCustomer(customer);
    }
    console.log(`✅ ${customers.length} clientes inseridos\n`);

    // ════════════════════════════════════════════════════════════════
    // COBRANÇAS (PAGAMENTOS)
    // ════════════════════════════════════════════════════════════════

    const charges = [
      // Cliente 1 - Múltiplos pagamentos
      {
        id: 'chg-001',
        customer_id: 'cust-001',
        customer_name: 'Acme Corporation',
        amount: 5000,
        status: 'paid',
        payment_method: 'pix',
        reference: 'ref-001',
        due_date: '2026-04-01',
        paid_date: '2026-04-02',
        created_at: '2026-03-25'
      },
      {
        id: 'chg-002',
        customer_id: 'cust-001',
        customer_name: 'Acme Corporation',
        amount: 5000,
        status: 'paid',
        payment_method: 'pix',
        reference: 'ref-002',
        due_date: '2026-03-01',
        paid_date: '2026-03-02',
        created_at: '2026-02-25'
      },
      // Cliente 2 - Alguns pagos
      {
        id: 'chg-003',
        customer_id: 'cust-002',
        customer_name: 'Tech Startup Inc',
        amount: 3500,
        status: 'paid',
        payment_method: 'cc',
        reference: 'ref-003',
        due_date: '2026-04-05',
        paid_date: '2026-04-06',
        created_at: '2026-03-30'
      },
      {
        id: 'chg-004',
        customer_id: 'cust-002',
        customer_name: 'Tech Startup Inc',
        amount: 3500,
        status: 'pending',
        payment_method: 'boleto',
        reference: 'ref-004',
        due_date: '2026-05-05',
        paid_date: null,
        created_at: '2026-04-20'
      },
      // Cliente 3 - Padrão
      {
        id: 'chg-005',
        customer_id: 'cust-003',
        customer_name: 'Global Services Ltd',
        amount: 8000,
        status: 'paid',
        payment_method: 'transferencia',
        reference: 'ref-005',
        due_date: '2026-04-10',
        paid_date: '2026-04-10',
        created_at: '2026-03-20'
      },
      {
        id: 'chg-006',
        customer_id: 'cust-003',
        customer_name: 'Global Services Ltd',
        amount: 8000,
        status: 'paid',
        payment_method: 'transferencia',
        reference: 'ref-006',
        due_date: '2026-03-10',
        paid_date: '2026-03-10',
        created_at: '2026-02-20'
      },
      // Cliente 4 - Bom pagador
      {
        id: 'chg-007',
        customer_id: 'cust-004',
        customer_name: 'Digital Solutions',
        amount: 6500,
        status: 'paid',
        payment_method: 'pix',
        reference: 'ref-007',
        due_date: '2026-04-15',
        paid_date: '2026-04-15',
        created_at: '2026-03-15'
      },
      {
        id: 'chg-008',
        customer_id: 'cust-004',
        customer_name: 'Digital Solutions',
        amount: 6500,
        status: 'paid',
        payment_method: 'pix',
        reference: 'ref-008',
        due_date: '2026-03-15',
        paid_date: '2026-03-15',
        created_at: '2026-02-15'
      },
      // Cliente 5 - Novo cliente
      {
        id: 'chg-009',
        customer_id: 'cust-005',
        customer_name: 'Cloud Consulting',
        amount: 4200,
        status: 'paid',
        payment_method: 'cc',
        reference: 'ref-009',
        due_date: '2026-04-20',
        paid_date: '2026-04-20',
        created_at: '2026-03-10'
      },
      // Um cliente em atraso (risco)
      {
        id: 'chg-010',
        customer_id: 'cust-002',
        customer_name: 'Tech Startup Inc',
        amount: 1500,
        status: 'failed',
        payment_method: 'boleto',
        reference: 'ref-010',
        due_date: '2026-03-20',
        paid_date: null,
        created_at: '2026-03-01'
      }
    ];

    console.log('💳 Inserindo cobranças...');
    for (const charge of charges) {
      await db.upsertCharge(charge);
    }
    console.log(`✅ ${charges.length} cobranças inseridas\n`);

    // ════════════════════════════════════════════════════════════════
    // ASSINATURAS (RECEITA RECORRENTE)
    // ════════════════════════════════════════════════════════════════

    const subscriptions = [
      {
        id: 'sub-001',
        customer_id: 'cust-001',
        amount: 2500,
        status: 'active',
        plan: 'Enterprise',
        next_charge_date: '2026-05-15',
        created_at: '2026-01-15'
      },
      {
        id: 'sub-002',
        customer_id: 'cust-002',
        amount: 1500,
        status: 'active',
        plan: 'Professional',
        next_charge_date: '2026-05-05',
        created_at: '2026-02-01'
      },
      {
        id: 'sub-003',
        customer_id: 'cust-003',
        amount: 4000,
        status: 'active',
        plan: 'Enterprise',
        next_charge_date: '2026-05-10',
        created_at: '2026-02-15'
      },
      {
        id: 'sub-004',
        customer_id: 'cust-004',
        amount: 3000,
        status: 'active',
        plan: 'Professional',
        next_charge_date: '2026-05-15',
        created_at: '2026-03-01'
      },
      {
        id: 'sub-005',
        customer_id: 'cust-005',
        amount: 2000,
        status: 'active',
        plan: 'Starter',
        next_charge_date: '2026-05-10',
        created_at: '2026-03-10'
      },
      // Uma assinatura cancelada (impacto de churn)
      {
        id: 'sub-006',
        customer_id: 'cust-001',
        amount: 1000,
        status: 'cancelled',
        plan: 'Starter',
        next_charge_date: null,
        created_at: '2025-12-01'
      }
    ];

    console.log('📅 Inserindo assinaturas...');
    for (const sub of subscriptions) {
      await db.upsertSubscription(sub);
    }
    console.log(`✅ ${subscriptions.length} assinaturas inseridas\n`);

    console.log(`
${'='.repeat(60)}
✅ BANCO POPULADO COM SUCESSO
${'='.repeat(60)}

📊 Resumo:
  • Clientes: ${customers.length}
  • Cobranças: ${charges.length}
  • Assinaturas: ${subscriptions.length}

🔍 Acessar Dashboard:
  → http://localhost:3001/financial-dashboard.html

💡 Dados de Teste:
  • MRR projetado: R$ 13.000/mês (5 subs ativas)
  • Receita total paga: R$ ${charges.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR')}
  • Taxa de sucesso: ${(charges.filter(c => c.status === 'paid').length / charges.length * 100).toFixed(1)}%
  • Taxa de churn: ${(1 / subscriptions.length * 100).toFixed(2)}%
  • Cliente em risco: Tech Startup Inc (atraso de 35 dias)

${'='.repeat(60)}
`);

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('[Seed] ❌ Erro:', error);
    process.exit(1);
  }
}

seedDatabase();
