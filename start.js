#!/usr/bin/env node

/**
 * Script de startup - Inicia servidor + sincronização automática
 * Uso: npm start
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = 3001;
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function startServer() {
  log('\n╔════════════════════════════════════════╗', 'cyan');
  log('║   🌐 GPS.X DASHBOARD - STARTUP        ║', 'cyan');
  log('╚════════════════════════════════════════╝', 'cyan');

  log('\n📡 Iniciando servidor...', 'yellow');
  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname,
  });

  server.on('error', (err) => {
    log(`\n❌ Erro ao iniciar servidor: ${err.message}`, 'red');
  });

  // Aguardar servidor iniciar (500ms)
  await new Promise(r => setTimeout(r, 500));

  log('\n🔄 Iniciando sincronização automática...', 'yellow');
  const watcher = spawn('node', ['scripts/watch-cakto-data.js'], {
    stdio: 'inherit',
    cwd: __dirname,
  });

  watcher.on('error', (err) => {
    log(`\n⚠️  Erro no watcher: ${err.message}`, 'yellow');
  });

  log('\n✅ Sistema iniciado com sucesso!', 'green');
  log(`\n📊 Dashboard: ${colors.bright}http://localhost:${PORT}/dashboard-interactive.html${colors.reset}`, 'green');
  log(`\n   Servidor: http://localhost:${PORT}`, 'cyan');
  log(`   API: http://localhost:${PORT}/api/dashboard-finance`, 'cyan');
  log(`\n⏰ Sincronização automática: a cada 5 minutos`, 'cyan');
  log(`\n⌨️  Pressione Ctrl+C para parar\n`, 'yellow');

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('\n\n👋 Encerrando...\n', 'yellow');
    server.kill();
    watcher.kill();
    setTimeout(() => process.exit(0), 500);
  });
}

startServer().catch(err => {
  log(`\n❌ Erro: ${err.message}\n`, 'red');
  process.exit(1);
});
