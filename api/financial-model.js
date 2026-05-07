/**
 * Financial Model - Cálculos de receita, impostos, taxas e previsões
 * Fonte única de verdade para matemática financeira
 */

class FinancialModel {
  constructor() {
    // Configurações padrão do Brasil
    this.config = {
      taxRates: {
        pix: 0,              // PIX sem taxa
        boleto: 0.01,        // 1% em média
        cc: 0.0299,          // 2.99% para débito/crédito
        debit: 0.0299,
        transferencia: 0,
        desconhecido: 0.015  // 1.5% default
      },
      installmentFees: {
        '2x': 0.019,
        '3x': 0.029,
        '4x': 0.039,
        '6x': 0.049,
        '12x': 0.099
      },
      irrf: 0.015,           // IRRF 1.5% para MEI
      inss: 0.05,            // INSS ~5% MEI simplificado
      iss: 0.05,             // ISS ~5% serviços
      defaults: {
        paymentDelayDays: 7,  // Assumir 7 dias para confirmar pagamento
        churnMonthly: 0.02,   // 2% churn mensal default
        growthMonthly: 0.1    // 10% crescimento mensal default
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CÁLCULOS DE RECEITA
  // ══════════════════════════════════════════════════════════════════════════

  calculateGrossRevenue(charges) {
    /**
     * Receita bruta = soma de tudo que entrou
     * Não desconta nada, valor nominal
     */
    return charges
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + (c.amount || 0), 0);
  }

  calculatePaymentMethodFee(charge) {
    /**
     * Calcula taxa do método de pagamento
     * PIX: 0%, Boleto: 1%, CC: 2.99%, etc
     */
    const method = charge.payment_method || 'desconhecido';
    const rate = this.config.taxRates[method] || 0.015;
    return charge.amount * rate;
  }

  calculateInstallmentFee(charge, installments = 1) {
    /**
     * Calcula taxa adicional para parcelamento
     * 2x: 1.9%, 3x: 2.9%, etc
     */
    if (installments <= 1) return 0;
    const key = `${installments}x`;
    const rate = this.config.installmentFees[key] || 0.029;
    return charge.amount * rate;
  }

  calculateNetRevenue(charges) {
    /**
     * Receita líquida = receita bruta - todas as taxas
     * Desconta: payment method + installment + IRRF + INSS + ISS
     */
    const gross = this.calculateGrossRevenue(charges);

    let totalFees = 0;
    charges.filter(c => c.status === 'paid').forEach(charge => {
      totalFees += this.calculatePaymentMethodFee(charge);
      // Assume 1x por padrão (sem parcelamento)
      totalFees += this.calculateInstallmentFee(charge, 1);
    });

    const irrf = gross * this.config.irrf;
    const inss = gross * this.config.inss;
    const iss = gross * this.config.iss;

    return gross - totalFees - irrf - inss - iss;
  }

  calculateCostBreakdown(charges) {
    /**
     * Detalha cada componente de custo
     * {paymentMethods, installments, irrf, inss, iss, total}
     */
    const gross = this.calculateGrossRevenue(charges);

    let paymentMethodsFees = 0;
    let installmentFees = 0;

    charges.filter(c => c.status === 'paid').forEach(charge => {
      paymentMethodsFees += this.calculatePaymentMethodFee(charge);
      installmentFees += this.calculateInstallmentFee(charge, 1);
    });

    const irrf = gross * this.config.irrf;
    const inss = gross * this.config.inss;
    const iss = gross * this.config.iss;

    return {
      paymentMethods: paymentMethodsFees,
      installments: installmentFees,
      irrf,
      inss,
      iss,
      total: paymentMethodsFees + installmentFees + irrf + inss + iss,
      percentage: ((paymentMethodsFees + installmentFees + irrf + inss + iss) / gross * 100).toFixed(2) + '%'
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MÉTRICAS DE SAÚDE FINANCEIRA
  // ══════════════════════════════════════════════════════════════════════════

  calculateMRR(subscriptions) {
    /**
     * Monthly Recurring Revenue
     * Soma apenas assinaturas ativas
     */
    return subscriptions
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + (s.amount || 0), 0);
  }

  calculateARR(subscriptions) {
    /**
     * Annual Recurring Revenue
     * MRR × 12
     */
    return this.calculateMRR(subscriptions) * 12;
  }

  calculateChurnRate(subscriptions) {
    /**
     * Taxa de cancelamento mensal
     * (Canceladas este mês) / (Ativas no início do mês)
     */
    const totalSubs = subscriptions.length || 1;
    const cancelled = subscriptions.filter(s => s.status === 'cancelled').length;
    return ((cancelled / totalSubs) * 100).toFixed(2);
  }

  calculateAverageCustomerValue(charges, customers) {
    /**
     * Ticket médio (total recebido / clientes)
     */
    const totalReceived = this.calculateGrossRevenue(charges);
    const activeCustomers = customers.length || 1;
    return (totalReceived / activeCustomers).toFixed(2);
  }

  calculatePaymentSuccess(charges) {
    /**
     * Taxa de sucesso de pagamentos
     * (Pagos) / (Total de tentativas)
     */
    const paid = charges.filter(c => c.status === 'paid').length;
    const total = charges.length || 1;
    return ((paid / total) * 100).toFixed(2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PREVISÕES E PROJEÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  projectCashFlow(subscriptions, days = 30) {
    /**
     * Projeta fluxo de caixa para os próximos N dias
     * Assume:
     * - MRR constante
     * - 1/30 da receita por dia
     * - Sem sazonalidade
     */
    const mrrDaily = this.calculateMRR(subscriptions) / 30;
    const projection = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      projection.push({
        date: date.toISOString().split('T')[0],
        projectedRevenue: mrrDaily,
        cumulative: mrrDaily * (i + 1),
        confidence: 95 // Alta confiança em curto prazo
      });
    }

    return projection;
  }

  projectChurnImpact(subscriptions, monthsAhead = 12) {
    /**
     * Projeta impacto do churn na receita
     * Simula mês a mês com taxa de churn
     */
    const churnRate = parseFloat(this.calculateChurnRate(subscriptions)) / 100;
    const initialMRR = this.calculateMRR(subscriptions);

    const projection = [];
    let currentMRR = initialMRR;
    let activeSubs = subscriptions.filter(s => s.status === 'active').length;

    for (let month = 0; month < monthsAhead; month++) {
      const churnedSubs = Math.floor(activeSubs * churnRate);
      activeSubs -= churnedSubs;
      currentMRR = (activeSubs / subscriptions.length) * initialMRR;

      projection.push({
        month: month + 1,
        mrrProjection: currentMRR,
        activeSubscriptions: activeSubs,
        churnedThisMonth: churnedSubs,
        revenueAtRisk: churnedSubs * (initialMRR / subscriptions.length)
      });
    }

    return projection;
  }

  projectGrowth(subscriptions, charges, monthsAhead = 12, growthRate = 0.1) {
    /**
     * Projeta crescimento otimista com taxa de crescimento
     * Útil para planning e cenário otimista
     */
    const initialMRR = this.calculateMRR(subscriptions);
    const averageCharge = this.calculateAverageCustomerValue(charges, []);

    const projection = [];
    let projectedMRR = initialMRR;

    for (let month = 0; month < monthsAhead; month++) {
      projectedMRR *= (1 + growthRate);

      projection.push({
        month: month + 1,
        mrrProjection: projectedMRR,
        newCustomersNeeded: Math.round((projectedMRR - initialMRR) / averageCharge),
        revenueGain: projectedMRR - initialMRR,
        growthCumulative: ((projectedMRR / initialMRR) - 1) * 100
      });
    }

    return projection;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ANÁLISE DE RISCO
  // ══════════════════════════════════════════════════════════════════════════

  assessFinancialHealth(customers, charges, subscriptions) {
    /**
     * Score de saúde financeira geral (0-100)
     * Considera:
     * - Payment success rate (peso 30%)
     * - Churn rate (peso 25%)
     * - Customer diversity (peso 20%)
     * - Revenue stability (peso 15%)
     * - Growth trend (peso 10%)
     */
    const paymentSuccess = parseFloat(this.calculatePaymentSuccess(charges));
    const churnRate = 100 - parseFloat(this.calculateChurnRate(subscriptions));
    const customerDiversity = Math.min(100, (customers.length / 50) * 100); // Score até 50 clientes
    const revenueGross = this.calculateGrossRevenue(charges);
    const revenueNet = this.calculateNetRevenue(charges);
    const margin = revenueGross > 0 ? (revenueNet / revenueGross) * 100 : 0;

    const health =
      (paymentSuccess * 0.30) +
      (churnRate * 0.25) +
      (customerDiversity * 0.20) +
      (margin * 0.15) +
      (Math.min(100, this.calculateMRR(subscriptions) / 10) * 0.10);

    return {
      score: Math.min(100, Math.round(health)),
      paymentSuccessScore: paymentSuccess,
      churnScore: churnRate,
      customerDiversityScore: customerDiversity,
      marginScore: margin,
      mrrScore: this.calculateMRR(subscriptions) / 10,
      status: health >= 75 ? 'Excelente' :
              health >= 60 ? 'Bom' :
              health >= 45 ? 'Aceitável' :
              health >= 30 ? 'Preocupante' : 'Crítico'
    };
  }

  identifyAtRiskCustomers(charges, days = 30) {
    /**
     * Identifica clientes que não pagaram nos últimos N dias
     * Potencial indicativo de churn
     */
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const atRisk = charges.filter(charge => {
      const chargeDate = new Date(charge.paid_date || charge.due_date);
      return chargeDate < cutoffDate && charge.status !== 'paid';
    });

    return atRisk.map(c => ({
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      overdue_amount: c.amount,
      days_overdue: Math.floor((new Date() - new Date(c.due_date)) / (1000 * 60 * 60 * 24)),
      status: c.status,
      risk_level: c.amount > 1000 ? 'Alto' : c.amount > 500 ? 'Médio' : 'Baixo'
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RELATÓRIOS CONSOLIDADOS
  // ══════════════════════════════════════════════════════════════════════════

  generateFinancialReport(customers, charges, subscriptions) {
    /**
     * Relatório financeiro completo
     * Consolidação de todas as métricas
     */
    return {
      timestamp: new Date().toISOString(),

      revenue: {
        gross: this.calculateGrossRevenue(charges),
        net: this.calculateNetRevenue(charges),
        costBreakdown: this.calculateCostBreakdown(charges)
      },

      metrics: {
        mrr: this.calculateMRR(subscriptions),
        arr: this.calculateARR(subscriptions),
        averageCustomerValue: this.calculateAverageCustomerValue(charges, customers),
        paymentSuccessRate: this.calculatePaymentSuccess(charges),
        churnRate: this.calculateChurnRate(subscriptions)
      },

      health: this.assessFinancialHealth(customers, charges, subscriptions),

      atRiskCustomers: this.identifyAtRiskCustomers(charges, 30),

      projections: {
        cashFlow30Days: this.projectCashFlow(subscriptions, 30),
        churnImpact12Months: this.projectChurnImpact(subscriptions, 12),
        growthProjection12Months: this.projectGrowth(subscriptions, charges, 12, 0.1)
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILIDADES
  // ══════════════════════════════════════════════════════════════════════════

  formatCurrency(value) {
    return `R$ ${parseFloat(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  formatPercentage(value) {
    return `${parseFloat(value).toFixed(2)}%`;
  }
}

module.exports = { FinancialModel };
