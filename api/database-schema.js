/**
 * Database Schema - Fonte Única de Verdade
 * SQLite com auditoria completa e reconciliação automática
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../.data/cakto.db');

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          console.error('[DB] Erro ao abrir database:', err);
          reject(err);
        } else {
          console.log('[DB] ✅ Conectado ao SQLite');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const queries = [
      // ════════════════════════════════════════════════════════════
      // TABELA: CLIENTES
      // ════════════════════════════════════════════════════════════
      `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'cakto',
        external_id TEXT,
        UNIQUE(email)
      )`,

      // ════════════════════════════════════════════════════════════
      // TABELA: COBRANÇAS
      // ════════════════════════════════════════════════════════════
      `CREATE TABLE IF NOT EXISTS charges (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        customer_name TEXT,
        amount REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('paid', 'pending', 'failed', 'refunded')),
        due_date TEXT,
        paid_date TEXT,
        description TEXT,
        payment_method TEXT CHECK(payment_method IN ('pix', 'boleto', 'cc', 'debit', 'wallet', 'transferencia', 'desconhecido')),
        reference TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'cakto',
        external_id TEXT,
        FOREIGN KEY(customer_id) REFERENCES customers(id),
        UNIQUE(reference)
      )`,

      // ════════════════════════════════════════════════════════════
      // TABELA: ASSINATURAS
      // ════════════════════════════════════════════════════════════
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'cancelled')),
        plan TEXT,
        next_charge_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'cakto',
        external_id TEXT,
        FOREIGN KEY(customer_id) REFERENCES customers(id)
      )`,

      // ════════════════════════════════════════════════════════════
      // TABELA: EVENT LOG (Auditoria + Reconciliação)
      // ════════════════════════════════════════════════════════════
      `CREATE TABLE IF NOT EXISTS event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'charge', 'subscription')),
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('created', 'updated', 'deleted', 'reconciled')),
        old_data TEXT,
        new_data TEXT,
        source TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        hash TEXT,
        processed BOOLEAN DEFAULT 0
      )`,

      // ════════════════════════════════════════════════════════════
      // TABELA: SYNC STATUS (Para controle de sincronização)
      // ════════════════════════════════════════════════════════════
      `CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        last_sync TEXT,
        records_processed INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        status TEXT CHECK(status IN ('success', 'error', 'partial')),
        error_message TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )`,

      // ════════════════════════════════════════════════════════════
      // TABELA: CONFLICT LOG (Detecção de divergências)
      // ════════════════════════════════════════════════════════════
      `CREATE TABLE IF NOT EXISTS conflict_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        source_a TEXT NOT NULL,
        source_b TEXT NOT NULL,
        field TEXT,
        value_a TEXT,
        value_b TEXT,
        resolved BOOLEAN DEFAULT 0,
        resolution TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )`,

      // ════════════════════════════════════════════════════════════
      // ÍNDICES PARA PERFORMANCE
      // ════════════════════════════════════════════════════════════
      `CREATE INDEX IF NOT EXISTS idx_charges_customer ON charges(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_charges_status ON charges(status)`,
      `CREATE INDEX IF NOT EXISTS idx_charges_due_date ON charges(due_date)`,
      `CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_event_log_entity ON event_log(entity_type, entity_id)`,
      `CREATE INDEX IF NOT EXISTS idx_event_log_timestamp ON event_log(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_conflict_log_entity ON conflict_log(entity_type, entity_id)`
    ];

    for (const query of queries) {
      await this.run(query);
    }

    console.log('[DB] ✅ Tabelas criadas/validadas');
  }

  // ────────────────────────────────────────────────────────────────
  // OPERAÇÕES GENÉRICAS
  // ────────────────────────────────────────────────────────────────

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // ────────────────────────────────────────────────────────────────
  // TRANSAÇÕES (Para consistência)
  // ────────────────────────────────────────────────────────────────

  async transaction(callback) {
    try {
      await this.run('BEGIN TRANSACTION');
      const result = await callback(this);
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // OPERAÇÕES DE UPSERT (Idempotentes)
  // ────────────────────────────────────────────────────────────────

  async upsertCustomer(data) {
    const sql = `
      INSERT INTO customers (id, name, email, phone, created_at, source, external_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        updated_at = CURRENT_TIMESTAMP,
        source = excluded.source
    `;

    return this.run(sql, [
      data.id,
      data.name,
      data.email || null,
      data.phone || null,
      data.created_at || new Date().toISOString(),
      data.source || 'cakto',
      data.external_id || null
    ]);
  }

  async upsertCharge(data) {
    const sql = `
      INSERT INTO charges (
        id, customer_id, customer_name, amount, status,
        due_date, paid_date, description, payment_method,
        reference, created_at, source, external_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_id = excluded.customer_id,
        customer_name = excluded.customer_name,
        amount = excluded.amount,
        status = excluded.status,
        due_date = excluded.due_date,
        paid_date = excluded.paid_date,
        description = excluded.description,
        payment_method = excluded.payment_method,
        updated_at = CURRENT_TIMESTAMP
    `;

    return this.run(sql, [
      data.id,
      data.customer_id,
      data.customer_name,
      data.amount || 0,
      data.status || 'pending',
      data.due_date || null,
      data.paid_date || null,
      data.description || null,
      data.payment_method || 'desconhecido',
      data.reference || null,
      data.created_at || new Date().toISOString(),
      data.source || 'cakto',
      data.external_id || null
    ]);
  }

  async upsertSubscription(data) {
    const sql = `
      INSERT INTO subscriptions (
        id, customer_id, amount, status, plan,
        next_charge_date, created_at, source, external_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_id = excluded.customer_id,
        amount = excluded.amount,
        status = excluded.status,
        plan = excluded.plan,
        next_charge_date = excluded.next_charge_date,
        updated_at = CURRENT_TIMESTAMP
    `;

    return this.run(sql, [
      data.id,
      data.customer_id,
      data.amount || 0,
      data.status || 'active',
      data.plan || null,
      data.next_charge_date || null,
      data.created_at || new Date().toISOString(),
      data.source || 'cakto',
      data.external_id || null
    ]);
  }

  // ────────────────────────────────────────────────────────────────
  // AUDITORIA (Event Log)
  // ────────────────────────────────────────────────────────────────

  async logEvent(entityType, entityId, eventType, oldData, newData, source) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(JSON.stringify(newData)).digest('hex');

    const sql = `
      INSERT INTO event_log (entity_type, entity_id, event_type, old_data, new_data, source, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      entityType,
      entityId,
      eventType,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      source,
      hash
    ]);
  }

  // ────────────────────────────────────────────────────────────────
  // RECONCILIAÇÃO (Detecção de divergências)
  // ────────────────────────────────────────────────────────────────

  async detectConflicts() {
    const conflicts = [];

    // Buscar dados por múltiplas fontes
    const customers = await this.all('SELECT * FROM customers');

    for (const customer of customers) {
      // Verificar se há divergências entre versões
      const events = await this.all(
        'SELECT * FROM event_log WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp DESC LIMIT 2',
        ['customer', customer.id]
      );

      if (events.length >= 2) {
        const latest = JSON.parse(events[0].new_data);
        const previous = JSON.parse(events[1].new_data);

        // Buscar campos que divergem
        for (const key of Object.keys(latest)) {
          if (latest[key] !== previous[key]) {
            conflicts.push({
              entityType: 'customer',
              entityId: customer.id,
              field: key,
              valueA: previous[key],
              valueB: latest[key],
              sourceA: events[1].source,
              sourceB: events[0].source
            });
          }
        }
      }
    }

    return conflicts;
  }

  async recordConflict(conflict) {
    const sql = `
      INSERT INTO conflict_log (entity_type, entity_id, source_a, source_b, field, value_a, value_b)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      conflict.entityType,
      conflict.entityId,
      conflict.sourceA,
      conflict.sourceB,
      conflict.field,
      conflict.valueA,
      conflict.valueB
    ]);
  }

  // ────────────────────────────────────────────────────────────────
  // QUERIES DE RELATÓRIO
  // ────────────────────────────────────────────────────────────────

  async getAllData() {
    const customers = await this.all('SELECT * FROM customers');
    const charges = await this.all('SELECT * FROM charges');
    const subscriptions = await this.all('SELECT * FROM subscriptions');

    return {
      customers,
      charges,
      subscriptions,
      synced_at: new Date().toISOString(),
      source: 'database'
    };
  }

  async getSyncStatus() {
    const status = await this.get(
      'SELECT * FROM sync_status ORDER BY timestamp DESC LIMIT 1'
    );
    return status;
  }

  async getConflicts() {
    return this.all('SELECT * FROM conflict_log WHERE resolved = 0');
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else {
          console.log('[DB] ✅ Conexão fechada');
          resolve();
        }
      });
    });
  }
}

module.exports = { Database };
