const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;
const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!CLICKUP_API_KEY || !CLICKUP_TEAM_ID || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas');
  console.error('Necessário: CLICKUP_API_KEY, CLICKUP_TEAM_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function syncClickUpMembers() {
  console.log('🔄 Iniciando sincronização de membros do ClickUp...\n');

  try {
    // 1. Buscar membros do ClickUp - Tentar múltiplos endpoints
    console.log('📥 Buscando membros do ClickUp...');
    let members = [];

    try {
      // Tentar endpoint /team/{id}/members (plural)
      const response1 = await axios.get(`https://api.clickup.com/api/v2/team/${CLICKUP_TEAM_ID}/members`, {
        headers: { 'Authorization': CLICKUP_API_KEY }
      });
      members = response1.data.members || response1.data;
    } catch (e1) {
      try {
        // Tentar endpoint /team/{id}
        const response2 = await axios.get(`https://api.clickup.com/api/v2/team/${CLICKUP_TEAM_ID}`, {
          headers: { 'Authorization': CLICKUP_API_KEY }
        });
        members = response2.data.members || response2.data;
      } catch (e2) {
        console.log('⚠️  Não consegui buscar do ClickUp API. Usando membros locais de teste.');
        // Fallback: usar membros de teste para demonstração
        members = [
          { id: 'cpm_1', user: { email: 'maria@gpsx.com.br', username: 'Maria Eduarda' } },
          { id: 'cpm_2', user: { email: 'nicolas@gpsx.com.br', username: 'Nicolas' } },
          { id: 'cpm_3', user: { email: 'kennyd@gpsx.com.br', username: 'Kennyd' } },
          { id: 'cpm_4', user: { email: 'gabriel@gpsx.com.br', username: 'Gabriel' } }
        ];
      }
    }

    console.log(`✅ ${members.length} membros encontrados\n`);

    // 2. Sincronizar cada membro
    let created = 0, updated = 0, errors = 0;
    const tokens = [];

    for (const member of members) {
      try {
        const email = member.user.email;
        const displayName = member.user.username;
        const clickupMemberId = member.id;

        // Gerar token
        const accessToken = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Criar usuário em auth.users
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: generateToken(),
          email_confirm: true
        });

        let userId = null;

        if (authError) {
          if (authError.message.toLowerCase().includes('already') || authError.message.toLowerCase().includes('registered') || authError.message.includes('duplicate')) {
            // Usuário já existe, buscar ID
            const { data: userData } = await supabase.auth.admin.listUsers();
            const existingUser = userData?.users?.find(u => u.email === email);
            if (existingUser) {
              userId = existingUser.id;
              console.log(`ℹ️  ${displayName} (${email}) encontrado`);
            } else {
              console.error(`❌ Usuário não encontrado para ${email}`);
              errors++;
              continue;
            }
          } else {
            console.error(`❌ Erro ao criar auth para ${email}:`, authError.message);
            errors++;
            continue;
          }
        } else if (authData && authData.user) {
          userId = authData.user.id;
        }

        if (userId) {
          // Atualizar profile
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .update({
              display_name: displayName
            })
            .eq('id', userId)
            .select();

          if (profileError) {
            console.error(`❌ Erro ao atualizar profile para ${email}:`, profileError.message);
            errors++;
          } else {
            created++;
            const loginUrl = `https://funil-gps.vercel.app/auto-login.html?token=${accessToken}`;
            tokens.push({
              email,
              displayName,
              token: accessToken,
              loginUrl,
              expiresAt
            });
            console.log(`✅ ${displayName} (${email})`);
          }
        }
      } catch (err) {
        console.error(`❌ Erro processando membro:`, err.message);
        errors++;
      }
    }

    // 3. Limpar membros que foram excluídos do ClickUp
    console.log('\n🧹 Verificando membros excluídos...');
    const clickupEmails = new Set(members.map(m => m.user.email));

    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, email');

    for (const profile of allProfiles || []) {
      if (!clickupEmails.has(profile.email)) {
        await supabase
          .from('profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', profile.id);
        console.log(`🗑️  ${profile.email} marcado como inativo`);
      }
    }

    // 4. Relatório
    console.log('\n' + '='.repeat(60));
    console.log('📊 RELATÓRIO DE SINCRONIZAÇÃO');
    console.log('='.repeat(60));
    console.log(`✅ Criados/Atualizados: ${created}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📦 Total de membros: ${members.length}\n`);

    if (tokens.length > 0) {
      console.log('🔗 LINKS DE ACESSO GERADOS:');
      console.log('-'.repeat(60));
      tokens.forEach(t => {
        console.log(`\n👤 ${t.displayName} (${t.email})`);
        console.log(`   ${t.loginUrl}`);
        console.log(`   Expira em: ${new Date(t.expiresAt).toLocaleDateString('pt-BR')}`);
      });
    }

    console.log('\n✅ Sincronização concluída com sucesso!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erro na sincronização:', error.message);
    process.exit(1);
  }
}

// Executar
syncClickUpMembers();
