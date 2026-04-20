/**
 * api/funil-by-user.js — Funil Reorganizado por Usuário
 * Retorna: USUÁRIO → ETAPA → LEADS
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
    // Carregar dados agrupados por usuário
    const funilByUser = await clickup.loadFunilByUser();
    console.log('[funil-by-user] funilByUser keys:', Object.keys(funilByUser));
    console.log('[funil-by-user] funilByUser:', JSON.stringify(funilByUser).substring(0, 100));

    // Calcular estatísticas
    const usuarios = Object.keys(funilByUser).map(userName => {
      const userData = funilByUser[userName];
      const totalLeads = Object.values(userData.etapas).reduce((sum, leads) => sum + leads.length, 0);
      const etapasComLeads = Object.entries(userData.etapas)
        .filter(([, leads]) => leads.length > 0)
        .map(([etapa, leads]) => ({ etapa, count: leads.length }));

      return {
        nome: userData.nome,
        totalLeads,
        etapasComLeads,
        etapas: userData.etapas
      };
    });

    const response = {
      usuarios,
      totalUsuarios: usuarios.length,
      totalLeads: usuarios.reduce((sum, u) => sum + u.totalLeads, 0),
      etapas: clickup.ETAPAS,
      timestamp: new Date().toISOString(),
      _debug: {
        funilByUserKeys: Object.keys(funilByUser),
        funilByUserType: typeof funilByUser
      }
    };

    res.writeHead(200);
    return res.end(JSON.stringify(response));
  } catch (error) {
    console.error('Erro ao buscar funil por usuário:', error.message);
    res.writeHead(500);
    return res.end(JSON.stringify({
      error: 'Erro ao sincronizar com ClickUp',
      message: error.message,
    }));
  }
};
