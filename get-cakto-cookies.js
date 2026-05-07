#!/usr/bin/env node

/**
 * Helper: Extrai cookies da Cakto para usar na sincronização automática
 *
 * Uso:
 * 1. Abra o DevTools do seu navegador (F12)
 * 2. Cole este código no console (até a linha de "copy")
 * 3. As cookies serão copiadas para a área de transferência
 * 4. Cole aqui no terminal quando solicitado
 */

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
╔════════════════════════════════════════════════════════════╗
║   🔐 Extrator de Cookies da Cakto                          ║
╚════════════════════════════════════════════════════════════╝

INSTRUÇÕES:
1. Abra seu navegador em https://app.cakto.com.br/
2. Faça login com suas credenciais
3. Acesse: https://app.cakto.com.br/dashboard/my-sales?tab=paid
4. Abra DevTools (F12)
5. Na aba "Console", cole isto:

─────────────────────────────────────────────────────────────
copy(JSON.stringify(document.cookie.split('; ').map(c => {
  const [name, value] = c.split('=');
  return { name, value, domain: 'app.cakto.com.br', path: '/' };
})))
─────────────────────────────────────────────────────────────

6. Cole o resultado abaixo:
`);

rl.question('🔑 Cole as cookies aqui: ', (input) => {
  try {
    const cookies = JSON.parse(input);
    console.log('\n✅ Cookies extraídas com sucesso!\n');
    console.log('Salve este valor em seu .env:\n');
    console.log(`CAKTO_COOKIES='${JSON.stringify(cookies)}'`);
    console.log('\nOu execute:\n');
    console.log(`curl -X POST http://localhost:3001/api/set-cookies \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ cookies })}'`);
  } catch (e) {
    console.log('\n❌ Erro ao processar cookies. Verifique o formato JSON.');
  }
  rl.close();
});
