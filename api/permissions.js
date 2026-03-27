const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // bypassa RLS
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Validar token e verificar se é admin
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

  // GET — listar todos os sellers
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, seller_key, display_name, permissions')
      .eq('role', 'seller')
      .not('seller_key', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // PATCH — atualizar permissões de um perfil
  if (req.method === 'PATCH') {
    const { profileId, permissions } = req.body;
    if (!profileId || !permissions) return res.status(400).json({ error: 'Dados inválidos' });

    const { error } = await supabase
      .from('profiles')
      .update({ permissions })
      .eq('id', profileId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método não suportado' });
};
