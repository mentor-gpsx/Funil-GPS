/**
 * Serviço de Auditoria Financeira Automatizada
 * Orquestra múltiplos agentes especializados
 */

const {
  PaymentCollectorAgent,
  BalanceValidatorAgent,
  FinancialConciliatorAgent,
  InconsistencyAuditorAgent,
  ReportGeneratorAgent
} = require('./audit-agents');

class AuditService {
  constructor(database) {
    this.db = database;
    this.agents = {
      collector: new PaymentCollectorAgent(database),
      validator: new BalanceValidatorAgent(database),
      conciliator: new FinancialConciliatorAgent(database),
      auditor: new InconsistencyAuditorAgent(database),
      reporter: new ReportGeneratorAgent()
    };
  }

  async runFullAudit() {
    try {
      console.log('[AuditService] 🔍 Iniciando auditoria financeira completa...');

      // Fase 1: Coleta de Pagamentos
      console.log('[AuditService] Fase 1/5: Coletando dados de pagamentos...');
      const collectorData = await this.agents.collector.collect();
      console.log(`[AuditService] ✓ Coletados ${collectorData.total_charges} pagamentos`);

      // Fase 2: Validação de Saldo
      console.log('[AuditService] Fase 2/5: Validando saldos...');
      const balanceData = await this.agents.validator.validate(collectorData);
      console.log(`[AuditService] ✓ Saldo total: R$ ${balanceData.total_paid}`);

      // Fase 3: Conciliação Financeira
      console.log('[AuditService] Fase 3/5: Conciliando dados financeiros...');
      const reconciliationData = await this.agents.conciliator.reconcile(collectorData, balanceData);
      console.log(`[AuditService] ✓ Conciliação completa para ${reconciliationData.by_customer.length} clientes`);

      // Fase 4: Auditoria de Inconsistências
      console.log('[AuditService] Fase 4/5: Auditando inconsistências...');
      const auditData = await this.agents.auditor.audit(reconciliationData);
      console.log(`[AuditService] ✓ Identificadas ${auditData.total_inconsistencies} inconsistências`);

      // Fase 5: Geração de Relatório
      console.log('[AuditService] Fase 5/5: Gerando relatório final...');
      const report = await this.agents.reporter.generate(
        collectorData,
        balanceData,
        reconciliationData,
        auditData
      );
      console.log('[AuditService] ✅ Auditoria completa!');

      return report;
    } catch (error) {
      console.error('[AuditService] ❌ Erro durante auditoria:', error);
      throw error;
    }
  }

  formatReportForDisplay(report) {
    return {
      audit_id: report.audit_id,
      timestamp: report.timestamp,
      status: report.status,
      health_score: report.health_score,
      summary: {
        total_transactions: report.report.reconciliation_data.summary.total_transactions,
        total_amount_transacted: report.report.reconciliation_data.summary.total_amount_transacted,
        total_amount_received: report.report.reconciliation_data.summary.total_amount_received,
        total_amount_pending: report.report.reconciliation_data.summary.total_amount_pending,
        reconciliation_ratio: report.report.reconciliation_data.summary.reconciliation_ratio,
        total_customers: report.report.reconciliation_data.summary.total_customers
      },
      inconsistencies: {
        critical_count: report.report.audit_data.severity_summary.CRITICAL,
        warning_count: report.report.audit_data.severity_summary.WARNING,
        items: report.report.audit_data.inconsistencies
      },
      warnings: {
        count: report.report.audit_data.total_warnings,
        items: report.report.audit_data.warnings
      },
      by_customer_summary: report.report.reconciliation_data.by_customer.map(customer => ({
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        email: customer.email,
        total_charges: customer.total_charges,
        paid_charges: customer.paid_charges,
        pending_charges: customer.pending_charges,
        total_paid: customer.total_paid,
        total_pending: customer.total_pending,
        total_amount: customer.total_amount
      }))
    };
  }
}

module.exports = { AuditService };
