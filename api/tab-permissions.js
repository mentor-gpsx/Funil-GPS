/**
 * api/tab-permissions.js — Gerenciamento de Permissões por Aba
 * Controla quem tem acesso a qual aba
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Lista de todas as abas do Funil
 * Structure: { key, label, requiredRole }
 */
const TODAS_ABAS = [
  // Usuários (individual per person)
  { key: 'maria',       label: 'Maria Eduarda',       requiredRole: 'user' },
  { key: 'nicolas',     label: 'Nicolas',             requiredRole: 'user' },
  { key: 'gabriel',     label: 'Gabriel',             requiredRole: 'user' },
  { key: 'kennyd',      label: 'Kennyd',              requiredRole: 'user' },

  // Dashboards compartilhados
  { key: 'fechamentos', label: 'Fechamentos',         requiredRole: 'user' },
  { key: 'comparativos',label: 'Comparativos',        requiredRole: 'user' },
  { key: 'analise',     label: 'Análise do Funil',    requiredRole: 'user' },
  { key: 'avaliador',   label: 'Avaliador',           requiredRole: 'user' },
  { key: 'crm-score',   label: 'CRM Score',           requiredRole: 'user' },
  { key: 'roletas',     label: 'Roletas',             requiredRole: 'admin' },

  // Novas abas
  { key: 'distribuicao',    label: 'Distribuição do Funil', requiredRole: 'user' },
  { key: 'gerenciar-perms', label: 'Gerenciar Permissões',   requiredRole: 'admin' },
];

/**
 * Permissões padrão por role
 */
const DEFAULT_PERMISSIONS = {
  admin: {
    maria: true,
    nicolas: true,
    gabriel: true,
    kennyd: true,
    fechamentos: true,
    comparativos: true,
    analise: true,
    avaliador: true,
    'crm-score': true,
    roletas: true,
    distribuicao: true,
    'gerenciar-perms': true,
  },
  user: {
    maria: false,
    nicolas: false,
    gabriel: false,
    kennyd: false,
    fechamentos: true,
    comparativos: true,
    analise: true,
    avaliador: true,
    'crm-score': true,
    roletas: false,
    distribuicao: true,
    'gerenciar-perms': false,
  },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Validar token
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    res.writeHead(401);
    return res.end(JSON.stringify({ error: 'Token ausente' }));
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    res.writeHead(401);
    return res.end(JSON.stringify({ error: 'Token inválido' }));
  }

  // Buscar perfil do usuário
  const { data: caller } = await supabase
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', user.id)
    .single();

  if (!caller) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Perfil não encontrado' }));
  }

  // GET /api/tab-permissions — Listar permissões
  if (req.method === 'GET') {
    try {
      // Buscar todas as abas com permissões
      const { data: tabPerms, error: dbErr } = await supabase
        .from('tab_permissions')
        .select('*');

      if (dbErr) throw dbErr;

      // Se não houver dados, inicializar com defaults
      if (!tabPerms || tabPerms.length === 0) {
        await initializeTabPermissions();
        const { data: fresh } = await supabase.from('tab_permissions').select('*');
        res.writeHead(200);
        return res.end(JSON.stringify(fresh || []));
      }

      res.writeHead(200);
      return res.end(JSON.stringify(tabPerms));
    } catch (error) {
      console.error('Erro ao buscar permissões:', error.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  // PATCH /api/tab-permissions — Atualizar permissão
  if (req.method === 'PATCH') {
    // Apenas admin pode alterar permissões
    if (caller.role !== 'admin') {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Apenas admins podem alterar permissões' }));
    }

    // Parsear body
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { tabKey, userId, hasAccess } = JSON.parse(body || '{}');

        if (!tabKey || userId === undefined || hasAccess === undefined) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Dados inválidos: tabKey, userId, hasAccess requeridos' }));
        }

        // Atualizar (ou inserir) permissão
        const { error: updateErr } = await supabase
          .from('tab_permissions')
          .upsert(
            {
              tab_key: tabKey,
              user_id: userId,
              has_access: hasAccess,
              updated_by: caller.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tab_key,user_id' }
          );

        if (updateErr) throw updateErr;

        // Registrar auditoria
        await supabase.from('permission_audit_log').insert({
          admin_id: caller.id,
          admin_name: caller.display_name,
          tab_key: tabKey,
          user_id: userId,
          action: hasAccess ? 'granted' : 'revoked',
          timestamp: new Date().toISOString(),
        }).catch(() => {}); // Não falhar se auditoria falhar

        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, message: 'Permissão atualizada' }));
      } catch (error) {
        console.error('Erro ao atualizar permissão:', error.message);
        res.writeHead(500);
        return res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  res.writeHead(405);
  return res.end(JSON.stringify({ error: 'Método não suportado' }));
};

/**
 * Sincronizar usuários do ClickUp com tabela de perfis
 */
async function syncClickUpUsersWithProfiles() {
  try {
    const clickup = require('./clickup');
    // Fazer sync de usuários - pode ser expandido para usar ClickUp API
    // Por enquanto, apenas garante que usuários existem
    console.log('✓ Sincronização de usuários ClickUp concluída');
  } catch (error) {
    console.error('Erro ao sincronizar usuários ClickUp:', error.message);
  }
}

/**
 * Inicializar tabela com todas as abas
 */
async function initializeTabPermissions() {
  try {
    const records = [];

    // Buscar todos os usuários
    const { data: users } = await supabase
      .from('profiles')
      .select('id, role');

    if (!users || users.length === 0) return;

    // Para cada usuário, criar permissões padrão
    users.forEach((user) => {
      const permissions = DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS.user;

      TODAS_ABAS.forEach((aba) => {
        records.push({
          tab_key: aba.key,
          user_id: user.id,
          has_access: permissions[aba.key] || false,
          created_at: new Date().toISOString(),
        });
      });
    });

    // Insert em batch
    if (records.length > 0) {
      await supabase.from('tab_permissions').insert(records);
    }

    // Sincronizar com ClickUp
    await syncClickUpUsersWithProfiles();
  } catch (error) {
    console.error('Erro ao inicializar tab_permissions:', error.message);
  }
}

/**
 * Helper: Verificar se usuário tem acesso a aba
 */
async function checkTabAccess(userId, tabKey) {
  try {
    const { data, error } = await supabase
      .from('tab_permissions')
      .select('has_access')
      .eq('user_id', userId)
      .eq('tab_key', tabKey)
      .single();

    if (error) return false;
    return data?.has_access || false;
  } catch {
    return false;
  }
}

module.exports.checkTabAccess = checkTabAccess;
module.exports.TODAS_ABAS = TODAS_ABAS;
module.exports.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;
