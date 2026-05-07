/**
 * Sistema de Auditoria Financeira Automatizada
 * Múltiplos agentes especializados para validação de pagamentos
 */

class PaymentCollectorAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Coletor de Pagamentos';
  }

  async collect() {
    return new Promise((resolve, reject) => {
      // Coletar todos os pagamentos
      const query = `
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          ch.id as charge_id,
          ch.amount,
          ch.payment_method,
          ch.status,
          ch.due_date,
          ch.paid_date,
          ch.created_at,
          ch.source
        FROM charges ch
        JOIN customers c ON ch.customer_id = c.id
        ORDER BY ch.created_at DESC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) return reject(err);

        resolve({
          agent: this.name,
          timestamp: new Date().toISOString(),
          total_charges: rows.length,
          data: rows
        });
      });
    });
  }
}

class BalanceValidatorAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Validador de Saldo';
  }

  async validate(chargesData) {
    return new Promise((resolve, reject) => {
      // Buscar dados REAIS de saques (dinheiro que realmente saiu para conta)
      const saquesQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_withdrawn
        FROM saques
        WHERE status = 'APROVADO'
      `;

      this.db.get(saquesQuery, [], (err, saquesRow) => {
        if (err) return reject(err);

        // Calcular saldos de charges por status
        const chargesQuery = `
          SELECT
            status,
            COUNT(*) as quantidade,
            SUM(amount) as total_amount,
            AVG(amount) as average_amount,
            MIN(amount) as min_amount,
            MAX(amount) as max_amount
          FROM charges
          GROUP BY status
        `;

        this.db.all(chargesQuery, [], (err, rows) => {
          if (err) return reject(err);

          const balanceSummary = {};
          let totalCharges = 0;
          let totalPending = 0;

          rows.forEach(row => {
            balanceSummary[row.status] = {
              quantity: row.quantidade,
              total: row.total_amount,
              average: row.average_amount,
              min: row.min_amount,
              max: row.max_amount
            };

            if (row.status === 'paid') {
              totalCharges = row.total_amount || 0;
            } else if (row.status === 'pending') {
              totalPending = row.total_amount || 0;
            }
          });

          // Usar dados REAIS de saques, não simulação
          const totalWithdrawn = saquesRow ? parseFloat(saquesRow.total_withdrawn) : 0;
          const totalPaid = totalWithdrawn;  // O que foi REALMENTE sacado
          const actualPending = totalCharges - totalWithdrawn;  // O que ainda não saiu

          resolve({
            agent: this.name,
            timestamp: new Date().toISOString(),
            balance_summary: balanceSummary,
            total_paid: totalPaid,
            total_pending: actualPending,
            total_available: totalPaid,
            validation_status: 'complete'
          });
        });
      });
    });
  }
}

class FinancialConciliatorAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Conciliador Financeiro';
  }

  async reconcile(collectorData, balanceData) {
    return new Promise((resolve, reject) => {
      // Análise detalhada de conciliação
      const query = `
        SELECT
          c.id as customer_id,
          c.name as customer_name,
          c.email,
          COUNT(ch.id) as total_charges,
          COUNT(CASE WHEN ch.status = 'paid' THEN 1 END) as paid_charges,
          COUNT(CASE WHEN ch.status = 'pending' THEN 1 END) as pending_charges,
          SUM(CASE WHEN ch.status = 'paid' THEN ch.amount ELSE 0 END) as total_paid,
          SUM(CASE WHEN ch.status = 'pending' THEN ch.amount ELSE 0 END) as total_pending,
          SUM(ch.amount) as total_amount,
          MAX(ch.created_at) as last_charge_date,
          MAX(ch.paid_date) as last_paid_date
        FROM customers c
        LEFT JOIN charges ch ON c.id = ch.customer_id
        GROUP BY c.id
        HAVING COUNT(ch.id) > 0
        ORDER BY total_amount DESC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) return reject(err);

        const reconciliation = {
          agent: this.name,
          timestamp: new Date().toISOString(),
          reconciliation_date: new Date().toISOString(),
          by_customer: rows,
          summary: {
            total_customers: rows.length,
            total_transactions: collectorData.total_charges,
            total_amount_transacted: balanceData.total_paid + balanceData.total_pending,
            total_amount_received: balanceData.total_paid,
            total_amount_pending: balanceData.total_pending,
            reconciliation_ratio: balanceData.total_paid > 0 ?
              ((balanceData.total_paid / (balanceData.total_paid + balanceData.total_pending)) * 100).toFixed(2) + '%' : '0%'
          }
        };

        resolve(reconciliation);
      });
    });
  }
}

class InconsistencyAuditorAgent {
  constructor(database) {
    this.db = database;
    this.name = 'Auditor de Inconsistências';
  }

  async audit(reconciliationData) {
    const inconsistencies = [];
    const warnings = [];

    // Análise 1: Pagamentos sem compensação
    reconciliationData.by_customer.forEach(customer => {
      if (customer.paid_charges > 0 && customer.last_paid_date) {
        const paidDate = new Date(customer.last_paid_date);
        const now = new Date();
        const daysDelay = Math.floor((now - paidDate) / (1000 * 60 * 60 * 24));

        if (daysDelay > 3) {
          warnings.push({
            type: 'ATRASO_COMPENSACAO',
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            severity: daysDelay > 7 ? 'CRITICAL' : 'WARNING',
            days_delayed: daysDelay,
            amount: customer.total_paid,
            message: `Pagamento realizado há ${daysDelay} dias mas sem reflexo no saldo`
          });
        }
      }
    });

    // Análise 2: Clientes com pagamentos pendentes há muito tempo
    reconciliationData.by_customer.forEach(customer => {
      if (customer.pending_charges > 0 && customer.last_charge_date) {
        const chargeDate = new Date(customer.last_charge_date);
        const now = new Date();
        const daysOverdue = Math.floor((now - chargeDate) / (1000 * 60 * 60 * 24));

        if (daysOverdue > 30) {
          inconsistencies.push({
            type: 'PAGAMENTO_ATRASADO',
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            severity: 'HIGH',
            days_overdue: daysOverdue,
            amount: customer.total_pending,
            message: `Cobrança pendente há ${daysOverdue} dias`
          });
        }
      }
    });

    // Análise 3: Discrepâncias de valor
    const totalPaid = reconciliationData.summary.total_amount_received;
    const totalExpected = reconciliationData.summary.total_amount_transacted;
    const discrepancy = totalExpected - totalPaid;

    if (discrepancy > 0) {
      inconsistencies.push({
        type: 'DISCREPANCIA_SALDO',
        severity: 'CRITICAL',
        expected_total: totalExpected,
        actual_total: totalPaid,
        discrepancy_amount: discrepancy,
        discrepancy_percentage: ((discrepancy / totalExpected) * 100).toFixed(2) + '%',
        message: `Discrepância de R$ ${discrepancy.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${((discrepancy / totalExpected) * 100).toFixed(2)}%)`
      });
    }

    return {
      agent: this.name,
      timestamp: new Date().toISOString(),
      total_inconsistencies: inconsistencies.length,
      total_warnings: warnings.length,
      inconsistencies,
      warnings,
      severity_summary: {
        CRITICAL: inconsistencies.filter(i => i.severity === 'CRITICAL').length +
                  warnings.filter(w => w.severity === 'CRITICAL').length,
        HIGH: inconsistencies.filter(i => i.severity === 'HIGH').length +
              warnings.filter(w => w.severity === 'HIGH').length,
        WARNING: inconsistencies.filter(i => i.severity === 'WARNING').length +
                 warnings.filter(w => w.severity === 'WARNING').length
      }
    };
  }
}

class ReportGeneratorAgent {
  constructor() {
    this.name = 'Gerador de Relatório';
  }

  async generate(collectorData, balanceData, reconciliationData, auditData) {
    return {
      agent: this.name,
      timestamp: new Date().toISOString(),
      audit_id: `AUDIT-${Date.now()}`,
      report: {
        collector_data: collectorData,
        balance_data: balanceData,
        reconciliation_data: reconciliationData,
        audit_data: auditData
      },
      status: auditData.severity_summary.CRITICAL > 0 ? 'FAILED' : 'PASSED',
      health_score: this.calculateHealthScore(auditData, reconciliationData)
    };
  }

  calculateHealthScore(auditData, reconciliationData) {
    let score = 100;

    // Reduzir por inconsistências críticas
    score -= auditData.severity_summary.CRITICAL * 20;

    // Reduzir por avisos
    score -= auditData.severity_summary.WARNING * 5;

    // Reduzir se houver descompensação
    const reconciliationRatio = parseFloat(reconciliationData.summary.reconciliation_ratio);
    if (reconciliationRatio < 100) {
      score -= (100 - reconciliationRatio);
    }

    return Math.max(0, Math.round(score));
  }
}

module.exports = {
  PaymentCollectorAgent,
  BalanceValidatorAgent,
  FinancialConciliatorAgent,
  InconsistencyAuditorAgent,
  ReportGeneratorAgent
};
