/**
 * api/distribuicao.js — Distribuição do Funil
 * Retorna clientes organizados por etapa (sincronizado com ClickUp)
 */

const clickup = require('./clickup');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end(JSON.stringify({ error: 'Método não suportado' }));
  }

  try {
    // Carregar distribuição (com cache automático)
    const distribuicao = await clickup.loadDistribuicao();

    // Formatar resposta
    const response = {
      etapas: clickup.ETAPAS,
      distribuicao,
      timestamp: new Date().toISOString(),
      total_clientes: Object.values(distribuicao).reduce((sum, arr) => sum + arr.length, 0),
    };

    res.writeHead(200);
    return res.end(JSON.stringify(response));
  } catch (error) {
    console.error('Erro ao carregar distribuição:', error.message);
    res.writeHead(500);
    return res.end(JSON.stringify({
      error: 'Erro ao sincronizar com ClickUp',
      message: error.message,
    }));
  }
};
