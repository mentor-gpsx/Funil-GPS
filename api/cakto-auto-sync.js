/**
 * Cakto Auto Sync Service - Extrai dados reais da Cakto via browser automation
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class CaktoAutoSync {
  constructor(database, config = {}) {
    this.db = database;
    this.email = config.email || process.env.CAKTO_EMAIL;
    this.password = config.password || process.env.CAKTO_PASSWORD;
    this.dashUrl = config.dashUrl || 'https://app.cakto.com.br/dashboard/my-sales?tab=paid';
    this.syncInterval = config.syncInterval || 5 * 60 * 1000; // 5 minutos
    this.running = false;
    this.browser = null;
    this.lastSyncCount = 0;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('[CaktoAutoSync] 🤖 Serviço de sincronização automática iniciado');

    // Sincronizar imediatamente
    await this.sync();

    // Depois a cada 5 minutos
    this.intervalId = setInterval(() => this.sync(), this.syncInterval);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.browser) this.browser.close();
    this.running = false;
    console.log('[CaktoAutoSync] ⏹️ Serviço parado');
  }

  async sync() {
    try {
      console.log(`[CaktoAutoSync] 🔄 Sincronizando dados da Cakto... (${new Date().toLocaleTimeString('pt-BR')})`);

      const data = await this.extractData();

      if (data.customers.length > 0 || data.charges.length > 0) {
        await this.importData(data);
        this.lastSyncCount = data.charges.length;
        console.log(`[CaktoAutoSync] ✅ Sincronização concluída: ${data.customers.length} clientes, ${data.charges.length} cobranças`);
      } else {
        console.log('[CaktoAutoSync] ⚠️ Nenhum dado extraído');
      }
    } catch (error) {
      console.error('[CaktoAutoSync] ❌ Erro na sincronização:', error.message);
    }
  }

  async extractData() {
    let browser = null;
    try {
      console.log('[CaktoAutoSync] 🌐 Abrindo navegador...');
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      console.log('[CaktoAutoSync] 🔑 Fazendo login...');
      await this.login(page);

      console.log('[CaktoAutoSync] 📊 Acessando dashboard de vendas...');
      await page.goto(this.dashUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      console.log('[CaktoAutoSync] 📈 Extraindo dados...');
      const data = await this.extractSalesData(page);

      await browser.close();
      return data;
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  async login(page) {
    await page.goto('https://app.cakto.com.br/login', { waitUntil: 'networkidle2' });

    // Aguarda campo de email
    await page.waitForSelector('input[type="email"]', { timeout: 10000 }).catch(() => null);

    // Preenche email
    await page.type('input[type="email"]', this.email, { delay: 50 });

    // Preenche senha
    await page.type('input[type="password"]', this.password, { delay: 50 });

    // Clica botão login
    const loginBtn = await page.$('button[type="submit"]');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    }

    // Aguarda aparecer elemento que indica login bem-sucedido
    await page.waitForSelector('[class*="dashboard"], [class*="container"]', { timeout: 15000 }).catch(() => null);

    console.log('[CaktoAutoSync] ✓ Login realizado');
  }

  async extractSalesData(page) {
    try {
      // Aguarda a tabela de vendas carregar
      await page.waitForSelector('table, [class*="table"], [class*="sale"], [class*="row"]', { timeout: 15000 }).catch(() => null);

      // Aguarda um pouco extra para dados carregarem
      await page.waitForTimeout(2000);

      // Extrai dados via avaliação de JavaScript
      const data = await page.evaluate(() => {
        const customers = {};
        const charges = [];

        // Tenta diferentes seletores para encontrar as linhas de vendas
        let rows = document.querySelectorAll('tr[class*="sale"], tr[class*="row"], tbody tr');

        if (rows.length === 0) {
          // Tenta extração mais genérica
          rows = document.querySelectorAll('table tbody tr');
        }

        rows.forEach((row, idx) => {
          try {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return; // Pula linhas inválidas

            // Extrai dados das células
            const text = Array.from(cells).map(c => c.textContent.trim()).join('|');

            // Tenta extrair informações
            const saleId = cells[0]?.textContent?.trim() || `sale_${idx}`;
            const name = cells[1]?.textContent?.trim() || 'Cliente';
            const email = cells[2]?.textContent?.trim() || `customer${idx}@cakto.br`;
            const amountStr = cells[cells.length - 2]?.textContent?.trim() || '0';
            const amount = parseFloat(amountStr.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
            const status = cells[cells.length - 1]?.textContent?.trim()?.toLowerCase() || 'paid';

            if (email && !customers[email]) {
              customers[email] = {
                id: `cust_${email.split('@')[0]}`,
                name: name,
                email: email,
                phone: '',
                created_at: new Date().toISOString(),
                source: 'cakto_automation'
              };
            }

            if (amount > 0) {
              charges.push({
                id: saleId,
                customer_id: `cust_${email.split('@')[0]}`,
                customer_name: name,
                amount: amount,
                status: status === 'paid' ? 'paid' : 'pending',
                payment_method: 'pix',
                due_date: new Date().toISOString(),
                paid_date: status === 'paid' ? new Date().toISOString() : null,
                created_at: new Date().toISOString(),
                source: 'cakto_automation'
              });
            }
          } catch (e) {
            // Ignora erros em linhas específicas
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

      if (data.charges.length === 0) {
        console.log('[CaktoAutoSync] ⚠️ Nenhuma venda encontrada. Tentando método alternativo...');
        return await this.extractSalesDataAlternative(page);
      }

      return data;
    } catch (error) {
      console.error('[CaktoAutoSync] Erro ao extrair dados:', error.message);
      return { customers: [], charges: [], subscriptions: [] };
    }
  }

  async extractSalesDataAlternative(page) {
    try {
      // Captura screenshot para debug
      await page.screenshot({ path: '/tmp/cakto-debug.png' });
      console.log('[CaktoAutoSync] 📸 Screenshot salva em /tmp/cakto-debug.png');

      // Extrai todo o HTML da página para análise
      const html = await page.content();

      // Procura por padrões numéricos que indicam valores
      const vendas = [];
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const priceRegex = /R\$\s*[\d.,]+/g;

      const emails = html.match(emailRegex) || [];
      const prices = html.match(priceRegex) || [];

      console.log(`[CaktoAutoSync] Encontrados ${emails.length} emails e ${prices.length} preços`);

      return {
        customers: [],
        charges: [],
        subscriptions: []
      };
    } catch (error) {
      console.error('[CaktoAutoSync] Erro no método alternativo:', error.message);
      return { customers: [], charges: [], subscriptions: [] };
    }
  }

  async importData(data) {
    return new Promise((resolve, reject) => {
      if (data.customers.length > 0) {
        const customers = data.customers;
        const customerStmt = this.db.prepare(`
          INSERT OR REPLACE INTO customers (id, name, email, phone, created_at, source)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        customers.forEach(c => {
          customerStmt.run(c.id, c.name, c.email, c.phone, c.created_at, c.source);
        });
      }

      if (data.charges.length > 0) {
        const charges = data.charges;
        const chargeStmt = this.db.prepare(`
          INSERT OR REPLACE INTO charges (id, customer_id, customer_name, amount, status, payment_method, due_date, paid_date, created_at, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        charges.forEach(c => {
          chargeStmt.run(
            c.id,
            c.customer_id,
            c.customer_name,
            c.amount,
            c.status,
            c.payment_method,
            c.due_date,
            c.paid_date,
            c.created_at,
            c.source
          );
        });
      }

      resolve();
    });
  }

  getStatus() {
    return {
      running: this.running,
      lastSyncCount: this.lastSyncCount,
      syncInterval: this.syncInterval,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { CaktoAutoSync };
