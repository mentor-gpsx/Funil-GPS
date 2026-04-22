require('dotenv').config();
console.log('ENV loaded. CLICKUP_API_KEY:', process.env.CLICKUP_API_KEY?.substring(0, 30));

const clickup = require('./api/clickup');

async function test() {
  try {
    console.log('\nCalling loadFunilByUser()...');
    const result = await clickup.loadFunilByUser();
    console.log('✅ SUCCESS! Got data');
    console.log('Users:', Object.keys(result).length);
    Object.entries(result).slice(0, 2).forEach(([user, data]) => {
      const total = Object.values(data.etapas).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`  ${user}: ${total} leads`);
    });
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

test();
