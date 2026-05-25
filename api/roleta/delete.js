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

  // ──────────────────────────────────────────────────────────────────
  // Validar autenticação e autorização
  // ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

  const { data: caller } = await supabase
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', user.id)
    .single();

  if (!caller) return res.status(404).json({ error: 'Perfil não encontrado' });
  if (caller.role !== 'admin') return res.status(403).json({ error: 'Apenas admins podem deletar roletas' });

  // ──────────────────────────────────────────────────────────────────
  // Validar dados de entrada
  // ──────────────────────────────────────────────────────────────────
  const { prizeId, reason } = req.body;
  if (!prizeId) return res.status(400).json({ error: 'prizeId obrigatório' });

  try {
    // ──────────────────────────────────────────────────────────────────
    // 1. Buscar o prêmio para validar e obter dados para auditoria
    // ──────────────────────────────────────────────────────────────────
    const { data: prize, error: fetchErr } = await supabase
      .from('prize_history')
      .select('*')
      .eq('id', prizeId)
      .single();

    if (fetchErr || !prize) {
      return res.status(404).json({ error: 'Prêmio não encontrado' });
    }

    // Validar: não deletar algo já deletado
    if (prize.is_deleted) {
      return res.status(409).json({ error: 'Este prêmio já foi deletado' });
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. Marcar o prêmio como deletado em prize_history
    // ──────────────────────────────────────────────────────────────────
    const deletedAt = new Date().toISOString();
    const { error: deleteErr } = await supabase
      .from('prize_history')
      .update({
        is_deleted: true,
        deleted_at: deletedAt,
        deleted_by: caller.id,
        deletion_reason: reason || null,
      })
      .eq('id', prizeId);

    if (deleteErr) {
      console.error('[Roleta] Erro ao marcar prêmio como deletado:', deleteErr);
      return res.status(500).json({ error: `Erro ao deletar: ${deleteErr.message}` });
    }

    // ──────────────────────────────────────────────────────────────────
    // 3. Registrar na auditoria (roleta_deletions_log)
    // ──────────────────────────────────────────────────────────────────
    const { error: auditErr } = await supabase
      .from('roleta_deletions_log')
      .insert({
        prize_id: prizeId,
        seller_key: prize.seller_key,
        seller_name: prize.seller_name,
        wheel: prize.wheel,
        prize_label: prize.prize_label,
        closing_id: prize.closing_id,
        deleted_by: caller.id,
        deleted_by_name: caller.display_name,
        deletion_timestamp: deletedAt,
        deletion_reason: reason || null,
      });

    if (auditErr) {
      console.error('[Roleta] Erro ao registrar auditoria:', auditErr);
      // Não falhar a operação se auditoria falhar — já foi deletado
    }

    // ──────────────────────────────────────────────────────────────────
    // 4. Retornar sucesso
    // ──────────────────────────────────────────────────────────────────
    return res.status(200).json({
      ok: true,
      message: `Prêmio deletado com sucesso`,
      deletedPrizeId: prizeId,
      deletedAt,
      deletedBy: caller.display_name,
    });

  } catch (error) {
    console.error('[Roleta] Erro ao deletar prêmio:', error);
    return res.status(500).json({ error: `Erro interno: ${error.message}` });
  }
};
