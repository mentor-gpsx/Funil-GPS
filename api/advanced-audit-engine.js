/**
 * SISTEMA AVANÇADO DE AUDITORIA FINANCEIRA
 * Múltiplos agentes especializados para análise profunda
 *
 * Arquitetura: Coletor → Validador → Conciliador → Auditor → Analista
 */

class TransactionCollectorAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Agente Coletor de Transações';
  }

  async collect() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          ch.id as transaction_id,
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          ch.amount as gross_amount,
          ch.status,
          ch.payment_method,
          ch.created_at as purchase_date,
          ch.paid_date as approval_date,
          ch.source,
          CASE
            WHEN ch.payment_method = 'pix' THEN ch.amount * 0.0075
            WHEN ch.payment_method = 'boleto' THEN ch.amount * 0.015
            WHEN ch.payment_method = 'cc' THEN ch.amount * 0.027
            ELSE ch.amount * 0.01
          END as estimated_fee,
          CASE
            WHEN ch.payment_method = 'pix' THEN ch.amount * 0.9925
            WHEN ch.payment_method = 'boleto' THEN ch.amount * 0.985
            WHEN ch.payment_method = 'cc' THEN ch.amount * 0.973
            ELSE ch.amount * 0.99
          END as net_amount
        FROM charges ch
        JOIN customers c ON ch.customer_id = c.id
        ORDER BY ch.created_at DESC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) return reject(err);

        const transactions = rows.map(t => ({
          transaction_id: t.transaction_id,
          customer_id: t.customer_id,
          customer_name: t.customer_name,
          email: t.email,
          status: t.status,
          method: t.payment_method,
          gross_amount: parseFloat(t.gross_amount),
          estimated_fee: parseFloat(t.estimated_fee),
          net_amount: parseFloat(t.net_amount),
          purchase_date: t.purchase_date,
          approval_date: t.approval_date,
          source: t.source,
          amount_received: 0 // Será preenchido pelo ConciliationAgent com dados reais
        }));

        resolve({
          agent: this.name,
          timestamp: new Date().toISOString(),
          total_transactions: transactions.length,
          transactions
        });
      });
    });
  }
}

class BalanceValidatorAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Agente Validador de Saldo';
  }

  async validate(collectorData) {
    return new Promise((resolve, reject) => {
      // Buscar dados REAIS de saques do banco
      const query = `
        SELECT
          COALESCE(SUM(amount), 0) as total_withdrawn
        FROM saques
        WHERE status = 'APROVADO'
      `;

      this.db.get(query, [], (err, row) => {
        if (err) return reject(err);

        const totalGross = collectorData.transactions.reduce((sum, t) => sum + t.gross_amount, 0);
        const totalFees = collectorData.transactions.reduce((sum, t) => sum + t.estimated_fee, 0);
        const totalNetExpected = collectorData.transactions.reduce((sum, t) => sum + t.net_amount, 0);

        // Usar saldos REAIS do banco de dados
        const balanceReceived = row ? parseFloat(row.total_withdrawn) : 0;
        const balancePending = totalNetExpected - balanceReceived;

        resolve({
          agent: this.name,
          timestamp: new Date().toISOString(),
          total_gross: totalGross,
          total_fees: totalFees,
          total_net_expected: totalNetExpected,
          balance_received: balanceReceived,
          balance_pending: balancePending,
          percentage_received: totalNetExpected > 0 ? (balanceReceived / totalNetExpected * 100).toFixed(2) : 0,
          validation_status: 'complete',
          source: 'database'
        });
      });
    });
  }
}

class ConciliationAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Agente Conciliador';
  }

  async reconcile(collectorData, balanceData) {
    return new Promise((resolve, reject) => {
      // Buscar dados reais de saques por data
      const saquesQuery = `
        SELECT
          data,
          amount
        FROM saques
        WHERE status = 'APROVADO'
        ORDER BY data DESC
      `;

      this.db.all(saquesQuery, [], (err, saques) => {
        if (err) return reject(err);

        const reconciliation = {
          agent: this.name,
          timestamp: new Date().toISOString(),
          reconciliation_date: new Date().toISOString(),
          by_transaction: [],
          by_customer: {},
          summary: {}
        };

        // Criar mapa de saques por data para matching
        const saquesMap = {};
        let saquesUsed = 0;
        const saquesArray = saques || [];

        // Mapear cada transação com dados REAIS de saques
        collectorData.transactions.forEach(t => {
          const paidDaysAgo = t.status === 'paid' ?
            Math.floor((Date.now() - new Date(t.approval_date)) / (1000 * 60 * 60 * 24)) : null;

          // Usar dados REAIS de saques, não simulação
          // Se há saques disponíveis e a transação foi aprovada, atribuir saque
          let received = 0;
          if (t.status === 'paid' && saquesUsed < saquesArray.length) {
            received = Math.min(t.net_amount, saquesArray[saquesUsed].amount);
            saquesUsed++;
          }

          const discrepancy = t.net_amount - received;

          reconciliation.by_transaction.push({
            transaction_id: t.transaction_id,
            customer_id: t.customer_id,
            customer_name: t.customer_name,
            gross_amount: t.gross_amount,
            fee: t.estimated_fee,
            net_amount: t.net_amount,
            amount_received: received,
            discrepancy: discrepancy,
            status: t.status,
            method: t.method,
            approval_date: t.approval_date,
            days_since_approval: paidDaysAgo,
            reconciliation_status: discrepancy === 0 ? 'OK' : discrepancy > 0 ? 'PENDENTE' : 'SOBREPAGO'
          });

          // Agrupar por cliente
          if (!reconciliation.by_customer[t.customer_name]) {
            reconciliation.by_customer[t.customer_name] = {
              customer_name: t.customer_name,
              customer_id: t.customer_id,
              email: t.email,
              total_transactions: 0,
              total_gross: 0,
              total_net: 0,
              total_received: 0,
              total_discrepancy: 0,
              transactions: []
            };
          }

          reconciliation.by_customer[t.customer_name].total_transactions++;
          reconciliation.by_customer[t.customer_name].total_gross += t.gross_amount;
          reconciliation.by_customer[t.customer_name].total_net += t.net_amount;
          reconciliation.by_customer[t.customer_name].total_received += received;
          reconciliation.by_customer[t.customer_name].total_discrepancy += discrepancy;
          reconciliation.by_customer[t.customer_name].transactions.push(t.transaction_id);
        });

        reconciliation.summary = {
          total_transactions: collectorData.transactions.length,
          total_gross_amount: balanceData.total_gross,
          total_expected_net: balanceData.total_net_expected,
          total_received_net: balanceData.balance_received,
          total_pending_net: balanceData.balance_pending,
          total_discrepancy: balanceData.total_net_expected - balanceData.balance_received,
          reconciliation_ratio: balanceData.total_net_expected > 0 ?
            (balanceData.balance_received / balanceData.total_net_expected * 100).toFixed(2) : 0,
          total_customers: Object.keys(reconciliation.by_customer).length,
          saques_found: saquesArray.length
        };

        resolve(reconciliation);
      });
    });
  }
}

class AuditFailureAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Agente Auditor de Falhas';
  }

  async audit(reconciliationData) {
    const failures = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    // Análise 1: Pagamentos sem entrada no saldo
    reconciliationData.by_transaction.forEach(t => {
      if (t.status === 'paid' && t.discrepancy > 0) {
        failures.critical.push({
          type: 'PAGAMENTO_NAO_RECEBIDO',
          severity: 'CRITICAL',
          transaction_id: t.transaction_id,
          customer: t.customer_name,
          amount: t.discrepancy,
          days_since_approval: t.days_since_approval,
          message: `Pagamento de R$ ${t.discrepancy.toFixed(2)} aprovado há ${t.days_since_approval} dias NÃO RECEBIDO no saldo`,
          impact: 'Fluxo de caixa impactado, cliente aguardando compensação'
        });
      }

      // Análise 2: Atraso na compensação
      if (t.status === 'paid' && t.days_since_approval > 3) {
        failures.high.push({
          type: 'ATRASO_COMPENSACAO',
          severity: 'HIGH',
          transaction_id: t.transaction_id,
          customer: t.customer_name,
          amount: t.net_amount,
          days_delay: t.days_since_approval,
          message: `${t.customer_name}: R$ ${t.net_amount.toFixed(2)} aprovado há ${t.days_since_approval} dias`,
          expected_days: t.method === 'pix' ? 0 : (t.method === 'boleto' ? 1 : 3),
          impact: 'Possível falha de API ou processamento travado'
        });
      }

      // Análise 3: Discrepância fiscal (taxa incorreta)
      const expectedFeeRate = {
        'pix': 0.0075,
        'boleto': 0.015,
        'cc': 0.027
      }[t.method] || 0.01;

      const actualFeeRate = t.fee / t.gross_amount;
      if (Math.abs(actualFeeRate - expectedFeeRate) > 0.002) {
        failures.medium.push({
          type: 'DISCREPANCIA_TAXA',
          severity: 'MEDIUM',
          transaction_id: t.transaction_id,
          customer: t.customer_name,
          expected_rate: expectedFeeRate * 100,
          actual_rate: (actualFeeRate * 100).toFixed(3),
          amount_difference: Math.abs((expectedFeeRate - actualFeeRate) * t.gross_amount),
          message: `Taxa incorreta para ${t.method}: esperado ${(expectedFeeRate * 100).toFixed(2)}%, encontrado ${(actualFeeRate * 100).toFixed(3)}%`
        });
      }
    });

    // Análise 4: Possíveis duplicatas (mesmo valor, mesmo método, data próxima)
    const groupedByAmount = {};
    reconciliationData.by_transaction.forEach(t => {
      const key = `${t.gross_amount}_${t.method}`;
      if (!groupedByAmount[key]) groupedByAmount[key] = [];
      groupedByAmount[key].push(t);
    });

    Object.values(groupedByAmount).forEach(group => {
      if (group.length > 1) {
        const dates = group.map(t => new Date(t.approval_date));
        const maxDaysDiff = Math.max(...dates.map((d, i, arr) =>
          i > 0 ? Math.abs(d - arr[i-1]) / (1000 * 60 * 60 * 24) : 0
        ));

        if (maxDaysDiff < 1) {
          failures.high.push({
            type: 'POSSIVEL_DUPLICATA',
            severity: 'HIGH',
            transactions: group.map(t => t.transaction_id),
            amount: group[0].gross_amount,
            customer: group.map(t => t.customer_name).join(', '),
            message: `Múltiplas transações idênticas (R$ ${group[0].gross_amount.toFixed(2)}, ${group[0].method}) no mesmo dia`,
            impact: 'Possível duplicação no sistema de pagamento'
          });
        }
      }
    });

    // Análise 5: Clientes com alto volume de falhas
    Object.entries(reconciliationData.by_customer).forEach(([name, customer]) => {
      const failureRate = customer.total_discrepancy / customer.total_net;
      if (failureRate > 0.3) {
        failures.high.push({
          type: 'CLIENTE_ALTO_RISCO',
          severity: 'HIGH',
          customer: name,
          total_amount: customer.total_gross,
          failure_rate: (failureRate * 100).toFixed(1),
          total_discrepancy: customer.total_discrepancy,
          message: `Cliente ${name}: ${(failureRate * 100).toFixed(1)}% dos pagamentos não compensados`,
          impact: 'Investigar padrão, pode indicar problema de integração ou conta'
        });
      }
    });

    return {
      agent: this.name,
      timestamp: new Date().toISOString(),
      audit_result: {
        critical_failures: failures.critical.length,
        high_failures: failures.high.length,
        medium_failures: failures.medium.length,
        low_failures: failures.low.length,
        total_failures: failures.critical.length + failures.high.length + failures.medium.length + failures.low.length
      },
      failures,
      severity_distribution: {
        CRITICAL: failures.critical.length,
        HIGH: failures.high.length,
        MEDIUM: failures.medium.length,
        LOW: failures.low.length
      }
    };
  }
}

class FinancialAnalystAgent {
  constructor() {
    this.name = 'Agente Analista Financeiro';
  }

  async analyze(collectorData, balanceData, reconciliationData, auditData) {
    const analysis = {
      agent: this.name,
      timestamp: new Date().toISOString(),

      summary: {
        total_gross_sold: balanceData.total_gross,
        total_net_expected: balanceData.total_net_expected,
        total_fees: balanceData.total_fees,
        total_received: balanceData.balance_received,
        total_pending: balanceData.balance_pending,
        total_discrepancy: balanceData.balance_pending,
        discrepancy_percentage: ((balanceData.balance_pending / balanceData.total_net_expected) * 100).toFixed(2)
      },

      by_method: {},

      risk_assessment: {
        financial_risk: 0,
        operational_risk: 0,
        compliance_risk: 0
      },

      recommendations: []
    };

    // Análise por método
    const byMethod = {};
    collectorData.transactions.forEach(t => {
      if (!byMethod[t.method]) {
        byMethod[t.method] = {
          method: t.method,
          count: 0,
          total_gross: 0,
          total_fees: 0,
          total_net: 0,
          received: 0,
          pending: 0,
          percentage_received: 0
        };
      }
      byMethod[t.method].count++;
      byMethod[t.method].total_gross += t.gross_amount;
      byMethod[t.method].total_fees += t.estimated_fee;
      byMethod[t.method].total_net += t.net_amount;

      if (t.status === 'paid') {
        const amountReceived = reconciliationData.by_transaction.find(r => r.transaction_id === t.transaction_id)?.amount_received || 0;
        byMethod[t.method].received += amountReceived;
        byMethod[t.method].pending += (t.net_amount - amountReceived);
      }
    });

    Object.entries(byMethod).forEach(([method, data]) => {
      data.percentage_received = (data.received / data.total_net * 100).toFixed(2);
      analysis.by_method[method] = data;
    });

    // Avaliação de risco
    const criticalCount = auditData.audit_result.critical_failures;
    const highCount = auditData.audit_result.high_failures;

    analysis.risk_assessment.financial_risk = Math.min(100, criticalCount * 30 + highCount * 10);
    analysis.risk_assessment.operational_risk = Math.min(100, auditData.audit_result.total_failures * 5);
    analysis.risk_assessment.compliance_risk = balanceData.balance_pending > balanceData.total_net_expected * 0.3 ? 85 : 30;

    // Recomendações
    if (auditData.audit_result.critical_failures > 0) {
      analysis.recommendations.push({
        priority: 'CRÍTICA',
        action: 'Investigar imediatamente',
        description: `${auditData.audit_result.critical_failures} pagamento(s) aprovado(s) não recebido(s) no saldo`,
        impact: `R$ ${balanceData.balance_pending.toFixed(2)} em risco`
      });
    }

    if (auditData.audit_result.high_failures > 0) {
      analysis.recommendations.push({
        priority: 'ALTA',
        action: 'Validar processamento',
        description: `${auditData.audit_result.high_failures} anomalia(s) detectada(s) no pipeline de compensação`,
        impact: 'Atraso no fluxo de caixa'
      });
    }

    if (parseFloat(balanceData.percentage_received) < 90) {
      analysis.recommendations.push({
        priority: 'ALTA',
        action: 'Sincronizar com Cakto',
        description: `Apenas ${balanceData.percentage_received}% dos pagamentos em saldo recebido`,
        impact: 'Possível desincronização entre sistemas'
      });
    }

    return analysis;
  }
}

class AdvancedAuditEngine {
  constructor(database) {
    this.db = database;
    this.collector = new TransactionCollectorAgent(database);
    this.validator = new BalanceValidatorAgent(database);
    this.conciliator = new ConciliationAgent(database);
    this.auditor = new AuditFailureAgent(database);
    this.analyst = new FinancialAnalystAgent();
  }

  async executeFullAudit() {
    try {
      console.log('[AdvancedAuditEngine] 🔍 Iniciando auditoria avançada...');

      const collectorData = await this.collector.collect();
      console.log(`[AdvancedAuditEngine] ✓ Coleta: ${collectorData.total_transactions} transações`);

      const balanceData = await this.validator.validate(collectorData);
      console.log(`[AdvancedAuditEngine] ✓ Validação de saldo completa`);

      const reconciliationData = await this.conciliator.reconcile(collectorData, balanceData);
      console.log(`[AdvancedAuditEngine] ✓ Conciliação: ${reconciliationData.summary.total_customers} clientes`);

      const auditData = await this.auditor.audit(reconciliationData);
      console.log(`[AdvancedAuditEngine] ✓ Auditoria: ${auditData.audit_result.total_failures} falhas detectadas`);

      const analysis = await this.analyst.analyze(collectorData, balanceData, reconciliationData, auditData);
      console.log('[AdvancedAuditEngine] ✓ Análise financeira concluída');

      return {
        collector: collectorData,
        balance: balanceData,
        reconciliation: reconciliationData,
        audit: auditData,
        analysis: analysis
      };
    } catch (error) {
      console.error('[AdvancedAuditEngine] ❌ Erro na auditoria:', error);
      throw error;
    }
  }
}

module.exports = {
  TransactionCollectorAgent,
  BalanceValidatorAgent,
  ConciliationAgent,
  AuditFailureAgent,
  FinancialAnalystAgent,
  AdvancedAuditEngine
};
