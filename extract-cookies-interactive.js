#!/usr/bin/env node

/**
 * Extrator de Cookies Interativo
 * Abre navegador real, você faz login manualmente, nós extraímos as cookies
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🔐 Extrator Interativo de Cookies da Cakto               ║
╚════════════════════════════════════════════════════════════╝

Vou abrir o navegador para você fazer login. Siga os passos:
1. Faça login com: comercial@gpsx.com.br / Sucesso@2025
2. Após login, navegue até: /dashboard/my-sales?tab=paid
3. Pressione ENTER no terminal quando os dados aparecerem
4. Vou extrair as cookies automaticamente

  `);

  rl.question('Pressione ENTER para começar...', async () => {
    rl.close();

    let browser = null;
    try {
      console.log('\n🌐 Abrindo navegador...\n');

      // Abre em modo visual (não headless)
      browser = await puppeteer.launch({
        headless: false,
        args: [
          '--start-maximized',
          '--no-default-browser-check',
          '--no-sandbox'
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navega para a dashboard
      console.log('📍 Navegando para https://app.cakto.com.br/dashboard/my-sales?tab=paid\n');
      await page.goto('https://app.cakto.com.br/dashboard/my-sales?tab=paid', {
        waitUntil: 'networkidle2'
      }).catch(() => {
        // Se falhar na primeira tentativa, tenta novamente
      });

      console.log('✅ Navegador aberto!');
      console.log('📝 Faça o login se necessário');
      console.log('⏳ Aguardando você pressionar ENTER quando estiver pronto...\n');

      // Aguarda o usuário pressionar ENTER
      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      await new Promise(resolve => {
        rl2.question('Pressione ENTER quando a página estiver carregada com dados: ', () => {
          rl2.close();
          resolve();
        });
      });

      console.log('\n🔍 Extraindo cookies...');

      // Extrai as cookies
      const cookies = await page.cookies();

      if (cookies.length === 0) {
        console.log('⚠️  Nenhuma cookie encontrada. Verifique se fez login.');
        await browser.close();
        return;
      }

      console.log(`✅ ${cookies.length} cookies extraídas!\n`);

      // Salva em arquivo
      const outputFile = path.join(__dirname, 'cakto-cookies.json');
      fs.writeFileSync(outputFile, JSON.stringify(cookies, null, 2));

      console.log(`💾 Salvo em: ${outputFile}\n`);
      console.log('📋 Conteúdo das cookies:\n');
      console.log(JSON.stringify(cookies, null, 2));

      console.log(`\n🔧 Próximo passo - Configure no servidor:\n`);
      console.log(`curl -X POST http://localhost:3001/api/setup-cookies \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ cookies })}'`);

      console.log('\n✅ Ou configure via: http://localhost:3001/api/setup-cookies\n');

      // Aguarda mais um pouco para você confirmar
      await new Promise(resolve => {
        rl2 = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl2.question('Pressione ENTER para fechar o navegador: ', () => {
          rl2.close();
          resolve();
        });
      });

      await browser.close();
      console.log('✅ Concluído!');

    } catch (error) {
      console.error('❌ Erro:', error.message);
      if (browser) await browser.close();
    }
  });
}

main();
