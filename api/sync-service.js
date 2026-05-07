/**
 * Sync Service - Sincronização Automática de Dados
 * Prioriza: CaktoAPI > CaktoCollector > Dados locais
 */

const { CaktoCollector } = require('./cakto-integration');
const { CaktoAPI } = require('./cakto-api');
const fs = require('fs');
const path = require('path');

class SyncService {
  constructor(options = {}) {
    this.caktoAPI = process.env.CAKTO_CLIENT_ID ? new CaktoAPI() : null;
    this.collector = new CaktoCollector(options);
    this.interval = options.interval || 15 * 60 * 1000;
    this.isRunning = false;
    this.lastSync = null;
    this.statusFile = path.join(__dirname, '../.cache/sync-status.json');
    
    this.createCacheDir();
  }

  createCacheDir() {
    const cacheDir = path.dirname(this.statusFile);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  start() {
    if (this.isRunning) {
      console.log('[Sync] Serviço já está rodando');
      return;
    }

    console.log(`[Sync] ✅ Iniciando sincronização automática (a cada ${this.interval / 60000} min)`);
    this.isRunning = true;

    // Sincronizar imediatamente
    this.sync();

    // Agendar sincronização periódica
    this.timer = setInterval(() => this.sync(), this.interval);
  }

  async sync() {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`[Sync] 🔄 Sincronizando dados... (${timestamp})`);

    try {
      let data;

      // 1. Tentar API oficial primeiro
      if (this.caktoAPI) {
        console.log('[Sync] 📡 Usando API Oficial da Cakto...');
        try {
          data = await this.caktoAPI.getAllData();
          console.log('[Sync] ✅ Dados sincronizados via API Oficial');
        } catch (error) {
          console.warn('[Sync] ⚠️ API Oficial falhou, tentando alternativas...');
          data = null;
        }
      }

      // 2. Fallback para CaktoCollector
      if (!data) {
        console.log('[Sync] 📥 Tentando CaktoCollector...');
        data = await this.collector.collect();
      }

      // 3. Salvar dados
      if (data && (data.customers.length > 0 || data.charges.length > 0)) {
        const dataPath = path.join(__dirname, './data.json');
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
        
        this.lastSync = new Date().toISOString();
        this.saveStatus('success', data);
        
        console.log(`[Sync] ✅ Sincronizado com sucesso (${data.customers.length} clientes, ${data.charges.length} cobranças)`);
      } else {
        this.saveStatus('warning', { message: 'Nenhum dado recebido' });
        console.log('[Sync] ⚠️ Nenhum dado foi sincronizado');
      }
    } catch (error) {
      console.error('[Sync] ❌ Erro na sincronização:', error.message);
      this.saveStatus('error', { error: error.message });
    }
  }

  saveStatus(status, data) {
    const statusData = {
      status,
      timestamp: new Date().toISOString(),
      data
    };
    fs.writeFileSync(this.statusFile, JSON.stringify(statusData, null, 2), 'utf8');
  }

  getStatus() {
    try {
      if (fs.existsSync(this.statusFile)) {
        return JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
      }
    } catch (e) {
      console.error('[Sync] Erro ao ler status:', e.message);
    }
    return { status: 'unknown', lastSync: null };
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.isRunning = false;
      console.log('[Sync] ✅ Serviço parado');
    }
  }
}

module.exports = { SyncService };
