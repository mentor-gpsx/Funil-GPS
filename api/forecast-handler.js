/**
 * Forecast Handler - HTTP endpoints para previsões financeiras
 * Integra ForecastService com o servidor HTTP
 */

const { ForecastService } = require('./forecast-service');

let forecastService = null;

async function initForecastService(database) {
  /**
   * Inicializa o serviço de previsões com o banco
   */
  forecastService = new ForecastService(database);
  console.log('[ForecastHandler] ✅ Inicializado');
  return true;
}

async function handleDashboard(req, res) {
  /**
   * GET /api/forecast/dashboard
   * Retorna dados completos para o dashboard
   */
  try {
    if (!forecastService) {
      res.writeHead(503);
      return res.end(JSON.stringify({
        error: 'Forecast service not initialized'
      }));
    }

    const data = await forecastService.generateDashboardData();
    res.writeHead(200);
    res.end(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro no dashboard:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleCashFlow(req, res) {
  /**
   * GET /api/forecast/cashflow?days=30
   * Retorna previsão de fluxo de caixa
   */
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const days = parseInt(url.searchParams.get('days')) || 30;

    const forecast = await forecastService.getCashFlowForecast(days);
    res.writeHead(200);
    res.end(JSON.stringify(forecast, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro em cashflow:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleChurn(req, res) {
  /**
   * GET /api/forecast/churn?months=12
   * Retorna previsão de impacto de churn
   */
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const months = parseInt(url.searchParams.get('months')) || 12;

    const forecast = await forecastService.getChurnForecast(months);
    res.writeHead(200);
    res.end(JSON.stringify(forecast, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro em churn:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleGrowth(req, res) {
  /**
   * GET /api/forecast/growth?months=12&rate=0.1
   * Retorna previsão de crescimento
   */
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const months = parseInt(url.searchParams.get('months')) || 12;
    const rate = parseFloat(url.searchParams.get('rate')) || 0.1;

    const forecast = await forecastService.getGrowthForecast(months, rate);
    res.writeHead(200);
    res.end(JSON.stringify(forecast, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro em growth:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleAtRisk(req, res) {
  /**
   * GET /api/forecast/at-risk?days=30
   * Retorna clientes em risco
   */
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const days = parseInt(url.searchParams.get('days')) || 30;

    const customers = await forecastService.getAtRiskCustomers(days);
    res.writeHead(200);
    res.end(JSON.stringify(customers, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro em at-risk:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleAlerts(req, res) {
  /**
   * GET /api/forecast/alerts
   * Retorna alertas financeiros
   */
  try {
    const alerts = await forecastService.getAlerts();
    res.writeHead(200);
    res.end(JSON.stringify(alerts, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro em alerts:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleScenarios(req, res) {
  /**
   * GET /api/forecast/scenarios
   * Retorna simulação de cenários
   */
  try {
    const scenarios = await forecastService.simulateScenarios();
    res.writeHead(200);
    res.end(JSON.stringify(scenarios, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro em scenarios:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleClearCache(req, res) {
  /**
   * POST /api/forecast/cache-clear
   * Limpa o cache de previsões
   */
  try {
    if (forecastService) {
      forecastService.clearCache();
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, message: 'Cache cleared' }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleCustomersDetail(req, res) {
  /**
   * GET /api/forecast/customers
   * Retorna lista detalhada de clientes com histórico de pagamentos
   */
  try {
    if (!forecastService || !forecastService.db) {
      res.writeHead(503);
      return res.end(JSON.stringify({ error: 'Database not available' }));
    }

    const db = forecastService.db;

    // Pegar clientes
    const customers = await db.all(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.created_at,
        COUNT(DISTINCT ch.id) as total_charges,
        COUNT(DISTINCT CASE WHEN ch.status = 'paid' THEN ch.id END) as paid_charges,
        COUNT(DISTINCT CASE WHEN ch.status = 'pending' THEN ch.id END) as pending_charges,
        COUNT(DISTINCT CASE WHEN ch.status = 'failed' THEN ch.id END) as failed_charges,
        COALESCE(SUM(CASE WHEN ch.status = 'paid' THEN ch.amount ELSE 0 END), 0) as total_paid,
        COUNT(DISTINCT s.id) as active_subscriptions,
        COALESCE(SUM(s.amount), 0) as subscription_mrr
      FROM customers c
      LEFT JOIN charges ch ON c.id = ch.customer_id
      LEFT JOIN subscriptions s ON c.id = s.customer_id AND s.status = 'active'
      GROUP BY c.id
      ORDER BY total_paid DESC
    `) || [];

    // Pegar histórico de pagamentos para cada cliente
    const customersWithHistory = await Promise.all(customers.map(async (customer) => {
      const charges = await db.all(
        'SELECT id, amount, status, payment_method, due_date, paid_date, created_at FROM charges WHERE customer_id = ? ORDER BY created_at DESC',
        [customer.id]
      ) || [];

      const subscriptions = await db.all(
        'SELECT id, amount, status, plan, next_charge_date, created_at FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC',
        [customer.id]
      ) || [];

      return {
        ...customer,
        charges,
        subscriptions
      };
    }));

    res.writeHead(200);
    res.end(JSON.stringify(customersWithHistory, null, 2));
  } catch (error) {
    console.error('[ForecastHandler] Erro em customers:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

module.exports = {
  initForecastService,
  handleDashboard,
  handleCashFlow,
  handleChurn,
  handleGrowth,
  handleAtRisk,
  handleAlerts,
  handleScenarios,
  handleClearCache,
  handleCustomersDetail
};
