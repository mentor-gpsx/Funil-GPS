require('dotenv').config();

console.log('CLICKUP_API_KEY loaded:', !!process.env.CLICKUP_API_KEY);
console.log('CLICKUP_API_KEY value (first 20 chars):', process.env.CLICKUP_API_KEY?.substring(0, 20));
console.log('CLICKUP_LIST_ID:', process.env.CLICKUP_LIST_ID);

const clickup = require('./api/clickup');
console.log('\nLoading from clickup.js module:');
console.log('Module exports ETAPAS:', clickup.ETAPAS.length, 'stages');
