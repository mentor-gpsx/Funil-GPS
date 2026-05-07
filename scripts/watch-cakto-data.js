#!/usr/bin/env node

/**
 * Watcher automático - sincroniza dados da Cakto a cada 5 minutos
 * Uso: npm run sync-data:watch
 */

const { spawn } = require('child_process');
const path = require('path');

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutos
const SCRIPT = path.join(__dirname, 'fetch-cakto-data.js');

console.log('🔄 CAKTO Data Watcher iniciado');
console.log(`⏰ Sincronizando a cada 5 minutos`);
console.log('   (Ctrl+C para parar)\n');

function runSync() {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${timestamp}] ▶️  Sincronizando dados...`);

  const child = spawn('node', [SCRIPT], {
    stdio: 'inherit',
    cwd: __dirname,
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✓ Sincronização concluída\n`);
    } else {
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ Erro na sincronização\n`);
    }
  });
}

// Executar imediatamente na primeira vez
runSync();

// Depois, executar a cada SYNC_INTERVAL
setInterval(runSync, SYNC_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Watcher parado');
  process.exit(0);
});
