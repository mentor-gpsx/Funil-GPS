/**
 * api/clickup.js — Integração com ClickUp
 * Fetch clientes + etapas do CRM-VENDAS
 */

const https = require('https');

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY || '';

// Cache simples em memória (em produção, usar Redis)
const cache = {
  data: null,
  timestamp: null,
  TTL: 5 * 60 * 1000, // 5 minutos
};

/**
 * Fetch de lista ClickUp com tarefas (com paginação)
 */
async function fetchClickUpList(listId) {
  const allTasks = [];
  let page = 0;

  while (true) {
    const tasks = await new Promise((resolve, reject) => {
      if (!CLICKUP_API_KEY) {
        return reject(new Error('CLICKUP_API_KEY não configurada'));
      }

      const options = {
        hostname: 'api.clickup.com',
        port: 443,
        path: `/api/v2/list/${listId}/task?include_subtasks=false&limit=100&page=${page}&include_closed=true&archived=false&order_by=created&order_direction=asc`,
        method: 'GET',
        headers: {
          'Authorization': CLICKUP_API_KEY,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);

            if (res.statusCode !== 200) {
              return reject(new Error(`ClickUp API error ${res.statusCode}: ${parsed.err || 'Unknown error'}`));
            }

            resolve(parsed.tasks || []);
          } catch (e) {
            reject(new Error(`Invalid JSON from ClickUp: ${e.message}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('[ClickUp] Request error:', error.message);
        reject(error);
      });

      req.setTimeout(15000, () => {
        req.abort();
        reject(new Error('ClickUp API timeout after 15s'));
      });

      req.end();
    });

    allTasks.push(...tasks);
    console.log(`[ClickUp] Page ${page}: ${tasks.length} tasks (total: ${allTasks.length})`);

    if (tasks.length < 100) break; // última página
    page++;
  }

  return { tasks: allTasks };
}

/**
 * Parse tarefas do ClickUp em formato unificado
 * Esperado: Tarefa com campo de status/grupo indicando a etapa
 */
function parseClickUpTasks(tasks, listId) {
  const ETAPAS = [
    'Prospecção',
    'Stand By',
    'Qualificado',
    'Reunião Agendada',
    'Apresentação',
    'Follow-Up',
    'Negociação',
    'Pago',
  ];

  const distribuicao = {};
  ETAPAS.forEach((etapa) => {
    distribuicao[etapa] = [];
  });

  tasks.forEach((task) => {
    // Extrair etapa do status ou campo customizado
    let etapa = task.status?.status || 'Prospecção';

    // Normalizar nome da etapa
    const etapaMatch = ETAPAS.find(e =>
      e.toLowerCase() === etapa.toLowerCase() ||
      task.name?.toLowerCase().includes(e.toLowerCase())
    );

    if (etapaMatch && distribuicao[etapaMatch]) {
      distribuicao[etapaMatch].push({
        id: task.id,
        nome: task.name || 'Sem nome',
        email: task.custom_fields?.find(f => f.id === 'email')?.value || '',
        valor: task.custom_fields?.find(f => f.id === 'valor')?.value || 0,
      });
    }
  });

  return distribuicao;
}

/**
 * Carregar dados com cache
 */
async function loadDistribuicao() {
  // Verificar cache
  if (cache.data && Date.now() - cache.timestamp < cache.TTL) {
    return cache.data;
  }

  try {
    if (!CLICKUP_API_KEY) {
      console.warn('⚠️  CLICKUP_API_KEY não configurada. Retornando dados mock.');
      return getMockDistribuicao();
    }

    // Use List ID correto do CRM-VENDAS
    const CRM_VENDAS_LIST_ID = process.env.CLICKUP_LIST_ID || '901309503357';

    const response = await fetchClickUpList(CRM_VENDAS_LIST_ID);
    const distribuicao = parseClickUpTasks(response.tasks || [], CRM_VENDAS_LIST_ID);

    // Cachear
    cache.data = distribuicao;
    cache.timestamp = Date.now();

    return distribuicao;
  } catch (error) {
    console.error('Erro ao buscar ClickUp:', error.message);
    // Fallback para dados em cache ou mock
    return cache.data || getMockDistribuicao();
  }
}

/**
 * Carregar dados agrupados por USUÁRIO → ETAPA → LEADS
 * Nova estrutura para refatoração do funil
 */
async function loadFunilByUser() {
  try {
    if (!CLICKUP_API_KEY) {
      return getMockFunilByUser();
    }

    // Use List ID correto do CRM-VENDAS
    const CRM_VENDAS_LIST_ID = process.env.CLICKUP_LIST_ID || '901309503357';
    const response = await fetchClickUpList(CRM_VENDAS_LIST_ID);
    console.log(`[ClickUp] Carregadas ${response.tasks?.length || 0} tarefas do CRM-VENDAS`);

    const ETAPAS = ['Prospecção', 'Stand By', 'Qualificado', 'Reunião Agendada', 'Apresentação', 'Follow-Up', 'Negociação', 'Pago'];
    const funilByUser = {};

    (response.tasks || []).forEach((task) => {
      // Pega TODOS os assignees, não só o primeiro
      const assignees = task.assignees || [];
      const userNames = assignees.length > 0
        ? assignees.map(a => a.username)
        : ['Sem Responsável'];

      let etapa = task.status?.status || 'Prospecção';
      const etapaMatch = ETAPAS.find(e =>
        e.toLowerCase() === etapa.toLowerCase() ||
        task.name?.toLowerCase().includes(e.toLowerCase())
      ) || 'Prospecção';

      const leadData = {
        id: task.id,
        nome: task.name || 'Sem nome',
        email: task.custom_fields?.find(f => f.id === 'email')?.value || '',
        valor: task.custom_fields?.find(f => f.id === 'valor')?.value || 0,
      };

      // Adiciona tarefa para cada assignee
      userNames.forEach(userName => {
        if (!funilByUser[userName]) {
          funilByUser[userName] = {
            nome: userName,
            etapas: {}
          };
          ETAPAS.forEach(e => {
            funilByUser[userName].etapas[e] = [];
          });
        }

        if (funilByUser[userName].etapas[etapaMatch]) {
          funilByUser[userName].etapas[etapaMatch].push(leadData);
        }
      });
    });

    return funilByUser;
  } catch (error) {
    console.error('Erro ao buscar funil por usuário:', error.message);
    throw error;
  }
}

/**
 * Dados mock para desenvolvimento
 */
function getMockDistribuicao() {
  return {
    'Prospecção': [
      { id: 't1', nome: 'João Silva', email: 'joao@example.com', valor: 5000 },
      { id: 't2', nome: 'Ana Costa', email: 'ana@example.com', valor: 3000 },
    ],
    'Stand By': [
      { id: 't3', nome: 'Pedro Santos', email: 'pedro@example.com', valor: 8000 },
    ],
    'Qualificado': [
      { id: 't4', nome: 'Maria Oliveira', email: 'maria@example.com', valor: 12000 },
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
    'Pago': [
      { id: 't9', nome: 'Diego Machado', email: 'diego@example.com', valor: 50000 },
    ],
  };
}

/**
 * Dados mock agrupados por usuário
 */
function getMockFunilByUser() {
  const ETAPAS = ['Prospecção', 'Stand By', 'Qualificado', 'Reunião Agendada', 'Apresentação', 'Follow-Up', 'Negociação', 'Pago'];

  return {
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
}

/**
 * Clear cache (útil para testes)
 */
function clearCache() {
  cache.data = null;
  cache.timestamp = null;
}

/**
 * Buscar usuários do ClickUp pelo Team ID
 */
async function fetchClickUpUsers() {
  const TEAM_ID = process.env.CLICKUP_TEAM_ID || '9013550760';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.clickup.com',
      port: 443,
      path: `/api/v2/team/${TEAM_ID}/member`,
      method: 'GET',
      headers: {
        'Authorization': CLICKUP_API_KEY,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.err) {
            reject(new Error(`ClickUp API: ${json.err}`));
          } else {
            resolve(json.members || []);
          }
        } catch (e) {
          reject(new Error('Invalid JSON from ClickUp'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000);
    req.end();
  });
}

module.exports = {
  loadDistribuicao,
  loadFunilByUser,
  fetchClickUpUsers,
  clearCache,
  ETAPAS: ['Prospecção', 'Stand By', 'Qualificado', 'Reunião Agendada', 'Apresentação', 'Follow-Up', 'Pago'],
};
