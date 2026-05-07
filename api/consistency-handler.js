/**
 * Handler que integra ConsistencyService ao servidor HTTP
 * Garante que TODAS as operações passem pela fonte única de verdade (Database)
 */

const { ConsistencyService } = require('./consistency-service');
const fs = require('fs');
const path = require('path');

let consistencyService = null;

async function initConsistencyService() {
  consistencyService = new ConsistencyService();
  const initialized = await consistencyService.init();

  if (initialized) {
    console.log('[Handler] ✅ ConsistencyService inicializado');

    // Inscrever em webhooks para logging
    consistencyService.on('data_ingested', (event) => {
      console.log('[Handler] Webhook: data_ingested', event);
    });

    consistencyService.on('conflicts_detected', (event) => {
      console.log('[Handler] Webhook: conflicts_detected', event.conflicts.length);
    });

    // Tentar ingerir dados iniciais do data.json
    try {
      const dataFile = path.join(__dirname, 'data.json');
      if (fs.existsSync(dataFile)) {
        const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        await consistencyService.ingestData(data, 'data.json');
      }
    } catch (error) {
      console.error('[Handler] Erro ao ingerir data.json:', error);
    }
  }

  return initialized;
}

async function handleGetData(req, res) {
  if (!consistencyService) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ConsistencyService not initialized' }));
    return;
  }

  try {
    const data = await consistencyService.getAllData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleSaveData(req, res, body) {
  if (!consistencyService) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ConsistencyService not initialized' }));
    return;
  }

  try {
    const data = JSON.parse(body);

    // Ingerir através do ConsistencyService (garante consistência)
    const result = await consistencyService.ingestData(data, 'api_save');

    // Também salvar em data.json como backup
    const dataFile = path.join(__dirname, 'data.json');
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...result }));

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: error.message }));
  }
}

async function handleConsistencyStatus(req, res) {
  if (!consistencyService) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ConsistencyService not initialized' }));
    return;
  }

  try {
    const status = await consistencyService.getStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleReconcile(req, res) {
  if (!consistencyService) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ConsistencyService not initialized' }));
    return;
  }

  try {
    const result = await consistencyService.reconcile();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

module.exports = {
  initConsistencyService,
  handleGetData,
  handleSaveData,
  handleConsistencyStatus,
  handleReconcile
};
