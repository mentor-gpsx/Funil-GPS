/**
 * Cakto Official API Integration - CORRIGIDO
 */

const https = require('https');

class CaktoAPI {
  constructor() {
    this.clientId = process.env.CAKTO_CLIENT_ID;
    this.clientSecret = process.env.CAKTO_CLIENT_SECRET;
    this.token = null;
    this.tokenExpiry = null;
  }

  async request(method, path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.cakto.com.br',
        port: 443,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GPS-Dashboard/1.0'
        }
      };

      if (this.token) {
        options.headers['Authorization'] = `Bearer ${this.token}`;
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(data)}`));
            } else {
              resolve(data);
            }
          } catch (e) {
            reject(new Error(`Parse error: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  async authenticate() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    console.log('[Cakto API] 🔐 Autenticando via API Key (client_id + client_secret)...');

    try {
      // Parâmetros no BODY (application/x-www-form-urlencoded)
      // Conforme docs oficiais: https://docs.cakto.com.br/authentication
      // O endpoint aceita APENAS client_id e client_secret (sem grant_type).
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
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'GPS-Dashboard/1.0'
        }
      };

      const response = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let responseBody = '';
          res.on('data', chunk => responseBody += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(responseBody) });
            } catch (e) {
              reject(new Error(`Parse error: ${responseBody}`));
            }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      if (response.status >= 400 || response.data.error) {
        throw new Error(`${response.data.error || `HTTP ${response.status}`} - ${JSON.stringify(response.data)}`);
      }

      this.token = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      console.log('[Cakto API] ✅ Autenticado! Token válido por', Math.round(response.data.expires_in / 3600), 'horas');
      return this.token;
    } catch (error) {
      console.error('[Cakto API] ❌ Erro de autenticação:', error.message);
      throw error;
    }
  }

  async getCustomers() {
    await this.authenticate();
    console.log('[Cakto API] 👥 Buscando clientes...');
    try {
      const data = await this.request('GET', '/public_api/customers/');
      const customers = (data.results || data).map(c => ({
        id: c.id,
        name: c.name || c.company_name,
        email: c.email,
        phone: c.phone,
        created_at: c.created_at || new Date().toISOString(),
        source: 'cakto_api'
      }));
      console.log(`[Cakto API] ✅ ${customers.length} clientes`);
      return customers;
    } catch (e) {
      console.error('[Cakto API] ❌', e.message);
      return [];
    }
  }

  async getCharges() {
    await this.authenticate();
    console.log('[Cakto API] 💳 Buscando cobranças...');
    try {
      const data = await this.request('GET', '/public_api/orders/');
      const charges = (data.results || data).map(o => ({
        id: o.id,
        customer_id: o.customer_id || o.customer,
        customer_name: o.customer_name,
        amount: parseFloat(o.total || o.amount),
        status: (o.status || 'pending').toLowerCase(),
        payment_method: o.payment_method || 'desconhecido',
        reference: o.id,
        due_date: o.due_date,
        paid_date: o.paid_date,
        created_at: o.created_at || new Date().toISOString(),
        source: 'cakto_api'
      }));
      console.log(`[Cakto API] ✅ ${charges.length} cobranças`);
      return charges;
    } catch (e) {
      console.error('[Cakto API] ❌', e.message);
      return [];
    }
  }

  async getSubscriptions() {
    await this.authenticate();
    console.log('[Cakto API] 📅 Buscando assinaturas...');
    try {
      const data = await this.request('GET', '/public_api/subscriptions/');
      const subs = (data.results || data).map(s => ({
        id: s.id,
        customer_id: s.customer_id || s.customer,
        amount: parseFloat(s.amount),
        status: (s.status || 'active').toLowerCase(),
        plan: s.plan_name || s.plan,
        next_charge_date: s.next_charge_date,
        created_at: s.created_at || new Date().toISOString(),
        source: 'cakto_api'
      }));
      console.log(`[Cakto API] ✅ ${subs.length} assinaturas`);
      return subs;
    } catch (e) {
      console.error('[Cakto API] ❌', e.message);
      return [];
    }
  }

  async getAllData() {
    console.log('[Cakto API] 🔄 Sincronizando dados...');
    const [customers, charges, subscriptions] = await Promise.all([
      this.getCustomers(),
      this.getCharges(),
      this.getSubscriptions()
    ]);
    return { customers, charges, subscriptions, synced_at: new Date().toISOString(), source: 'cakto_api' };
  }
}

module.exports = { CaktoAPI };
