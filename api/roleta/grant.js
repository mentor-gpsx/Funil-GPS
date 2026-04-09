const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não suportado' });

  // Validar admin
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (caller?.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  // Validar dados
  const { seller, wheel, timestamp } = req.body;
  if (!seller || !wheel) return res.status(400).json({ error: 'seller e wheel obrigatórios' });
  if (!['alta', 'baixa'].includes(wheel)) return res.status(400).json({ error: 'wheel inválido' });

  // Registrar em log (para auditoria)
  const { error: logErr } = await supabase
    .from('roleta_spins_log')
    .insert({
      admin_id: user.id,
      seller_key: seller,
      wheel,
      action: 'grant',
      created_at: timestamp || new Date().toISOString(),
    });

  if (logErr) return res.status(500).json({ error: `Erro ao registrar: ${logErr.message}` });

  return res.status(200).json({ ok: true, message: `Giro ${wheel} liberado para ${seller}` });
};
