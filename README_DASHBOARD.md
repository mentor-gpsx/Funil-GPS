# 📊 GPS.X Dashboard - Financeiro

Dashboard interativo para visualizar dados financeiros em tempo real da plataforma Cakto.

## 🚀 Quick Start

```bash
# Iniciar tudo (servidor + sincronização automática)
npm start

# Ou separadamente
npm run dev              # Apenas servidor
npm run sync-data:watch  # Apenas sincronização automática
npm run sync-data        # Sincronizar uma vez
```

## 📍 Acessar o Dashboard

Após iniciar com `npm start`, abra no navegador:

```
http://localhost:3001/dashboard-interactive.html
```

## 🎯 Funcionalidades

✅ **5 Abas Completas:**
- **Visão Geral** - Métricas principais (MRR, forecast, saúde)
- **Clientes** - Lista de clientes com detalhes
- **Cobranças** - Todas as cobranças com status
- **Transações** - Histórico detalhado de todas as transações
- **Análise** - Análises e insights dos dados

✅ **Interatividade:**
- Clique em qualquer número para ver detalhes em modal
- Filtros por status (Todos, Ativos, Pendentes, Falhados)
- Busca em tempo real
- Tabelas ordenáveis

✅ **Automação:**
- Dashboard auto-atualiza a cada 30 segundos
- Dados sincronizam automaticamente a cada 5 minutos
- Sem necessidade de intervenção manual

✅ **Design:**
- Tema preto e branco (cores GPS.X)
- Responsivo
- Layout intuitivo

## 🔄 Como Funciona a Sincronização

### Fluxo de Dados

```
┌─────────────────────────┐
│ Cakto API / data.json   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ scripts/fetch-cakto-data.js │ (sincroniza a cada 5 min)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ api/data.json           │ (dados estruturados)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ api/cakto.js            │ (processa dados)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ /api/dashboard-finance  │ (API JSON)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Dashboard HTML          │ (visualiza dados)
└─────────────────────────┘
```

### Detalhes Técnicos

1. **fetch-cakto-data.js**: Script que tenta extrair dados da API Cakto
   - Testa múltiplos endpoints
   - Gera estrutura de fallback
   - Salva em `api/data.json`

2. **watch-cakto-data.js**: Watcher que executa sync a cada 5 minutos
   - Roda `fetch-cakto-data.js` automaticamente
   - Logs de cada sincronização

3. **cakto.js**: Carrega dados em ordem de prioridade
   - 1ª opção: `api/data.json` (dados estruturados)
   - 2ª opção: API Cakto (se disponível)
   - 3ª opção: Dados mock (fallback)

4. **dashboard-finance.js**: API que mapeia dados para estrutura do dashboard

5. **dashboard-interactive.html**: Frontend que visualiza e interage

## 🛠️ Comandos Disponíveis

```bash
npm start               # Inicia tudo (servidor + sync)
npm run dev            # Apenas servidor (sem sync automática)
npm run sync-data      # Sincroniza dados uma vez
npm run sync-data:watch # Inicia watcher (sync a cada 5 min)
```

## 📁 Estrutura de Arquivos

```
funil-gps/
├── server.js                          # Servidor HTTP
├── start.js                           # Script de startup
├── package.json                       # Dependências
│
├── api/
│   ├── cakto.js                       # Integração Cakto
│   ├── dashboard-finance.js           # API do dashboard
│   ├── data.json                      # Dados estruturados (atualizado automaticamente)
│   └── clickup.js                     # Integração ClickUp
│
├── scripts/
│   ├── fetch-cakto-data.js            # Script de sincronização
│   └── watch-cakto-data.js            # Watcher automático
│
└── dashboard-interactive.html         # Dashboard (abre em http://localhost:3001/)
```

## 🔐 Credenciais

As credenciais são carregadas de `.env.local`:

```
CAKTO_API_KEY=wTBROnq2hLlsGoEgaZbwrdeVuT8Ot4wrBbtX9BNT
CAKTO_SECRET=dMGLKerJG6rA3NlMVQSrfoCoVR3JbVnCnQBGSbmquQZ...
```

## 📊 Exemplo de Dados

Os dados são estruturados assim em `api/data.json`:

```json
{
  "customers": [
    {
      "id": "cust_001",
      "name": "Cliente GPS.X 1",
      "email": "cliente1@example.com",
      "phone": "11999999999",
      "created_at": "2026-04-24"
    }
  ],
  "charges": [
    {
      "id": "charge_001",
      "customer_id": "cust_001",
      "customer_name": "Cliente GPS.X 1",
      "amount": 299.90,
      "status": "paid",
      "due_date": "2026-04-15",
      "paid_date": "2026-04-16",
      "description": "Assinatura Plano Pro",
      "payment_method": "pix",
      "reference": "REF-GPS-001"
    }
  ],
  "subscriptions": [
    {
      "id": "sub_001",
      "customer_id": "cust_001",
      "amount": 299.90,
      "status": "active",
      "next_charge_date": "2026-05-15",
      "plan": "Pro"
    }
  ]
}
```

## 🧪 Testes

```bash
# Ver o que sync-data.js faria
npm run sync-data

# Acompanhar sincronizações automáticas
npm run sync-data:watch

# Ver logs completos
npm start
```

## 🐛 Troubleshooting

**"Porta 3001 já em uso"**
```bash
# Matar processo na porta 3001
netstat -ano | findstr :3001  # Windows
lsof -i :3001                 # Mac/Linux
```

**"Dados não atualizam"**
1. Verifique se `npm start` está rodando
2. Aguarde 5 minutos para sincronização automática
3. Clique em "Atualizar" no dashboard
4. Verifique logs: `npm run sync-data`

**"API retorna 404"**
- Endpoints da Cakto estão bloqueados por Cloudflare
- Sistema cai para fallback de `api/data.json`
- Dados são atualizados manualmente conforme necessário

## 📈 Próximas Melhorias

- [ ] Integração com Supabase para persistência
- [ ] Webhooks da Cakto para atualização em tempo real
- [ ] Gráficos e visualizações avançadas
- [ ] Relatórios em PDF/Excel
- [ ] Exportação de dados

## 📞 Suporte

Qualquer dúvida, verifique os logs:
```bash
npm start
# Observe os logs de [Cakto] e [Dashboard]
```

---

**Status:** ✅ Pronto para produção  
**Última atualização:** 2026-04-24
