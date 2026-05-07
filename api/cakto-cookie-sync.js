/**
 * Cakto Cookie Sync - Extrai dados usando sessão autenticada (cookie)
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class CaktoCookieSync {
  constructor(database, config = {}) {
    this.db = database;
    this.dashUrl = config.dashUrl || 'https://app.cakto.com.br/dashboard/my-sales?tab=paid';
    this.cookieString = config.cookies || ''; // Será preenchido após login manual
    this.syncInterval = config.syncInterval || 5 * 60 * 1000;
    this.running = false;
    this.lastSyncCount = 0;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('[CaktoCookieSync] 🤖 Serviço de sincronização iniciado');

    await this.sync();
    this.intervalId = setInterval(() => this.sync(), this.syncInterval);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.running = false;
    console.log('[CaktoCookieSync] ⏹️ Serviço parado');
  }

  async sync() {
    try {
      console.log(`[CaktoCookieSync] 🔄 Sincronizando... (${new Date().toLocaleTimeString('pt-BR')})`);

      const data = await this.extractData();

      if (data.charges && data.charges.length > 0) {
        await this.importData(data);
        this.lastSyncCount = data.charges.length;
        console.log(`[CaktoCookieSync] ✅ Sincronizado: ${data.customers?.length || 0} clientes, ${data.charges.length} cobranças`);
      } else {
        console.log('[CaktoCookieSync] ⚠️ Nenhum dado extraído');
      }
    } catch (error) {
      console.error('[CaktoCookieSync] ❌ Erro:', error.message);
    }
  }

  async extractData() {
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Define cookies se disponíveis
      if (this.cookieString) {
        try {
          const cookies = JSON.parse(this.cookieString);
          await page.setCookie(...cookies);
        } catch (e) {
          console.log('[CaktoCookieSync] ⚠️ Cookies inválidos');
        }
      }

      console.log('[CaktoCookieSync] 📊 Acessando dashboard...');
      await page.goto(this.dashUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => null);

      console.log('[CaktoCookieSync] 📈 Extraindo dados...');
      await new Promise(r => setTimeout(r, 3000)); // Aguarda 3s para dados carregar
      const data = await this.extractSalesData(page);

      await browser.close();
      return data;
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  async extractSalesData(page) {
    try {
      // Aguarda dados carregarem
      await new Promise(r => setTimeout(r, 1000));

      const data = await page.evaluate(() => {
        const customers = {};
        const charges = [];

        // Tenta extrair dados via análise do HTML
        const rows = document.querySelectorAll('table tbody tr, [class*="table"] tr, [class*="row"]');

        rows.forEach((row, idx) => {
          try {
            const cells = row.querySelectorAll('td, [class*="cell"]');
            if (cells.length < 2) return;

            // Extrai texto de todas as células
            const cellsText = Array.from(cells).map(c => c.textContent.trim()).filter(t => t);
            const fullText = cellsText.join('|');

            // Tenta encontrar padrões
            // Padrão esperado da Cakto: ID | Nome | Email | Valor | Status | Data
            const emailMatch = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            const priceMatch = fullText.match(/R\$\s*([\d.,]+)|(\d+[.,]\d+)/);

            if (emailMatch && priceMatch) {
              const email = emailMatch[0];
              const priceStr = priceMatch[1] || priceMatch[2];
              const amount = parseFloat(priceStr.replace(/[^\d,.-]/g, '').replace(',', '.'));

              const name = cellsText[1] || `Cliente ${idx}`;
              const saleId = cellsText[0] || `sale_${idx}`;

              if (!customers[email]) {
                customers[email] = {
                  id: `cust_${email.split('@')[0]}`,
                  name: name,
                  email: email,
                  phone: '',
                  created_at: new Date().toISOString(),
                  source: 'cakto_cookie'
                };
              }

              if (amount > 0) {
                charges.push({
                  id: saleId,
                  customer_id: `cust_${email.split('@')[0]}`,
                  customer_name: name,
                  amount: amount,
                  status: 'paid',
                  payment_method: 'pix',
                  due_date: new Date().toISOString(),
                  paid_date: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                  source: 'cakto_cookie'
                });
              }
            }
          } catch (e) {
            // Ignora erros
          }
        });

        return {
          customers: Object.values(customers),
          charges: charges,
          subscriptions: [],
          extractedAt: new Date().toISOString(),
          rowCount: rows.length
        };
      });

      return data;
    } catch (error) {
      console.error('[CaktoCookieSync] Erro ao extrair:', error.message);
      return { customers: [], charges: [], subscriptions: [] };
    }
  }

  async importData(data) {
    return new Promise((resolve, reject) => {
      if (data.customers && data.customers.length > 0) {
        const customerStmt = this.db.prepare(`
          INSERT OR REPLACE INTO customers (id, name, email, phone, created_at, source)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        data.customers.forEach(c => {
          customerStmt.run(c.id, c.name, c.email, c.phone, c.created_at, c.source);
        });
      }

      if (data.charges && data.charges.length > 0) {
        const chargeStmt = this.db.prepare(`
          INSERT OR REPLACE INTO charges (id, customer_id, customer_name, amount, status, payment_method, due_date, paid_date, created_at, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        data.charges.forEach(c => {
          chargeStmt.run(
            c.id, c.customer_id, c.customer_name, c.amount, c.status,
            c.payment_method, c.due_date, c.paid_date, c.created_at, c.source
          );
        });
      }

      resolve();
    });
  }

  setCookies(cookieString) {
    this.cookieString = cookieString;
  }

  getStatus() {
    return {
      running: this.running,
      lastSyncCount: this.lastSyncCount,
      hasCookies: !!this.cookieString,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { CaktoCookieSync };
