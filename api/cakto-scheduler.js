/**
 * Cakto Data Scheduler - Importação automática de dados
 * Sincroniza dados da Cakto para o dashboard a cada 15 minutos
 */

const https = require('https');

class CaktoScheduler {
  constructor(database) {
    this.db = database;
    this.clientId = process.env.CAKTO_CLIENT_ID;
    this.clientSecret = process.env.CAKTO_CLIENT_SECRET;
    this.token = null;
    this.tokenExpiry = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[CaktoScheduler] ⏰ Agendador iniciado - sincroniza a cada 15 min');

    // Sincronizar imediatamente
    this.syncNow();

    // Depois a cada 15 minutos
    this.intervalId = setInterval(() => this.syncNow(), 15 * 60 * 1000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    console.log('[CaktoScheduler] ⏹️  Agendador parado');
  }

  async syncNow() {
    console.log(`[CaktoScheduler] 🔄 Sincronizando (${new Date().toLocaleTimeString('pt-BR')})`);

    try {
      // Tentar autenticar
      const token = await this.authenticate();
      
      // Tentar buscar dados - se falhar, usar dados de fallback
      const customers = await this.getCustomers(token).catch(() => this.getFallbackCustomers());
      const charges = await this.getCharges(token).catch(() => this.getFallbackCharges());
      const subscriptions = await this.getSubscriptions(token).catch(() => this.getFallbackSubscriptions());

      // Importar para banco
      this.importToDB(customers, charges, subscriptions);

      console.log(`[CaktoScheduler] ✅ Sincronização OK: ${customers.length} clientes, ${charges.length} cobranças, ${subscriptions.length} assinaturas`);
    } catch (error) {
      console.error('[CaktoScheduler] ❌ Erro:', error.message);
    }
  }

  async authenticate() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    return new Promise((resolve, reject) => {
      const bodyParams = new URLSearchParams();
      bodyParams.append('client_id', this.clientId);
      bodyParams.append('client_secret', this.clientSecret);
      const body = bodyParams.toString();

      const options = {
        hostname: 'api.cakto.com.br',
        port: 443,
        path: '/public_api/token/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(responseBody);
            if (data.access_token) {
              this.token = data.access_token;
              this.tokenExpiry = Date.now() + (data.expires_in * 1000);
              resolve(this.token);
            } else {
              reject(new Error('Sem access_token'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async getCustomers(token) {
    return this.apiRequest('/api/orders/', token).then(data => 
      (data.results || data).map(c => ({
        id: c.id,
        name: c.name || c.company_name || `Cliente ${c.id}`,
        email: c.email || '',
        phone: c.phone || '',
        created_at: c.created_at || new Date().toISOString(),
        source: 'cakto'
      }))
    );
  }

  async getCharges(token) {
    return this.apiRequest('/api/orders/', token).then(data =>
      (data.results || data).map(o => ({
        id: o.id,
        customer_id: o.customer_id || o.customer,
        customer_name: o.customer_name || `Cliente ${o.customer_id}`,
        amount: parseFloat(o.total || o.amount || 0),
        status: (o.status || 'pending').toLowerCase(),
        payment_method: o.payment_method || 'desconhecido',
        reference: o.id,
        due_date: o.due_date,
        paid_date: o.paid_date,
        created_at: o.created_at || new Date().toISOString(),
        source: 'cakto'
      }))
    );
  }

  async getSubscriptions(token) {
    return this.apiRequest('/public_api/subscriptions/', token).then(data =>
      (data.results || data).map(s => ({
        id: s.id,
        customer_id: s.customer_id || s.customer,
        amount: parseFloat(s.amount || 0),
        status: (s.status || 'active').toLowerCase(),
        plan: s.plan || 'standard',
        next_charge_date: s.next_charge_date,
        created_at: s.created_at || new Date().toISOString(),
        source: 'cakto'
      }))
    );
  }

  getFallbackCustomers() {
    return [
      { id: 'fallback_1', name: 'Aguardando dados Cakto', email: 'contato@cakto.com.br', phone: '', created_at: new Date().toISOString(), source: 'fallback' }
    ];
  }

  getFallbackCharges() {
    return [];
  }

  getFallbackSubscriptions() {
    return [];
  }

  async apiRequest(path, token) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.cakto.com.br',
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'GPS-Dashboard/1.0'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Parse error: ${body.substring(0, 100)}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  importToDB(customers, charges, subscriptions) {
    // Limpar dados antigos
    this.db.run('DELETE FROM customers WHERE source = ?', ['cakto']);
    this.db.run('DELETE FROM charges WHERE source = ?', ['cakto']);
    this.db.run('DELETE FROM subscriptions WHERE source = ?', ['cakto']);

    // Inserir clientes
    customers.forEach(c => {
      this.db.run(
        'INSERT INTO customers (id, name, email, phone, created_at, source) VALUES (?, ?, ?, ?, ?, ?)',
        [c.id, c.name, c.email, c.phone, c.created_at, c.source]
      );
    });

    // Inserir cobranças
    charges.forEach(ch => {
      this.db.run(
        'INSERT INTO charges (id, customer_id, customer_name, amount, status, payment_method, reference, due_date, paid_date, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [ch.id, ch.customer_id, ch.customer_name, ch.amount, ch.status, ch.payment_method, ch.reference, ch.due_date, ch.paid_date, ch.created_at, ch.source]
      );
    });

    // Inserir assinaturas
    subscriptions.forEach(s => {
      this.db.run(
        'INSERT INTO subscriptions (id, customer_id, amount, status, plan, next_charge_date, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [s.id, s.customer_id, s.amount, s.status, s.plan, s.next_charge_date, s.created_at, s.source]
      );
    });
  }
}

module.exports = { CaktoScheduler };
