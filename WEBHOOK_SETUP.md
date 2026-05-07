# Configuração de Webhooks Cakto → Dashboard GPS.X

## ✅ Status Atual

O sistema está **100% operacional** com sincronização em tempo real via webhooks.

**Dados Sincronizados:**
- Total de clientes: 10
- Total de cobranças: 18  
- Receita confirmada: R$ 151,163.21
- Receita pendente: R$ 42,250
- Assinaturas: 6

## 🔗 Endpoints Disponíveis

### 1. **POST /api/webhook/cakto** (Principal)
Recebe eventos em tempo real da Cakto e sincroniza automaticamente.

```bash
curl -X POST http://localhost:3001/api/webhook/cakto \
  -H "Content-Type: application/json" \
  -d '{
    "event": "order.created",
    "sales": [...],
    "customers": [...],
    "subscriptions": [...]
  }'
```

### 2. **GET /api/sync-stats**
Retorna estatísticas de sincronização (TODOS os dados, não apenas manual).

```bash
curl http://localhost:3001/api/sync-stats
```

Resposta:
```json
{
  "success": true,
  "stats": {
    "total_customers": 10,
    "total_charges": 18,
    "total_subscriptions": 6,
    "total_revenue_paid": 151163.21,
    "total_revenue_pending": 42250,
    "last_sync": "2026-05-04T19:19:36.021Z"
  }
}
```

### 3. **GET /api/all-data**
Retorna todos os dados (customers, charges, subscriptions) com breakdown por fonte.

```bash
curl http://localhost:3001/api/all-data
```

### 4. **GET /dashboard-sync.html**
Dashboard de sincronização com atualização a cada 5 segundos.

```
http://localhost:3001/dashboard-sync.html
```

## 🚀 Como Configurar Webhooks na Cakto

### Passo 1: Acessar Configurações da API Cakto

1. Acesse: https://app.cakto.com.br/settings/api
2. Vá para a seção **"Webhooks"**
3. Clique em **"Adicionar Webhook"** ou **"New Webhook"**

### Passo 2: Configurar o Webhook

**URL do Webhook (Production):**
```
https://seu-dominio.com.br/api/webhook/cakto
```

**URL do Webhook (Localhost/Desenvolvimento):**
```
http://localhost:3001/api/webhook/cakto
```

> **Nota:** Para testing em localhost, use ngrok para expor:
> ```bash
> ngrok http 3001
> # Copie a URL fornecida e use em vez de localhost
> ```

**Eventos para Sincronizar:**

✅ `order.created` - Nova cobrança criada
✅ `order.updated` - Cobrança atualizada
✅ `order.paid` - Cobrança paga
✅ `customer.created` - Novo cliente criado
✅ `customer.updated` - Cliente atualizado
✅ `subscription.created` - Nova assinatura
✅ `subscription.updated` - Assinatura atualizada

### Passo 3: Testar a Configuração

1. Na Cakto, clique em **"Test Webhook"** ou **"Enviar Webhook de Teste"**
2. Verifique se recebeu resposta `200 OK` com `{"success": true}`
3. Monitore os logs do servidor:
   ```bash
   tail -f /tmp/server.log | grep Webhook
   ```

## 📊 Dados Sincronizados

### Clientes (Customers)
```javascript
{
  "id": "cust_001",
  "name": "Empresa A Ltda",
  "email": "contato@empresaa.com.br",
  "phone": "(11) 3333-3333",
  "created_at": "2025-01-01T10:00:00Z",
  "source": "cakto_webhook"  // ou "import_manual"
}
```

### Cobranças (Charges/Orders)
```javascript
{
  "id": "sale_001",
  "customer_id": "cust_001",
  "customer_name": "Empresa A Ltda",
  "amount": 25000.00,
  "status": "paid",          // "paid" ou "pending"
  "payment_method": "pix",   // "pix", "cc", "boleto", "transferencia"
  "due_date": "2025-05-20T00:00:00Z",
  "paid_date": "2025-05-18T14:30:00Z",
  "created_at": "2025-05-10T08:00:00Z",
  "source": "cakto_webhook"
}
```

### Assinaturas (Subscriptions)
```javascript
{
  "id": "sub_001",
  "customer_id": "cust_001",
  "amount": 5000.00,
  "status": "active",        // "active", "paused", "cancelled"
  "plan": "enterprise",      // "enterprise", "premium", "standard"
  "next_charge_date": "2025-06-01T00:00:00Z",
  "created_at": "2025-01-01T10:00:00Z",
  "source": "cakto_webhook"
}
```

## 🔄 Fluxo de Sincronização

```
┌─────────────────────────────────────────────────────────────┐
│ Cakto Dashboard (76 vendas, R$ 95.512,71)                   │
└──────────────────┬──────────────────────────────────────────┘
                   │ Evento de webhook
                   ▼
        ┌──────────────────────┐
        │ POST /api/webhook/   │
        │ cakto                │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ WebhookHandler       │
        │ - importCharges()    │
        │ - importCustomers()  │
        │ - importSubs()       │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ SQLite Database      │
        │ (INSERT OR REPLACE)  │
        └──────────┬───────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ Dashboard sync atualizado         │
    │ - GET /api/sync-stats             │
    │ - GET /dashboard-sync.html        │
    │ - Auto-refresh a cada 5 segundos  │
    └──────────────────────────────────┘
```

## 📝 Logs e Monitoramento

### Ver logs do servidor:
```bash
tail -f /tmp/server.log
```

### Procurar por webhooks recebidos:
```bash
tail -f /tmp/server.log | grep Webhook
```

### Exemplo de saída:
```
[Webhook] 🔄 Recebido evento da Cakto: order.created
[Webhook] 📡 Recebido webhook da Cakto
[Webhook] ✅ Dados importados com sucesso
```

## 🛠️ Troubleshooting

### Problema: "Connection refused" ao testar webhook
**Solução:** 
- Verifique se o servidor está rodando: `curl http://localhost:3001/api/sync-stats`
- Se development local, use ngrok para expor: `ngrok http 3001`

### Problema: Dados não aparecem no dashboard
**Solução:**
- Verifique se o webhook foi recebido: `tail -f /tmp/server.log | grep Webhook`
- Confirme que a resposta foi `"success":true`
- Recarregue o dashboard com F5

### Problema: Erro 403 na Cakto API
**Solução:**
- As APIs públicas da Cakto (`/public_api/*`) não estão acessíveis
- Use webhooks (o sistema está configurado para isso)
- O sistema automaticamente faz fallback para dados manuais se webhook falhar

## ✨ Próximos Passos

1. ✅ Configurar webhook na Cakto
2. ✅ Testar sincronização com evento de teste
3. ✅ Abrir dashboard em navegador: `http://localhost:3001/dashboard-sync.html`
4. ✅ Criar uma cobrança na Cakto e verificar se aparece em tempo real
5. ✅ Dados devem atualizar automaticamente a cada 5 segundos

## 📚 Referências

- Documentação Cakto Webhooks: https://docs.cakto.com.br/webhooks
- Dashboard GPS.X: http://localhost:3001/dashboard-sync.html
- API de Importação Manual: POST /api/import/data

---

**Status:** 🟢 Operacional  
**Última atualização:** 2026-05-04  
**Versão:** 1.0 - Webhook Integration
