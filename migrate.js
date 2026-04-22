const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const sql = fs.readFileSync('./db/migrations/004-tab-permissions.sql', 'utf8')
  .split(';')
  .filter(s => s.trim().length > 0);

(async () => {
  try {
    for (const statement of sql) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      
      const { data, error } = await supabase.rpc('exec', { sql: trimmed + ';' });
      if (error) {
        console.log(`⚠️  ${trimmed.substring(0, 50)}...`);
        console.log(`   Erro: ${error.message}`);
      } else {
        console.log(`✅ ${trimmed.substring(0, 50)}...`);
      }
    }
    console.log('\n✅ Migração concluída!');
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
})();
