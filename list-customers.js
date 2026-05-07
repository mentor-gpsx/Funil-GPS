#!/usr/bin/env node

/**
 * Listar clientes do banco de dados
 * Uso: node list-customers.js
 */

const { Database } = require('./api/database-schema.js');

async function listCustomers() {
  try {
    const db = new Database();
    await db.init();

    console.log('\n' + '='.repeat(120));
    console.log('📊 CLIENTES NA CAKTO/GPS.X');
    console.log('='.repeat(120) + '\n');

    const customers = await db.all(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.created_at
      FROM customers c
      ORDER BY c.name ASC
    `) || [];

    if (!Array.isArray(customers)) {
      console.log('Erro: banco vazio ou query inválida');
      console.log('Resultado:', customers);
      await db.close();
      process.exit(1);
    }

    if (customers.length === 0) {
      console.log('Nenhum cliente encontrado.\n');
      await db.close();
      process.exit(0);
    }

    customers.forEach((c, idx) => {
      console.log(`${idx + 1}. ${c.name}`);
      console.log(`   Email: ${c.email}`);
      console.log(`   Telefone: ${c.phone}`);
      console.log(`   Cadastro: ${c.created_at}`);
      console.log('');
    });

    console.log('='.repeat(120));
    console.log(`Total: ${customers.length} clientes\n`);

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

listCustomers();
