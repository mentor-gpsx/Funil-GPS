module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  res.writeHead(200);
  res.end(JSON.stringify({
    usuarios: [
      {
        nome: 'Maria Eduarda',
        totalLeads: 4,
        etapasComLeads: [{ etapa: 'Prospecção', count: 2 }],
        etapas: { 'Prospecção': [{ id: 't1', nome: 'Test', email: 'test@test.com', valor: 1000 }] }
      }
    ],
    totalUsuarios: 1,
    totalLeads: 4,
    etapas: ['Prospecção', 'Stand By', 'Qualificado', 'Reunião Agendada', 'Apresentação', 'Follow-Up', 'Pago'],
    timestamp: new Date().toISOString()
  }));
};
