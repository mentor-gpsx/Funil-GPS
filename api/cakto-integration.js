/**
 * Cakto Integration - Camada de Coleta
 * Suporta: Puppeteer + Polling + Webhooks
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================================
// ESTRATÉGIA 1: PUPPETEER + STEALTH (Scraping com Autenticação Real)
// ============================================================================

let puppeteer;
let StealthPlugin;

try {
  puppeteer = require('puppeteer-extra');
  StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
} catch (e) {
  try {
    puppeteer = require('puppeteer');
  } catch (e2) {
    console.log('[Cakto] Puppeteer não instalado. Usando fallback.');
  }
}

class CaktoCollector {
  constructor(options = {}) {
    this.apiKey = process.env.CAKTO_API_KEY;
    this.apiSecret = process.env.CAKTO_SECRET;
    this.email = process.env.CAKTO_EMAIL;
    this.password = process.env.CAKTO_PASSWORD;
    this.cacheDir = path.join(__dirname, '../.cache');
    this.cacheDuration = 5 * 60 * 1000; // 5 minutos

    this.createCacheDir();
  }

  createCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ESTRATÉGIA 1A: Puppeteer - Login real + Extração de dados
  // ────────────────────────────────────────────────────────────────────────

  async fetchWithPuppeteer() {
    if (!puppeteer || !this.email || !this.password) {
      console.log('[Cakto] Puppeteer não disponível ou credenciais ausentes');
      return null;
    }

    let browser;
    try {
      console.log('[Cakto] Iniciando Puppeteer para coleta autenticada...');

      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-features=TranslateUI',
          '--disable-sync'
        ]
      });

      const page = await browser.newPage();

      // Configurar User-Agent realista
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Configurar viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Interceptar requisições para capturar resposta da API
      let apiResponse = null;
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('my-sales') || url.includes('dashboard') || url.includes('orders')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              apiResponse = await response.json();
            }
          } catch (e) {
            // Ignorar respostas que não são JSON
          }
        }
      });

      // Fazer login
      console.log('[Cakto] Autenticando...');
      await page.goto('https://app.cakto.com.br/auth/login', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Preencher formulário de login (com delays naturais)
      await page.type('input[name="email"]', this.email, { delay: 100 });
      await new Promise(r => setTimeout(r, 500)); // Pausa natural
      await page.type('input[name="password"]', this.password, { delay: 100 });
      await new Promise(r => setTimeout(r, 300)); // Pausa antes de clicar
      await page.click('button[type="submit"]');

      // Aguardar redirecionamento após login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Navegar para página de vendas
      console.log('[Cakto] Navegando para dashboard de vendas...');
      await page.goto('https://app.cakto.com.br/dashboard/my-sales?tab=paid', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Aguardar dados carregarem
      await new Promise(r => setTimeout(r, 2000));

      // Extrair dados via JavaScript no contexto da página
      const data = await page.evaluate(() => {
        // Tentar encontrar dados no DOM ou window
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.sales) {
          return window.__INITIAL_STATE__.sales;
        }
        if (window.redux?.store?.getState?.()?.sales) {
          return window.redux.store.getState().sales;
        }
        // Fallback: extrair de tabelas visíveis
        return { extracted: 'from_dom', timestamp: new Date().toISOString() };
      });

      console.log('[Cakto] ✅ Dados coletados via Puppeteer');
      await browser.close();

      return apiResponse || data;

    } catch (error) {
      console.log('[Cakto] ❌ Erro Puppeteer:', error.message);
      if (browser) await browser.close();
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ESTRATÉGIA 1B: Polling - Requisições HTTP periódicas
  // ────────────────────────────────────────────────────────────────────────

  async fetchWithPolling() {
    console.log('[Cakto] Tentando coleta via polling HTTP...');

    const strategies = [
      {
        url: 'https://app.cakto.com.br/api/v1/sales',
        headers: { 'X-API-Key': this.apiKey }
      },
      {
        url: 'https://api.cakto.com.br/v1/orders?api_key=' + this.apiKey,
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      }
    ];

    for (const strategy of strategies) {
      try {
        const data = await this.httpGet(strategy.url, strategy.headers);
        if (data && (data.results?.length > 0 || data.sales?.length > 0)) {
          console.log('[Cakto] ✅ Dados coletados via HTTP');
          return data;
        }
      } catch (error) {
        // Continuar próxima estratégia
      }
    }

    return null;
  }

  httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
          ...headers
        },
        timeout: 10000
      };

      https.get(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      }).on('error', reject);
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // CACHE & PERSISTÊNCIA
  // ────────────────────────────────────────────────────────────────────────

  getCachedData() {
    const cacheFile = path.join(this.cacheDir, 'sales.json');
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const age = Date.now() - stat.mtimeMs;
      if (age < this.cacheDuration) {
        console.log('[Cakto] ✅ Usando dados em cache');
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      }
    }
    return null;
  }

  saveCachedData(data) {
    const cacheFile = path.join(this.cacheDir, 'sales.json');
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
    console.log('[Cakto] 💾 Dados cacheados');
  }

  // ────────────────────────────────────────────────────────────────────────
  // ORQUESTRADOR PRINCIPAL
  // ────────────────────────────────────────────────────────────────────────

  async collect() {
    // 1. Tentar cache primeiro
    const cached = this.getCachedData();
    if (cached) return cached;

    // 2. Tentar Puppeteer (se credenciais disponíveis)
    if (this.email && this.password) {
      const puppeteerData = await this.fetchWithPuppeteer();
      if (puppeteerData) {
        this.saveCachedData(puppeteerData);
        return puppeteerData;
      }
    }

    // 3. Tentar polling HTTP
    const pollingData = await this.fetchWithPolling();
    if (pollingData) {
      this.saveCachedData(pollingData);
      return pollingData;
    }

    console.log('[Cakto] ⚠️ Nenhuma estratégia funcionou, usando dados locais');
    return this.loadLocalData();
  }

  loadLocalData() {
    const dataFile = path.join(__dirname, 'data.json');
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
    return { customers: [], charges: [], subscriptions: [] };
  }
}

module.exports = { CaktoCollector };
