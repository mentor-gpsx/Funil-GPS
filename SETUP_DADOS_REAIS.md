# 📊 Guia: Conectar Dados Reais da Cakto

## Status Atual
- ✅ Dashboard 100% funcional
- ✅ APIs criadas e testadas
- ✅ Sistema pronto para dados reais
- ⚠️ API Cakto bloqueada por Cloudflare WAF

## 3 Opções para Dados Reais

### Opção 1: Usar `data.json` (MAIS RÁPIDO) ⭐
**Passo 1:** Acesse a Cakto em `https://app.cakto.com.br/dashboard/my-sales?tab=paid`

**Passo 2:** Copie os dados (clientes, cobranças, vendas) e cole em `api/data.json`

**Estrutura do arquivo:**
```json
{
  "customers": [
    {
      "id": "cliente_001",
      "name": "Nome do Cliente",
      "email": "email@example.com",
      "phone": "11999999999",
      "created_at": "2026-04-24"
    }
  ],
  "charges": [
    {
      "id": "charge_001",
      "customer_id": "cliente_001",
      "customer_name": "Nome do Cliente",
      "amount": 299.90,
      "status": "paid",
      "due_date": "2026-04-15",
      "paid_date": "2026-04-16",
      "description": "Assinatura Plano Pro",
      "payment_method": "pix",
      "reference": "REF-001"
    }
  ],
  "subscriptions": [
    {
      "id": "sub_001",
      "customer_id": "cliente_001",
      "amount": 299.90,
      "status": "active",
      "next_charge_date": "2026-05-15",
      "plan": "Pro"
    }
  ]
}
```

**Passo 3:** Salve e refresque o dashboard
```bash
# O servidor recarrega dados a cada 30 segundos
# Ou clique em "Atualizar" no dashboard
```

### Opção 2: Conectar ao Supabase
Se você usa Supabase para armazenar dados:

1. Criar tabelas:
   ```sql
   CREATE TABLE customers (
     id UUID PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT UNIQUE,
     phone TEXT,
     created_at TIMESTAMP
   );

   CREATE TABLE charges (
     id UUID PRIMARY KEY,
     customer_id UUID REFERENCES customers(id),
     amount NUMERIC,
     status TEXT,
     due_date DATE,
     paid_date DATE,
     description TEXT
   );
   ```

2. Descomentar em `api/cakto.js`:
   ```javascript
   // const supabaseData = await fetchCustomersFromSupabase();
   // if (supabaseData?.length > 0) return supabaseData;
   ```

### Opção 3: Configurar API Cakto (AVANÇADO)
Se você sabe os endpoints corretos da API Cakto:

1. Atualizar em `api/cakto.js`:
   ```javascript
   const response = await caktoRequest('/seu-endpoint-correto');
   ```

2. Teste:
   ```bash
   curl -H "Authorization: Bearer {API_KEY}:{SECRET}" \
     "https://api.cakto.com.br/seu-endpoint?api_key={API_KEY}"
   ```

## Usando o Dashboard

**URL:** `http://localhost:3001/dashboard-interactive.html`

**Funcionalidades:**
- ✅ 5 abas: Visão Geral, Clientes, Cobranças, Transações, Análise
- ✅ Clique em qualquer número para ver detalhes em modal
- ✅ Filtros por status (Todos, Ativos, Pendentes, Falhados)
- ✅ Busca em tempo real
- ✅ Auto-refresh a cada 30 segundos
- ✅ Design preto e branco (cores GPS.X)

## Checklist de Verificação

- [ ] Dados em `api/data.json` com estrutura correta
- [ ] Servidor rodando: `node server.js`
- [ ] Dashboard abrindo: `http://localhost:3001/`
- [ ] Nomes dos clientes aparecem (não "Cliente Desconhecido")
- [ ] Valores estão corretos
- [ ] Status das cobranças aparecem (Pago, Pendente, Falho)
- [ ] Modal abre ao clicar em números

## Testes Rápidos

```bash
# 1. Ver logs do servidor
tail -f .aiox/logs/server.log

# 2. Testar API direto
curl http://localhost:3001/api/dashboard-finance | jq

# 3. Verificar se data.json foi carregado
# (procure por "✓ Clientes carregados de data.json" nos logs)
```

## Próximos Passos

1. **Imediato:** Preencha `api/data.json` com dados reais da Cakto
2. **Depois:** Implemente integração com Supabase se precisar persistência
3. **Avançado:** Configure webhooks da Cakto para atualizar dados automaticamente

---

**Precisa de ajuda?** Verifique os logs do servidor para mensagens de debug.
