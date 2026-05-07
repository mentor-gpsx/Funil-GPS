#!/usr/bin/env node

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { SyncService } = require('./api/sync-service');
const { Database } = require('./api/database-schema');
const { initForecastService } = require('./api/forecast-handler');
const { ImportHandler } = require('./api/import-handler');
const { AutoSyncService } = require('./api/auto-sync-service');
const { CaktoScheduler } = require('./api/cakto-scheduler');
const { WebhookHandler } = require('./api/webhook-handler');
const { CaktoAutoSync } = require('./api/cakto-auto-sync');
const { CaktoCookieSync } = require('./api/cakto-cookie-sync');
const { AuditService } = require('./api/audit-service');
const { AdvancedAuditEngine } = require('./api/advanced-audit-engine');

const PORT = 3001;
const HOST = 'localhost';

// Inicializar banco de dados
let database = null;
let autoSync = null;
let caktoScheduler = null;
let webhookHandler = null;
let caktoAutoSync = null;
let caktoCookieSync = null;
let auditService = null;
let advancedAuditEngine = null;

async function initializeServices() {
  try {
    // Inicializar database
    database = new Database();
    await database.init();
    console.log('[Server] ✅ Database inicializado');

    // Inicializar forecast service
    await initForecastService(database);
    console.log('[Server] ✅ Forecast Service inicializado');

    // Inicializar sincronização automática
    const syncService = new SyncService({ interval: 15 * 60 * 1000 }); // 15 minutos
    syncService.start();
    console.log('[Server] ✅ Sync Service iniciado');

    // Inicializar auto-sync para dados importados
    autoSync = new AutoSyncService(database.db);
    autoSync.start();
    console.log('[Server] ✅ Auto Sync Service iniciado');

    // Inicializar webhook handler para sincronização em tempo real
    webhookHandler = new WebhookHandler(database.db);
    console.log('[Server] ✅ Webhook Handler inicializado');

    // Inicializar serviço de auditoria financeira
    auditService = new AuditService(database.db);
    console.log('[Server] ✅ Audit Service inicializado');

    // Inicializar engine de auditoria avançada (multi-agente)
    advancedAuditEngine = new AdvancedAuditEngine(database.db);
    console.log('[Server] ✅ Advanced Audit Engine inicializado');

    // Inicializar Cakto Cookie Sync (mais confiável com Cloudflare)
    caktoCookieSync = new CaktoCookieSync(database.db, {
      dashUrl: 'https://app.cakto.com.br/dashboard/my-sales?tab=paid',
      syncInterval: 5 * 60 * 1000 // 5 minutos
    });

    // Se houver cookies no env, inicializa; senão aguarda configuração
    if (process.env.CAKTO_COOKIES) {
      caktoCookieSync.setCookies(process.env.CAKTO_COOKIES);
      await caktoCookieSync.start();
      console.log('[Server] ✅ Cakto Cookie Sync iniciado');
    } else {
      console.log('[Server] ⏸️  Cakto Cookie Sync aguardando cookies (veja /api/setup-cookies)');
    }

    // Inicializar scheduler Cakto (traz dados a cada 15 min)
    // DESABILITADO: API Cakto não expõe endpoints públicos
    // if (process.env.CAKTO_CLIENT_ID) {
    //   caktoScheduler = new CaktoScheduler(database.db);
    //   caktoScheduler.start();
    //   console.log('[Server] ✅ Cakto Scheduler iniciado');
    // }
  } catch (error) {
    console.error('[Server] ❌ Erro ao inicializar serviços:', error);
  }
}

// Inicializa serviços antes de criar o servidor
initializeServices();

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API endpoints
  if (pathname === '/api/permissions') {
    if (req.method === 'GET') {
      return res.end(JSON.stringify([
        {
          id: 'user-1',
          email: 'maria@example.com',
          seller_key: 'maria-1',
          display_name: 'Maria Eduarda',
          permissions: { view: true, edit: true }
        },
        {
          id: 'user-2',
          email: 'gabriel@example.com',
          seller_key: 'gabriel-1',
          display_name: 'Gabriel',
          permissions: { view: true, edit: true }
        }
      ]));
    }
    if (req.method === 'PATCH') {
      return res.end(JSON.stringify({ ok: true }));
    }
  }

  if (pathname === '/api/profile') {
    return res.end(JSON.stringify({
      id: 'user-1',
      email: 'user@example.com',
      display_name: 'Usuário',
      role: 'admin'
    }));
  }

  if (pathname === '/api/tasks') {
    return res.end(JSON.stringify([
      {
        id: 'task-1',
        title: 'Deal 1',
        value: 50000,
        stage: 'fechado',
        seller: 'Maria'
      }
    ]));
  }

  if (pathname === '/api/roleta/grant' && req.method === 'POST') {
    return res.end(JSON.stringify({ ok: true }));
  }

  if (pathname === '/api/roleta/revoke' && req.method === 'POST') {
    return res.end(JSON.stringify({ ok: true }));
  }

  // NEW: Funil por Usuário (Nova Estrutura)
  if (pathname === '/api/funil-by-user' && req.method === 'GET') {
    const funilByUserHandler = require('./api/funil-by-user');
    return funilByUserHandler(req, res);
  }

  // NEW: Tab Permissions (Gerenciar Permissões)
  if (pathname === '/api/tab-permissions') {
    const tabPermissionsHandler = require('./api/tab-permissions');
    return tabPermissionsHandler(req, res);
  }

  // NEW: Sincronização manual
  if (pathname === '/api/sync-now' && req.method === 'POST') {
    syncService.sync().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Sincronização iniciada' }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
    return;
  }

  // NEW: Status da sincronização
  if (pathname === '/api/sync-status') {
    const status = syncService.getStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...status, service_running: syncService.isRunning }));
    return;
  }

  // NEW: Importar dados Cakto
  if (pathname === '/api/import/data' && req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const importHandler = new ImportHandler(database.db);
        const data = JSON.parse(body);

        const results = {
          customers: { inserted: 0, errors: [] },
          charges: { inserted: 0, errors: [] },
          subscriptions: { inserted: 0, errors: [] }
        };

        if (data.customers && Array.isArray(data.customers)) {
          results.customers = await importHandler.importCustomers(data.customers);
        }
        if (data.charges && Array.isArray(data.charges)) {
          results.charges = await importHandler.importCharges(data.charges);
        }
        if (data.subscriptions && Array.isArray(data.subscriptions)) {
          results.subscriptions = await importHandler.importSubscriptions(data.subscriptions);
        }

        console.log('[Import] ✅ Importação concluída:', results);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...results }));
      } catch (error) {
        console.error('[Import] ❌ Erro:', error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // NEW: Download template de importação
  if (pathname === '/api/import/template' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ImportHandler.generateTemplate(), null, 2));
    return;
  }

  // NEW: Obter dados importados do banco de dados
  if (pathname === '/api/import/list' && req.method === 'GET') {
    if (!database || !database.db) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Database not initialized' }));
      return;
    }
    database.db.all(`SELECT * FROM customers WHERE source = 'import_manual' ORDER BY created_at DESC`, [], (err, customers) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
      database.db.all(`SELECT * FROM charges WHERE source = 'import_manual' ORDER BY created_at DESC`, [], (err, charges) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
          return;
        }
        database.db.all(`SELECT * FROM subscriptions WHERE source = 'import_manual' ORDER BY created_at DESC`, [], (err, subscriptions) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            imported_data: {
              customers: (customers || []).map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, created_at: c.created_at })),
              charges: (charges || []).map(c => ({ id: c.id, customer_id: c.customer_id, amount: c.amount, status: c.status, payment_method: c.payment_method, due_date: c.due_date, paid_date: c.paid_date, created_at: c.created_at })),
              subscriptions: (subscriptions || []).map(s => ({ id: s.id, customer_id: s.customer_id, amount: s.amount, status: s.status, plan: s.plan, next_charge_date: s.next_charge_date, created_at: s.created_at }))
            },
            summary: {
              total_customers: (customers || []).length,
              total_charges: (charges || []).length,
              total_subscriptions: (subscriptions || []).length,
              total_revenue: (charges || []).reduce((sum, c) => sum + (c.status === 'paid' ? c.amount : 0), 0),
              pending_revenue: (charges || []).reduce((sum, c) => sum + (c.status === 'pending' ? c.amount : 0), 0)
            }
          }));
        });
      });
    });
    return;
  }

  // Clear internal cache for testing
  if (pathname === '/api/cache-clear') {
    delete require.cache[require.resolve('./api/cakto')];
    const cakto = require('./api/cakto');
    // Force cache reset by accessing the module
    return res.end(JSON.stringify({ ok: true, message: 'Cache cleared' }));
  }

  // NEW: Dashboard Financeiro
  if (pathname === '/api/dashboard-finance' && req.method === 'GET') {
    delete require.cache[require.resolve('./api/dashboard-finance')];
    delete require.cache[require.resolve('./api/cakto')];
    const { getDashboardFinance } = require('./api/dashboard-finance');
    return getDashboardFinance(req, res);
  }

  // NEW: Minhas Vendas (agrupadas por etapa)
  if (pathname === '/api/minhas-vendas' && req.method === 'GET') {
    delete require.cache[require.resolve('./api/clickup')];
    const { loadDistribuicao } = require('./api/clickup');
    return loadDistribuicao().then(data => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
  }

  // NEW: Funil por Usuário (agrupadas por vendedor)
  if (pathname === '/api/funil-usuario' && req.method === 'GET') {
    delete require.cache[require.resolve('./api/clickup')];
    const { loadFunilByUser } = require('./api/clickup');
    return loadFunilByUser().then(data => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
  }

  // NEW: Salvar dados estruturados
  if (pathname === '/api/save-data' && req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        if (!body || body.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Corpo vazio' }));
          return;
        }
        const data = JSON.parse(body);
        const dataPath = path.join(__dirname, 'api/data.json');
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
        console.log('[API] Dados salvos em data.json');

        // Limpar cache para recarregar dados
        delete require.cache[require.resolve('./api/cakto')];
        delete require.cache[require.resolve('./api/dashboard-finance')];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Dados salvos com sucesso!' }));
      } catch (err) {
        console.error('[API] Erro ao salvar:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // NEW: Recuperar dados atuais
  if (pathname === '/api/get-data' && req.method === 'GET') {
    try {
      const dataPath = path.join(__dirname, 'api/data.json');
      if (fs.existsSync(dataPath)) {
        const content = fs.readFileSync(dataPath, 'utf8');
        const data = JSON.parse(content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Nenhum dado encontrado' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // NEW: Serve Cakto Espelho
  if (pathname === '/cakto-espelho.html') {
    const espelhoPath = path.join(__dirname, 'cakto-espelho.html');
    if (fs.existsSync(espelhoPath)) {
      const content = fs.readFileSync(espelhoPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  // NEW: Financial Forecast Endpoints
  if (pathname.startsWith('/api/forecast/')) {
    const forecastHandlers = require('./api/forecast-handler');

    if (pathname === '/api/forecast/dashboard') {
      return forecastHandlers.handleDashboard(req, res);
    } else if (pathname === '/api/forecast/cashflow') {
      return forecastHandlers.handleCashFlow(req, res);
    } else if (pathname === '/api/forecast/churn') {
      return forecastHandlers.handleChurn(req, res);
    } else if (pathname === '/api/forecast/growth') {
      return forecastHandlers.handleGrowth(req, res);
    } else if (pathname === '/api/forecast/at-risk') {
      return forecastHandlers.handleAtRisk(req, res);
    } else if (pathname === '/api/forecast/alerts') {
      return forecastHandlers.handleAlerts(req, res);
    } else if (pathname === '/api/forecast/scenarios') {
      return forecastHandlers.handleScenarios(req, res);
    } else if (pathname === '/api/forecast/cache-clear' && req.method === 'POST') {
      return forecastHandlers.handleClearCache(req, res);
    } else if (pathname === '/api/forecast/customers') {
      return forecastHandlers.handleCustomersDetail(req, res);
    }
  }

  // NEW: Endpoint de status de sincronização
  if (pathname === '/api/sync-stats' && req.method === 'GET') {
    if (!autoSync) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'AutoSync not initialized' }));
      return;
    }
    autoSync.getStats((err, stats) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats }));
    });
    return;
  }

  // NEW: Endpoint de auditoria financeira completa
  if (pathname === '/api/audit/run' && req.method === 'GET') {
    if (!auditService) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'AuditService not initialized' }));
      return;
    }

    (async () => {
      try {
        const fullReport = await auditService.runFullAudit();
        const displayReport = auditService.formatReportForDisplay(fullReport);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          audit: displayReport
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    })();
    return;
  }

  // NEW: Endpoint de status de auditoria (cached)
  if (pathname === '/api/audit/status' && req.method === 'GET') {
    if (!auditService) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'AuditService not initialized' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Audit service is available. Use /api/audit/run to execute a full audit.'
    }));
    return;
  }

  // NEW: Endpoint para obter todas as charges (Minhas Vendas)
  if (pathname === '/api/charges' && req.method === 'GET') {
    if (!database || !database.db) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Database not initialized' }));
      return;
    }

    database.db.all(`
      SELECT
        ch.id,
        ch.customer_id,
        c.name as customer_name,
        c.email,
        ch.amount,
        ch.status,
        ch.payment_method,
        ch.paid_date,
        ch.created_at,
        ch.source
      FROM charges ch
      JOIN customers c ON ch.customer_id = c.id
      ORDER BY ch.paid_date DESC
    `, [], (err, charges) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(charges || []));
    });
    return;
  }

  // NEW: Endpoint para obter saques (Financeiro)
  if (pathname === '/api/saques' && req.method === 'GET') {
    if (!database || !database.db) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Database not initialized' }));
      return;
    }

    // Tenta buscar da tabela saques; se não existir, retorna array vazio
    database.db.all(`
      SELECT
        id,
        data as date,
        amount,
        status,
        descricao as notes
      FROM saques
      ORDER BY data DESC
    `, [], (err, saques) => {
      if (err) {
        // Tabela não existe, retornar array vazio ou dados simulados
        console.log('[API] Tabela saques não existe ou erro:', err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(saques || []));
    });
    return;
  }

  // NEW: Endpoint para auditoria avançada com múltiplos agentes
  if (pathname === '/api/audit/advanced' && req.method === 'GET') {
    if (!advancedAuditEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'AdvancedAuditEngine not initialized' }));
      return;
    }

    (async () => {
      try {
        const auditResult = await advancedAuditEngine.executeFullAudit();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: auditResult
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    })();
    return;
  }

  // NEW: Webhook endpoint para sincronização em tempo real da Cakto
  if (pathname === '/api/webhook/cakto' && req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        if (!webhookHandler) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'WebhookHandler not initialized' }));
          return;
        }

        const payload = JSON.parse(body);
        console.log('[Webhook] 🔄 Recebido evento da Cakto:', payload.event || 'unknown');

        const result = await webhookHandler.handleCaktoWebhook(payload);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Webhook processado com sucesso', data: result }));
      } catch (error) {
        console.error('[Webhook] ❌ Erro ao processar webhook:', error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // NEW: Endpoint para obter todos os dados (webhook + manual)
  if (pathname === '/api/all-data' && req.method === 'GET') {
    if (!database || !database.db) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Database not initialized' }));
      return;
    }

    database.db.all(`SELECT * FROM customers ORDER BY created_at DESC`, [], (err, customers) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
      database.db.all(`SELECT * FROM charges ORDER BY created_at DESC`, [], (err, charges) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
          return;
        }
        database.db.all(`SELECT * FROM subscriptions ORDER BY created_at DESC`, [], (err, subscriptions) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            summary: {
              total_customers: customers.length,
              total_charges: charges.length,
              total_subscriptions: subscriptions.length,
              total_revenue_paid: charges.reduce((sum, c) => sum + (c.status === 'paid' ? c.amount : 0), 0),
              total_revenue_pending: charges.reduce((sum, c) => sum + (c.status === 'pending' ? c.amount : 0), 0)
            },
            data: {
              customers: customers.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, source: c.source, created_at: c.created_at })),
              charges: charges.map(c => ({ id: c.id, customer_id: c.customer_id, customer_name: c.customer_name, amount: c.amount, status: c.status, payment_method: c.payment_method, source: c.source, created_at: c.created_at })),
              subscriptions: subscriptions.map(s => ({ id: s.id, customer_id: s.customer_id, amount: s.amount, status: s.status, plan: s.plan, source: s.source, created_at: s.created_at }))
            }
          }));
        });
      });
    });
    return;
  }

  // NEW: Serve Financial Dashboard
  if (pathname === '/financial-dashboard.html') {
    const dashboardPath = path.join(__dirname, 'financial-dashboard.html');
    if (fs.existsSync(dashboardPath)) {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  // NEW: Serve Dashboard de Sincronização
  if (pathname === '/dashboard-sync.html') {
    const dashboardPath = path.join(__dirname, 'dashboard-sync.html');
    if (fs.existsSync(dashboardPath)) {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  // NEW: Serve Dashboard GPSX Completo
  if (pathname === '/dashboard-gpsx.html' || pathname === '/dashboard-completo.html') {
    const dashboardPath = path.join(__dirname, 'dashboard-gpsx-completo.html');
    if (fs.existsSync(dashboardPath)) {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  // NEW: Serve Audit Dashboard
  if (pathname === '/audit-dashboard.html' || pathname === '/auditoria.html') {
    const dashboardPath = path.join(__dirname, 'audit-dashboard.html');
    if (fs.existsSync(dashboardPath)) {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  if (pathname === '/reconciliation-dashboard.html' || pathname === '/reconciliacao.html') {
    const dashboardPath = path.join(__dirname, 'reconciliation-dashboard.html');
    if (fs.existsSync(dashboardPath)) {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  // NEW: Serve Advanced Audit Dashboard
  if (pathname === '/advanced-audit-dashboard.html' || pathname === '/auditoria-avancada.html' || pathname === '/audit-avancado.html') {
    const dashboardPath = path.join(__dirname, 'advanced-audit-dashboard.html');
    if (fs.existsSync(dashboardPath)) {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  // NEW: Serve clients data JSON
  if (pathname === '/clients-data.json') {
    const dataPath = path.join(__dirname, 'clients-data.json');
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200);
      res.end(content);
      return;
    }
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'funil.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Check if file exists
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath);

      let contentType = 'text/plain';
      if (ext === '.html') contentType = 'text/html; charset=utf-8';
      else if (ext === '.js') contentType = 'application/javascript';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.json') contentType = 'application/json';

      res.setHeader('Content-Type', contentType);
      res.writeHead(200);
      res.end(content);
      return;
    } catch (err) {
      res.writeHead(500);
      res.end('Internal error');
      return;
    }
  }

  // Cakto Cookie Sync Setup
  if (pathname === '/api/setup-cookies') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { cookies } = JSON.parse(body);
          caktoCookieSync.setCookies(JSON.stringify(cookies));
          if (!caktoCookieSync.running) {
            caktoCookieSync.start();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Cookies configuradas e sincronização iniciada' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }
    // GET: Mostra instruções
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="UTF-8"><title>Setup Cakto</title></head>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>🔐 Configurar Sincronização Cakto</h1>
        <p>Execute o script para extrair cookies:</p>
        <pre style="background: #f0f0f0; padding: 10px; border-radius: 5px;">
node get-cakto-cookies.js
        </pre>
        <p>Ou cole as cookies aqui:</p>
        <textarea id="cookies" style="width: 100%; height: 100px; font-family: monospace;"></textarea>
        <br><br>
        <button onclick="sendCookies()" style="padding: 10px 20px; font-size: 1em;">✅ Configurar</button>
        <script>
          async function sendCookies() {
            const cookies = JSON.parse(document.getElementById('cookies').value);
            const res = await fetch('/api/setup-cookies', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cookies })
            });
            const json = await res.json();
            alert(json.message || json.error);
            if (json.success) window.location.href = '/dashboard-sync.html';
          }
        </script>
      </body>
      </html>
    `);
  }

  // Cakto Cookie Sync Status
  if (pathname === '/api/cakto-sync-status') {
    if (!caktoCookieSync) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'not_initialized' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(caktoCookieSync.getStatus()));
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Funil de Vendas + Dashboard Financeiro');
  console.log('='.repeat(60));
  console.log(`\n🌐 Dashboards:`);
  console.log(`  • http://${HOST}:${PORT}/dashboard-interactive.html`);
  console.log(`  • http://${HOST}:${PORT}/dashboard-gpsx.html (Completo)`);
  console.log(`  • http://${HOST}:${PORT}/audit-dashboard.html (Auditoria)`);
  console.log(`  • http://${HOST}:${PORT}/advanced-audit-dashboard.html (🆕 Auditoria Avançada com Múltiplos Agentes)`);
  console.log(`  • http://${HOST}:${PORT}/reconciliation-dashboard.html (Reconciliação)`);
  console.log(`  • http://${HOST}:${PORT}/cakto-espelho.html`);
  console.log(`  • http://${HOST}:${PORT}/financial-dashboard.html`);
  console.log(`\n📡 APIs Financeiras:`);
  console.log('  • GET  /api/forecast/dashboard');
  console.log('  • GET  /api/forecast/cashflow');
  console.log('  • GET  /api/forecast/churn');
  console.log('  • GET  /api/forecast/growth');
  console.log('  • GET  /api/forecast/at-risk');
  console.log('  • GET  /api/forecast/alerts');
  console.log('  • GET  /api/forecast/scenarios');
  console.log('\n🔍 APIs de Auditoria & Reconciliação:');
  console.log('  • GET  /api/audit/run (Executa auditoria completa)');
  console.log('  • GET  /api/audit/advanced (🆕 Auditoria Avançada com 5 Agentes Especializados)');
  console.log('  • GET  /api/audit/status (Status da auditoria)');
  console.log('  • GET  /api/charges (Lista pagamentos aprovados)');
  console.log('  • GET  /api/saques (Lista saques realizados)');
  console.log(`\n⏹️  Para parar: Pressione Ctrl+C\n`);
});

process.on('SIGINT', () => {
  console.log('\n[Server] 🛑 Encerrando serviços...');
  if (caktoAutoSync) caktoAutoSync.stop();
  if (caktoCookieSync) caktoCookieSync.stop();
  console.log('[Server] ✅ Servidor parado');
  process.exit(0);
});
