/**
 * Consistency Service - Garante que todos os dados sempre estão em sincronia
 * Implementa: Event Sourcing, Webhooks, Retry Logic, Reconciliation
 */

const { Database } = require('./database-schema');
const EventEmitter = require('events');

class ConsistencyService extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.retryQueue = [];
    this.reconciliationInterval = 5 * 60 * 1000; // 5 minutos
    this.webhookSubscribers = []; // Para notificar sistemas 3º
    this.isInitialized = false;
  }

  async init() {
    try {
      this.db = new Database();
      await this.db.init();
      this.isInitialized = true;

      console.log('[Consistency] ✅ Inicializado');

      // Iniciar reconciliação automática
      this.startAutoReconciliation();

      // Iniciar processamento de retry queue
      this.startRetryProcessor();

      return true;
    } catch (error) {
      console.error('[Consistency] ❌ Erro ao inicializar:', error);
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // INGESTÃO DE DADOS (Idempotente)
  // ────────────────────────────────────────────────────────────────

  async ingestData(data, source) {
    if (!this.isInitialized) {
      console.error('[Consistency] Serviço não inicializado');
      return { success: false, error: 'Service not initialized' };
    }

    try {
      return await this.db.transaction(async (db) => {
        const { customers = [], charges = [], subscriptions = [] } = data;

        const result = {
          success: true,
          source: source,
          timestamp: new Date().toISOString(),
          processed: {
            customers: 0,
            charges: 0,
            subscriptions: 0
          }
        };

        // INGERIR CLIENTES
        for (const customer of customers) {
          try {
            await db.upsertCustomer({ ...customer, source });
            await db.logEvent('customer', customer.id, 'updated', null, customer, source);
            result.processed.customers++;
          } catch (error) {
            console.error('[Consistency] Erro ao ingerir customer:', error);
            this.addToRetryQueue({ type: 'customer', data: customer, source });
          }
        }

        // INGERIR COBRANÇAS
        for (const charge of charges) {
          try {
            // Validar se cliente existe
            const customer = customers.find(c => c.id === charge.customer_id);
            if (!customer) {
              console.warn('[Consistency] Cliente não encontrado:', charge.customer_id);
              continue;
            }

            await db.upsertCharge({ ...charge, source });
            await db.logEvent('charge', charge.id, 'updated', null, charge, source);
            result.processed.charges++;
          } catch (error) {
            console.error('[Consistency] Erro ao ingerir charge:', error);
            this.addToRetryQueue({ type: 'charge', data: charge, source });
          }
        }

        // INGERIR ASSINATURAS
        for (const subscription of subscriptions) {
          try {
            await db.upsertSubscription({ ...subscription, source });
            await db.logEvent('subscription', subscription.id, 'updated', null, subscription, source);
            result.processed.subscriptions++;
          } catch (error) {
            console.error('[Consistency] Erro ao ingerir subscription:', error);
            this.addToRetryQueue({ type: 'subscription', data: subscription, source });
          }
        }

        // Salvar status de sincronização
        await db.run(
          `INSERT INTO sync_status (source, last_sync, records_processed, status)
           VALUES (?, ?, ?, 'success')`,
          [source, new Date().toISOString(), result.processed.customers + result.processed.charges + result.processed.subscriptions]
        );

        // Notificar webhooks
        this.notifyWebhooks('data_ingested', result);

        console.log(`[Consistency] ✅ Ingestão concluída (${result.processed.customers} clientes, ${result.processed.charges} cobranças)`);

        return result;
      });

    } catch (error) {
      console.error('[Consistency] ❌ Erro na transação:', error);
      return { success: false, error: error.message };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // RECONCILIAÇÃO AUTOMÁTICA (Detecção e correção de divergências)
  // ────────────────────────────────────────────────────────────────

  async reconcile() {
    try {
      console.log('[Consistency] 🔄 Iniciando reconciliação...');

      const conflicts = await this.db.detectConflicts();

      if (conflicts.length === 0) {
        console.log('[Consistency] ✅ Nenhuma divergência detectada');
        return { success: true, conflicts: 0 };
      }

      console.warn(`[Consistency] ⚠️ ${conflicts.length} divergências encontradas`);

      // Registrar conflitos
      for (const conflict of conflicts) {
        await this.db.recordConflict(conflict);
        console.log(`[Consistency] Conflito registrado: ${conflict.entityType} ${conflict.entityId} (${conflict.field})`);
      }

      // Notificar sobre conflitos
      this.notifyWebhooks('conflicts_detected', { conflicts });

      return { success: true, conflicts: conflicts.length };

    } catch (error) {
      console.error('[Consistency] ❌ Erro na reconciliação:', error);
      return { success: false, error: error.message };
    }
  }

  async startAutoReconciliation() {
    setInterval(async () => {
      await this.reconcile();
    }, this.reconciliationInterval);

    console.log(`[Consistency] ✅ Reconciliação automática ativada (${this.reconciliationInterval / 60000} min)`);
  }

  // ────────────────────────────────────────────────────────────────
  // RETRY LOGIC (Tratamento de falhas transientes)
  // ────────────────────────────────────────────────────────────────

  addToRetryQueue(item) {
    item.retryCount = (item.retryCount || 0) + 1;
    item.nextRetry = Date.now() + (Math.pow(2, item.retryCount) * 1000); // Exponential backoff

    this.retryQueue.push(item);
    console.log(`[Consistency] ⏳ Adicionado à retry queue (tentativa ${item.retryCount})`);
  }

  async startRetryProcessor() {
    setInterval(async () => {
      const now = Date.now();
      const toRetry = this.retryQueue.filter(item => item.nextRetry <= now);

      for (const item of toRetry) {
        if (item.retryCount > 5) {
          console.error(`[Consistency] ❌ Falha permanente após 5 tentativas:`, item);
          this.retryQueue.splice(this.retryQueue.indexOf(item), 1);
          continue;
        }

        try {
          if (item.type === 'customer') {
            await this.db.upsertCustomer({ ...item.data, source: item.source });
          } else if (item.type === 'charge') {
            await this.db.upsertCharge({ ...item.data, source: item.source });
          } else if (item.type === 'subscription') {
            await this.db.upsertSubscription({ ...item.data, source: item.source });
          }

          console.log(`[Consistency] ✅ Retry bem-sucedido: ${item.type} ${item.data.id}`);
          this.retryQueue.splice(this.retryQueue.indexOf(item), 1);

        } catch (error) {
          console.error(`[Consistency] ❌ Retry falhou:`, error);
          this.addToRetryQueue(item);
        }
      }
    }, 10000); // Checar a cada 10 segundos
  }

  // ────────────────────────────────────────────────────────────────
  // WEBHOOK SYSTEM (Notificar sistemas 3º)
  // ────────────────────────────────────────────────────────────────

  subscribe(url, events = ['*']) {
    this.webhookSubscribers.push({ url, events });
    console.log(`[Consistency] 🔔 Webhook inscrito: ${url}`);
  }

  notifyWebhooks(eventType, data) {
    for (const subscriber of this.webhookSubscribers) {
      if (subscriber.events.includes('*') || subscriber.events.includes(eventType)) {
        // Simular webhook (em produção seria HTTP POST)
        this.emit(eventType, { url: subscriber.url, data, timestamp: new Date().toISOString() });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // QUERIES
  // ────────────────────────────────────────────────────────────────

  async getAllData() {
    return this.db.getAllData();
  }

  async getStatus() {
    return {
      initialized: this.isInitialized,
      retryQueueSize: this.retryQueue.length,
      webhookSubscribers: this.webhookSubscribers.length,
      lastSync: await this.db.getSyncStatus(),
      pendingConflicts: await this.db.getConflicts()
    };
  }

  async close() {
    if (this.db) {
      await this.db.close();
    }
  }
}

module.exports = { ConsistencyService };
