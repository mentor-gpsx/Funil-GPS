/**
 * Auto Sync Service - Sincroniza dados importados para a dashboard automaticamente
 */

const fs = require('fs');
const path = require('path');

class AutoSyncService {
  constructor(database) {
    this.db = database;
    this.syncInterval = 5 * 60 * 1000; // 5 minutos
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[AutoSync] ✅ Serviço de sincronização iniciado');

    // Sincronizar imediatamente
    this.sync();

    // Depois a cada 5 minutos
    this.intervalId = setInterval(() => this.sync(), this.syncInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.running = false;
    console.log('[AutoSync] ⏹️  Serviço de sincronização parado');
  }

  sync() {
    console.log(`[AutoSync] 🔄 Sincronizando dados... (${new Date().toLocaleTimeString('pt-BR')})`);

    this.db.all('SELECT COUNT(*) as count FROM customers WHERE source = ?', ['import_manual'], (err, result) => {
      if (err) {
        console.error('[AutoSync] ❌ Erro ao contar clientes:', err.message);
        return;
      }

      const totalCustomers = result[0]?.count || 0;

      this.db.all('SELECT COUNT(*) as count FROM charges WHERE source = ?', ['import_manual'], (err, result) => {
        if (err) {
          console.error('[AutoSync] ❌ Erro ao contar cobranças:', err.message);
          return;
        }

        const totalCharges = result[0]?.count || 0;

        this.db.all('SELECT COUNT(*) as count FROM subscriptions WHERE source = ?', ['import_manual'], (err, result) => {
          if (err) {
            console.error('[AutoSync] ❌ Erro ao contar assinaturas:', err.message);
            return;
          }

          const totalSubscriptions = result[0]?.count || 0;

          // Gerar relatório de dados
          const report = {
            timestamp: new Date().toISOString(),
            imported_data: {
              customers: totalCustomers,
              charges: totalCharges,
              subscriptions: totalSubscriptions
            },
            status: 'synced'
          };

          // Salvar relatório em arquivo
          const reportPath = path.join(__dirname, 'sync-report.json');
          fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

          console.log(`[AutoSync] ✅ Sincronização concluída: ${totalCustomers} clientes, ${totalCharges} cobranças, ${totalSubscriptions} assinaturas`);
        });
      });
    });
  }

  getStats(callback) {
    // Contar TODOS os clientes (import_manual + cakto_webhook)
    this.db.all('SELECT COUNT(*) as count FROM customers', [], (err, customers) => {
      if (err) {
        callback(err, null);
        return;
      }

      // Contar TODAS as cobranças (import_manual + cakto_webhook)
      this.db.all('SELECT COUNT(*) as count FROM charges', [], (err, charges) => {
        if (err) {
          callback(err, null);
          return;
        }

        // Somar receita paga (todas as fontes)
        this.db.all('SELECT SUM(amount) as total FROM charges WHERE status = ?', ['paid'], (err, paid) => {
          if (err) {
            callback(err, null);
            return;
          }

          // Somar receita pendente (todas as fontes)
          this.db.all('SELECT SUM(amount) as total FROM charges WHERE status = ?', ['pending'], (err, pending) => {
            if (err) {
              callback(err, null);
              return;
            }

            // Contar TODAS as assinaturas
            this.db.all('SELECT COUNT(*) as count FROM subscriptions', [], (err, subscriptions) => {
              if (err) {
                callback(err, null);
                return;
              }

              callback(null, {
                total_customers: customers[0]?.count || 0,
                total_charges: charges[0]?.count || 0,
                total_subscriptions: subscriptions[0]?.count || 0,
                total_revenue_paid: paid[0]?.total || 0,
                total_revenue_pending: pending[0]?.total || 0,
                last_sync: new Date().toISOString()
              });
            });
          });
        });
      });
    });
  }
}

module.exports = { AutoSyncService };
