#!/usr/bin/env node

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function extractCookies() {
  let browser = null;
  try {
    console.log('[Extractor] 🚀 Iniciando extração de cookies...\n');

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Tenta fazer login
    console.log('[Extractor] 🔑 Navegando para login...');
    await page.goto('https://app.cakto.com.br/login', { waitUntil: 'networkidle2', timeout: 30000 });

    // Aguarda e preenche o formulário de login
    try {
      console.log('[Extractor] 📝 Preenchendo credenciais...');

      // Tenta encontrar o campo de email com diferentes seletores
      let emailField = await page.$('input[type="email"]') ||
                       await page.$('input[name="email"]') ||
                       await page.$('input[placeholder*="email"]');

      if (emailField) {
        await emailField.type('comercial@gpsx.com.br', { delay: 50 });
        console.log('[Extractor] ✓ Email preenchido');
      }

      // Tenta encontrar o campo de senha
      let passwordField = await page.$('input[type="password"]') ||
                         await page.$('input[name="password"]');

      if (passwordField) {
        await passwordField.type('Sucesso@2025', { delay: 50 });
        console.log('[Extractor] ✓ Senha preenchida');
      }

      // Encontra e clica o botão de submit
      const submitBtn = await page.$('button[type="submit"]') ||
                       await page.$('button');

      if (submitBtn) {
        await submitBtn.click();
        console.log('[Extractor] ✓ Login enviado');

        // Aguarda redirecionamento
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      console.log('[Extractor] ⚠️ Erro ao fazer login:', e.message);
    }

    // Aguarda mais um pouco
    await new Promise(r => setTimeout(r, 2000));

    // Navega para a dashboard
    console.log('[Extractor] 📊 Navegando para dashboard...');
    await page.goto('https://app.cakto.com.br/dashboard/my-sales?tab=paid', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Aguarda dados carregarem
    await new Promise(r => setTimeout(r, 3000));

    // Extrai cookies
    console.log('[Extractor] 🔍 Extraindo cookies...');
    const cookies = await page.cookies();

    if (cookies.length === 0) {
      console.log('[Extractor] ⚠️ Nenhuma cookie encontrada!');
      await browser.close();
      return null;
    }

    console.log(`[Extractor] ✅ ${cookies.length} cookies extraídas\n`);

    // Salva cookies em arquivo
    const outputFile = path.join(__dirname, 'cakto-cookies.json');
    fs.writeFileSync(outputFile, JSON.stringify(cookies, null, 2));
    console.log(`[Extractor] 💾 Salvo em: ${outputFile}\n`);

    // Extrai também os dados da página
    const pageData = await page.evaluate(() => {
      const customers = {};
      const charges = [];

      // Procura por padrões de dados na página
      const rows = document.querySelectorAll('table tbody tr, tr[data-id], [class*="row"]');

      rows.forEach((row, idx) => {
        try {
          const cells = row.querySelectorAll('td, [class*="cell"]');
          const text = Array.from(cells).map(c => c.textContent.trim()).join('|');

          const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          const priceMatch = text.match(/(\d+[.,]\d+)/);

          if (emailMatch && priceMatch) {
            const email = emailMatch[0];
            const amount = parseFloat(priceMatch[1].replace(',', '.'));

            if (!customers[email]) {
              customers[email] = {
                email,
                name: text.split('|')[1] || 'Cliente',
                source: 'cakto_page'
              };
            }

            if (amount > 0) {
              charges.push({
                customer: email,
                amount,
                source: 'cakto_page'
              });
            }
          }
        } catch (e) {
          // ignora
        }
      });

      return {
        pageTitle: document.title,
        customersFound: Object.keys(customers).length,
        chargesFound: charges.length,
        customers: Object.values(customers),
        charges: charges
      };
    });

    console.log('[Extractor] 📈 Dados encontrados na página:');
    console.log(`   - Clientes: ${pageData.customersFound}`);
    console.log(`   - Cobranças: ${pageData.chargesFound}\n`);

    await browser.close();

    return {
      cookies,
      pageData
    };

  } catch (error) {
    console.error('[Extractor] ❌ Erro:', error.message);
    if (browser) await browser.close();
    return null;
  }
}

// Executa
extractCookies().then(result => {
  if (result) {
    console.log('[Extractor] ✅ Extração concluída!\n');
    console.log('📋 Próximo passo - Configure no servidor:\n');

    const cookiesJson = JSON.stringify(result.cookies);
    console.log(`curl -X POST http://localhost:3001/api/setup-cookies \\
  -H "Content-Type: application/json" \\
  -d '${cookiesJson.substring(0, 100)}...'`);

    console.log('\nOu abra: http://localhost:3001/api/setup-cookies\n');
  } else {
    console.log('[Extractor] ❌ Falha na extração\n');
  }
  process.exit(0);
});
