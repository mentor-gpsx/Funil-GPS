/**
 * Forecast Service - Orchestração de previsões financeiras
 * Integra FinancialModel com ConsistencyService e cache
 */

const { FinancialModel } = require('./financial-model');

class ForecastService {
  constructor(database) {
    this.db = database;
    this.model = new FinancialModel();
    this.cache = new Map();
    this.cacheExpiration = 5 * 60 * 1000; // 5 minutos
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CACHE COM EXPIRAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  cacheKey(type, days = null) {
    return `forecast_${type}${days ? `_${days}d` : ''}`;
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.cacheExpiration) {
      this.cache.delete(key);
      return null;
    }
    return cached.data;
  }

  setCached(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS DO BANCO
  // ══════════════════════════════════════════════════════════════════════════

  async fetchData() {
    /**
     * Puxa dados do banco (fonte de verdade)
     */
    try {
      const customers = await this.db.all('SELECT * FROM customers');
      const charges = await this.db.all('SELECT * FROM charges');
      const subscriptions = await this.db.all('SELECT * FROM subscriptions');

      return { customers, charges, subscriptions };
    } catch (error) {
      console.error('[ForecastService] Erro ao buscar dados:', error);
      return { customers: [], charges: [], subscriptions: [] };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RELATÓRIO FINANCEIRO CONSOLIDADO
  // ══════════════════════════════════════════════════════════════════════════

  async generateDashboardData() {
    /**
     * Retorna todos os dados que o dashboard precisa
     * Única chamada necessária para carregar dashboard completo
     */
    const cacheKey = this.cacheKey('dashboard');
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { customers, charges, subscriptions } = await this.fetchData();

    const data = {
      timestamp: new Date().toISOString(),

      // ─────────────────────────────────────────────────────────────
      // VISÃO GERAL (KPIs Principais)
      // ─────────────────────────────────────────────────────────────
      overview: {
        activeCustomers: customers.length,
        totalRevenue: this.model.formatCurrency(
          this.model.calculateGrossRevenue(charges)
        ),
        netRevenue: this.model.formatCurrency(
          this.model.calculateNetRevenue(charges)
        ),
        mrr: this.model.formatCurrency(
          this.model.calculateMRR(subscriptions)
        ),
        arr: this.model.formatCurrency(
          this.model.calculateARR(subscriptions)
        ),
        avgCustomerValue: this.model.formatCurrency(
          this.model.calculateAverageCustomerValue(charges, customers)
        ),
        paymentSuccessRate: this.model.formatPercentage(
          this.model.calculatePaymentSuccess(charges)
        ),
        churnRate: this.model.formatPercentage(
          this.model.calculateChurnRate(subscriptions)
        )
      },

      // ─────────────────────────────────────────────────────────────
      // BREAKDOWN DE CUSTOS
      // ─────────────────────────────────────────────────────────────
      costBreakdown: this._formatCostBreakdown(
        this.model.calculateCostBreakdown(charges)
      ),

      // ─────────────────────────────────────────────────────────────
      // SAÚDE FINANCEIRA
      // ─────────────────────────────────────────────────────────────
      health: this.model.assessFinancialHealth(customers, charges, subscriptions),

      // ─────────────────────────────────────────────────────────────
      // PREVISÕES
      // ─────────────────────────────────────────────────────────────
      forecasts: {
        cashFlow30Days: this.model.projectCashFlow(subscriptions, 30),
        churnImpact12Months: this.model.projectChurnImpact(subscriptions, 12),
        growthProjection12Months: this.model.projectGrowth(subscriptions, charges, 12, 0.1)
      },

      // ─────────────────────────────────────────────────────────────
      // ALERTAS (Clientes em risco)
      // ─────────────────────────────────────────────────────────────
      alerts: {
        atRiskCustomers: this.model.identifyAtRiskCustomers(charges, 30),
        criticalCount: this.model.identifyAtRiskCustomers(charges, 30).filter(
          c => c.risk_level === 'Alto'
        ).length
      }
    };

    this.setCached(cacheKey, data);
    return data;
  }

  _formatCostBreakdown(breakdown) {
    /**
     * Formata o breakdown de custos para exibição
     */
    return {
      paymentMethods: this.model.formatCurrency(breakdown.paymentMethods),
      installments: this.model.formatCurrency(breakdown.installments),
      irrf: this.model.formatCurrency(breakdown.irrf),
      inss: this.model.formatCurrency(breakdown.inss),
      iss: this.model.formatCurrency(breakdown.iss),
      total: this.model.formatCurrency(breakdown.total),
      percentage: breakdown.percentage
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PREVISÕES ESPECÍFICAS
  // ══════════════════════════════════════════════════════════════════════════

  async getCashFlowForecast(days = 30) {
    /**
     * Previsão de fluxo de caixa
     */
    const cacheKey = this.cacheKey('cashflow', days);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { subscriptions } = await this.fetchData();
    const forecast = this.model.projectCashFlow(subscriptions, days);

    const formatted = forecast.map(day => ({
      date: day.date,
      projectedRevenue: this.model.formatCurrency(day.projectedRevenue),
      cumulative: this.model.formatCurrency(day.cumulative),
      confidence: day.confidence
    }));

    this.setCached(cacheKey, formatted);
    return formatted;
  }

  async getChurnForecast(months = 12) {
    /**
     * Previsão de impacto de churn
     */
    const cacheKey = this.cacheKey('churn', months);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { subscriptions } = await this.fetchData();
    const forecast = this.model.projectChurnImpact(subscriptions, months);

    const formatted = forecast.map(month => ({
      month: month.month,
      mrrProjection: this.model.formatCurrency(month.mrrProjection),
      activeSubscriptions: month.activeSubscriptions,
      churnedThisMonth: month.churnedThisMonth,
      revenueAtRisk: this.model.formatCurrency(month.revenueAtRisk)
    }));

    this.setCached(cacheKey, formatted);
    return formatted;
  }

  async getGrowthForecast(months = 12, growthRate = 0.1) {
    /**
     * Previsão de crescimento
     */
    const cacheKey = this.cacheKey('growth', months);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { subscriptions, charges } = await this.fetchData();
    const forecast = this.model.projectGrowth(subscriptions, charges, months, growthRate);

    const formatted = forecast.map(month => ({
      month: month.month,
      mrrProjection: this.model.formatCurrency(month.mrrProjection),
      newCustomersNeeded: month.newCustomersNeeded,
      revenueGain: this.model.formatCurrency(month.revenueGain),
      growthCumulative: month.growthCumulative.toFixed(2) + '%'
    }));

    this.setCached(cacheKey, formatted);
    return formatted;
  }

  async getAtRiskCustomers(days = 30) {
    /**
     * Lista de clientes em risco de churn
     */
    const cacheKey = this.cacheKey('atrisk', days);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { charges } = await this.fetchData();
    const atRisk = this.model.identifyAtRiskCustomers(charges, days);

    // Formata valores para exibição
    const formatted = atRisk.map(customer => ({
      ...customer,
      overdue_amount: this.model.formatCurrency(customer.overdue_amount)
    }));

    this.setCached(cacheKey, formatted);
    return formatted;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ALERTAS E NOTIFICAÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  async getAlerts() {
    /**
     * Retorna todos os alertas financeiros importantes
     */
    const { customers, charges, subscriptions } = await this.fetchData();

    const alerts = [];

    // Alerta 1: Saúde crítica
    const health = this.model.assessFinancialHealth(customers, charges, subscriptions);
    if (health.status === 'Crítico') {
      alerts.push({
        severity: 'CRITICAL',
        type: 'HEALTH',
        message: `Saúde financeira crítica: ${health.score}/100`,
        timestamp: new Date().toISOString()
      });
    } else if (health.status === 'Preocupante') {
      alerts.push({
        severity: 'WARNING',
        type: 'HEALTH',
        message: `Saúde financeira preocupante: ${health.score}/100`,
        timestamp: new Date().toISOString()
      });
    }

    // Alerta 2: Taxa de churn alta
    const churnRate = parseFloat(this.model.calculateChurnRate(subscriptions));
    if (churnRate > 5) {
      alerts.push({
        severity: 'WARNING',
        type: 'CHURN',
        message: `Taxa de churn alto: ${churnRate.toFixed(2)}%`,
        timestamp: new Date().toISOString()
      });
    }

    // Alerta 3: Taxa de sucesso de pagamento baixa
    const paymentSuccess = parseFloat(this.model.calculatePaymentSuccess(charges));
    if (paymentSuccess < 85) {
      alerts.push({
        severity: 'WARNING',
        type: 'PAYMENT',
        message: `Taxa de sucesso de pagamento: ${paymentSuccess.toFixed(2)}%`,
        timestamp: new Date().toISOString()
      });
    }

    // Alerta 4: Clientes em risco
    const atRisk = this.model.identifyAtRiskCustomers(charges, 30);
    const highRisk = atRisk.filter(c => c.risk_level === 'Alto');
    if (highRisk.length > 0) {
      alerts.push({
        severity: highRisk.length > 3 ? 'WARNING' : 'INFO',
        type: 'AT_RISK',
        message: `${highRisk.length} cliente(s) em risco alto`,
        count: highRisk.length,
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIOS HIPOTÉTICOS
  // ══════════════════════════════════════════════════════════════════════════

  async simulateScenarios() {
    /**
     * Simula diferentes cenários (otimista, pessimista, base)
     */
    const { subscriptions, charges } = await this.fetchData();

    const baseProjection = this.model.projectGrowth(subscriptions, charges, 12, 0.1);
    const optimisticProjection = this.model.projectGrowth(subscriptions, charges, 12, 0.25);
    const pessimisticProjection = this.model.projectGrowth(subscriptions, charges, 12, -0.05);

    return {
      scenarios: {
        base: baseProjection.map(m => ({
          month: m.month,
          mrr: this.model.formatCurrency(m.mrrProjection),
          label: 'Base (+10% mês)'
        })),
        optimistic: optimisticProjection.map(m => ({
          month: m.month,
          mrr: this.model.formatCurrency(m.mrrProjection),
          label: 'Otimista (+25% mês)'
        })),
        pessimistic: pessimisticProjection.map(m => ({
          month: m.month,
          mrr: this.model.formatCurrency(m.mrrProjection),
          label: 'Pessimista (-5% mês)'
        }))
      }
    };
  }
}

module.exports = { ForecastService };
