/**
 * Cakto Network Interceptor - Captura todas as requisições como se estivesse em DevTools
 * Simula abrir DevTools, ir em Network, logar e coletar dados
 */

const fs = require('fs');
const path = require('path');

class CaktoNetworkInterceptor {
  constructor() {
    this.capturedRequests = new Map();
    this.endpoints = new Map();
    this.dataCache = {};
    this.browser = null;
    this.page = null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // INICIALIZAR PUPPETEER E INTERCEPTAR REDE
  // ────────────────────────────────────────────────────────────────────────

  async init(email, password) {
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (e) {
      console.log('[Interceptor] Puppeteer não disponível');
      return null;
    }

    try {
      console.log('[Interceptor] 🔍 Iniciando captura de rede...');

      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 30000
      });

      this.page = await this.browser.newPage();

      // Interceptar TODAS as requisições
      await this.page.on('response', (response) => this.onResponse(response));
      await this.page.on('requestfinished', (request) => this.onRequestFinished(request));

      // Ir para página de login
      console.log('[Interceptor] 🔐 Navegando para login...');
      await this.page.goto('https://app.cakto.com.br/auth/login', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Fazer login
      if (email && password) {
        console.log('[Interceptor] 📝 Fazendo login...');
        await this.page.type('input[name="email"]', email, { delay: 30 });
        await this.page.type('input[name="password"]', password, { delay: 30 });
        await this.page.click('button[type="submit"]');

        // Aguardar redirecionamento
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      }

      // Navegar para dashboard principal
      console.log('[Interceptor] 📊 Acessando dashboard...');
      await this.page.goto('https://app.cakto.com.br/dashboard/home', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Aguardar um pouco para capturar todas as requisições
      await this.page.waitForTimeout(3000);

      console.log('[Interceptor] ✅ Captura concluída');
      return {
        endpoints: Array.from(this.endpoints.values()),
        dataCache: this.dataCache
      };

    } catch (error) {
      console.log('[Interceptor] ❌ Erro:', error.message);
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // INTERCEPTAR RESPONSES (Como em DevTools Network)
  // ────────────────────────────────────────────────────────────────────────

  async onResponse(response) {
    const url = response.url();
    const status = response.status();

    // Filtrar apenas requisições relevantes (API, dados)
    if (!url.includes('analytics') && !url.includes('google') && !url.includes('cdn')) {
      const contentType = response.headers()['content-type'] || '';

      // Capturar JSON responses
      if (contentType.includes('application/json') && status === 200) {
        try {
          const data = await response.json();

          // Armazenar no cache
          const urlPath = new URL(url).pathname + new URL(url).search;
          this.dataCache[urlPath] = {
            timestamp: new Date().toISOString(),
            data: data,
            status: status
          };

          // Registrar endpoint
          this.registerEndpoint(url, 'GET', contentType, data);

          console.log(`[Interceptor] 📥 ${urlPath}`);

        } catch (e) {
          // Não é JSON válido
        }
      }
    }
  }

  async onRequestFinished(request) {
    const response = request.response();
    if (response && response.status() === 200) {
      // Já foi capturado em onResponse
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // REGISTRAR ENDPOINTS COMO SE ESTIVESSE EM DEVTOOLS
  // ────────────────────────────────────────────────────────────────────────

  registerEndpoint(url, method, contentType, data) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname + urlObj.search;

    const key = `${method} ${pathname}`;

    if (!this.endpoints.has(key)) {
      this.endpoints.set(key, {
        url: url,
        pathname: pathname,
        method: method,
        contentType: contentType,
        dataFields: this.extractDataFields(data),
        sampleData: this.truncate(data, 500)
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // EXTRAIR CAMPOS DE DADOS (Mapeamento de estrutura)
  // ────────────────────────────────────────────────────────────────────────

  extractDataFields(data) {
    const fields = [];

    const extract = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object') {
          extract(obj[0], path);
        }
      } else {
        Object.keys(obj).forEach(key => {
          const fullPath = path ? `${path}.${key}` : key;
          const value = obj[key];

          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            if (!fields.includes(fullPath)) {
              fields.push(fullPath);
            }
          } else if (typeof value === 'object') {
            extract(value, fullPath);
          }
        });
      }
    };

    extract(data);
    return fields;
  }

  truncate(obj, size) {
    const str = JSON.stringify(obj);
    return JSON.parse(str.substring(0, size) + '}');
  }

  // ────────────────────────────────────────────────────────────────────────
  // SALVAR MAPA DE ENDPOINTS
  // ────────────────────────────────────────────────────────────────────────

  async saveEndpointMap() {
    const mapFile = path.join(__dirname, '../.cache/cakto-endpoints-map.json');
    const dir = path.dirname(mapFile);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const map = {
      timestamp: new Date().toISOString(),
      totalEndpoints: this.endpoints.size,
      endpoints: Array.from(this.endpoints.entries()).map(([key, value]) => ({
        key: key,
        ...value
      }))
    };

    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2), 'utf8');
    console.log(`[Interceptor] 💾 Mapa salvo: ${this.endpoints.size} endpoints encontrados`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // FECHAR BROWSER
  // ────────────────────────────────────────────────────────────────────────

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('[Interceptor] ✅ Browser fechado');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // EXPORTAR DADOS CAPTURADOS
  // ────────────────────────────────────────────────────────────────────────

  exportData() {
    return {
      timestamp: new Date().toISOString(),
      endpoints: Array.from(this.endpoints.values()),
      dataCache: this.dataCache,
      totalDataPoints: Object.keys(this.dataCache).length
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FUNÇÃO DE USO
// ════════════════════════════════════════════════════════════════════════════

async function captureAllData(email, password) {
  const interceptor = new CaktoNetworkInterceptor();

  const result = await interceptor.init(email, password);
  await interceptor.saveEndpointMap();
  const exported = interceptor.exportData();
  await interceptor.close();

  return exported;
}

module.exports = { CaktoNetworkInterceptor, captureAllData };
