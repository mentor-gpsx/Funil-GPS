const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cache simples em memória — evita múltiplas chamadas ao ClickUp por ciclo
const cache = {};
const CACHE_TTL = 20_000; // 20 segundos

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Validar token Supabase
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

  const listId = req.query.listId || process.env.CLICKUP_LIST_ID;
  const page   = req.query.page   || '0';
  const cacheKey = `${listId}-${page}`;
  const now = Date.now();

  // Retornar cache se ainda válido
  if (cache[cacheKey] && now - cache[cacheKey].ts < CACHE_TTL) {
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const r = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?archived=false&limit=100&page=${page}`,
      { headers: { Authorization: process.env.CLICKUP_API_KEY } }
    );
    if (!r.ok) throw new Error(`ClickUp HTTP ${r.status}`);
    const data = await r.json();
    cache[cacheKey] = { ts: now, data };
    return res.status(200).json(data);
  } catch (err) {
    console.error('[api/tasks]', err.message);
    return res.status(502).json({ error: 'Falha ao buscar dados do ClickUp' });
  }
};
