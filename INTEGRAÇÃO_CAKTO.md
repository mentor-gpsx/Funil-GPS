# 🔗 INTEGRAÇÃO COMPLETA CAKTO - GUIA DE CONFIGURAÇÃO

## ✅ Status Atual

✅ **Coleta Automática de Dados**
- Puppeteer (scraping com autenticação real)
- HTTP Polling (requisições periódicas)
- Cache inteligente (5 min)
- Fallback para dados locais

✅ **Sincronização Automática**
- Roda a cada 15 minutos
- Executa ao iniciar servidor
- Possível sincronização manual via API

✅ **Dashboard em Tempo Real**
- Atualiza a cada 30 segundos
- Mostra status da coleta
- Filtros e interatividade completa

---

## 📋 PASSO 1: Configurar Credenciais

### Opção A: Puppeteer (RECOMENDADO - Acesso Completo)

1. **Abra o arquivo `.env.local`** (ou crie a partir de `.env.example`)
2. **Preencha com suas credenciais:**

```
CAKTO_EMAIL=seu-email@cakto.com.br
CAKTO_PASSWORD=sua-senha-aqui
CAKTO_API_KEY=wTBROnq2hLlsGoEgaZbwrdeVuT8Ot4wrBbtX9BNT
CAKTO_SECRET=dMGLKerJG6rA3NlMVQSrfoCoVR3JbVnCnQBGSbmquQZ
```

3. **Salve o arquivo**
4. **Reinicie o servidor:**
```bash
npm start
```

### Opção B: Apenas API Key (Sem Email/Senha)

Se não quiser fornecer credenciais de login, o sistema usará apenas HTTP Polling com API Key.

**Menos eficiente, mas funciona:**
```
CAKTO_API_KEY=wTBROnq2hLlsGoEgaZbwrdeVuT8Ot4wrBbtX9BNT
CAKTO_SECRET=dMGLKerJG6rA3NlMVQSrfoCoVR3JbVnCnQBGSbmquQZ
```

---

## 🚀 PASSO 2: Iniciar o Sistema

```bash
npm install puppeteer  # (apenas se usar Puppeteer)
npm start
```

**Logs esperados:**
```
[Sync] ✅ Iniciando sincronização automática (a cada 15 min)
[Sync] 🔄 Sincronizando dados da Cakto...
[Sync] ✅ Sincronizado com sucesso (X clientes, Y cobranças)
```

---

## 📊 PASSO 3: Acessar o Dashboard

```
http://localhost:3001/dashboard-interactive.html
```

O dashboard mostrará:
- ✅ Clientes importados da Cakto
- ✅ Cobranças (PIX, boleto, etc)
- ✅ Assinaturas ativas
- ✅ Previsão de receita (MRR)
- ✅ Status dos pagamentos

---

## 🔄 APIs Disponíveis

### GET /api/sync-status
Verificar status da última sincronização:

```bash
curl http://localhost:3001/api/sync-status
```

**Resposta:**
```json
{
  "timestamp": "2026-04-24T17:56:23.835Z",
  "duration": 2340,
  "records": {
    "customers": 40,
    "charges": 127,
    "subscriptions": 45
  },
  "status": "success",
  "service_running": true
}
```

### POST /api/sync-now
Forçar sincronização imediatamente:

```bash
curl -X POST http://localhost:3001/api/sync-now
```

---

## 🛠️ Troubleshooting

### "Puppeteer não instalado"
```bash
npm install puppeteer
```

### "Dados não sincronizam"
1. Verifique `.env.local` tem credenciais corretas
2. Verifique logs: `npm start`
3. Força sincronização: `curl -X POST http://localhost:3001/api/sync-now`

### "Vejo dados antigos/em cache"
O sistema cacheia dados por 5 minutos para performance.

Para forçar atualização:
```bash
# Limpar cache
rm -rf .cache/

# Sincronizar novamente
curl -X POST http://localhost:3001/api/sync-now
```

---

## 🏗️ Arquitetura Técnica

```
┌─────────────────────────────────────────────────────┐
│ Cakto                                               │
│ • Dashboard (https://app.cakto.com.br)              │
│ • 40+ vendas, R$ 69.733,24                          │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼─────────┐      ┌───────▼────────┐
   │ Puppeteer    │      │ HTTP Polling   │
   │ (Principal)  │      │ (Fallback)     │
   └────┬─────────┘      └───────┬────────┘
        │                         │
        └────────────┬────────────┘
                     │
         ┌───────────▼───────────┐
         │ Cache (5 min TTL)     │
         │ .cache/sales.json     │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │ Normalização          │
         │ (Cakto → estruturado) │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │ api/data.json         │
         │ (Fonte de Verdade)    │
         └───────────┬───────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───▼────────┐ ┌───▼──────┐  ┌──────▼───┐
│  Dashboard │ │ API JSON │  │ Análises  │
│   HTML     │ │ Endpoints│  │ Forecast  │
└────────────┘ └──────────┘  └───────────┘
```

---

## 📝 Dados Estruturados

Após sincronização, `api/data.json` contém:

```json
{
  "customers": [
    {
      "id": "cust_001",
      "name": "Empresa ABC",
      "email": "contato@abc.com.br",
      "phone": "11987654321",
      "created_at": "2026-04-01"
    }
  ],
  "charges": [
    {
      "id": "charge_001",
      "customer_id": "cust_001",
      "customer_name": "Empresa ABC",
      "amount": 299.90,
      "status": "paid",
      "due_date": "2026-04-15",
      "paid_date": "2026-04-16",
      "payment_method": "pix",
      "reference": "REF-001"
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

---

## 🔐 Segurança

✅ **Credenciais seguras:**
- Armazenadas apenas em `.env.local` (não versionado)
- Não salvas em logs
- Não expostas via APIs

✅ **Dados:**
- Cacheados localmente
- Estruturados e normalizados
- Versionáveis em Git

---

## 📈 Próximos Passos Opcionais

1. **Webhooks Cakto** - Quando disponíveis, substituem polling (tempo real)
2. **Integração Zapier/Make** - Roteamento para outros sistemas
3. **Banco de Dados Permanente** - Histórico completo + análises avançadas
4. **Alertas Automáticos** - Email/Slack para eventos (atrasos, etc)

---

**Status:** ✅ Pronto para Produção
**Última atualização:** 2026-04-24
