/**
 * api/funil-by-user.js — Funil Reorganizado por Usuário
 * Retorna: USUÁRIO → ETAPA → LEADS
 */

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

  const ETAPAS = ['Prospecção', 'Stand By', 'Qualificado', 'Reunião Agendada', 'Apresentação', 'Follow-Up', 'Pago'];

  const mockData = {
    'Maria Eduarda': {
      nome: 'Maria Eduarda',
      etapas: {
        'Prospecção': [
          { id: 't1', nome: 'João Silva', email: 'joao@example.com', valor: 5000 },
          { id: 't2', nome: 'Ana Costa', email: 'ana@example.com', valor: 3000 },
        ],
        'Stand By': [],
        'Qualificado': [
          { id: 't4', nome: 'Maria Oliveira', email: 'maria@example.com', valor: 12000 },
        ],
        'Reunião Agendada': [],
        'Apresentação': [],
        'Follow-Up': [],
        'Pago': [
          { id: 't9', nome: 'Diego Machado', email: 'diego@example.com', valor: 50000 },
        ],
      }
    },
    'Nicolas': {
      nome: 'Nicolas',
      etapas: {
        'Prospecção': [],
        'Stand By': [
          { id: 't3', nome: 'Pedro Santos', email: 'pedro@example.com', valor: 8000 },
        ],
        'Qualificado': [
          { id: 't5', nome: 'Carlos Lima', email: 'carlos@example.com', valor: 10000 },
        ],
        'Reunião Agendada': [
          { id: 't6', nome: 'Lucia Martins', email: 'lucia@example.com', valor: 15000 },
        ],
        'Apresentação': [
          { id: 't7', nome: 'Roberto Alves', email: 'roberto@example.com', valor: 20000 },
        ],
        'Follow-Up': [
          { id: 't8', nome: 'Fernanda Rocha', email: 'fernanda@example.com', valor: 25000 },
        ],
        'Pago': [],
      }
    }
  };

  try {
    const usuarios = Object.keys(mockData).map(userName => {
      const userData = mockData[userName];
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
      etapas: ETAPAS,
      timestamp: new Date().toISOString()
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
