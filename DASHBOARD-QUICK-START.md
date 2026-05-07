# 🚀 Dashboard Quick Start - GPS.X

## 🌐 Acesso Rápido aos Dashboards

**Servidor:** `http://localhost:3001`

### Dashboards Principais

| Dashboard | URL | Função | Status |
|-----------|-----|--------|--------|
| 💰 **Reconciliação** | `/reconciliation-dashboard.html` | Mapeia pagamentos aprovados vs saques realizados | ✅ Ativo |
| 🔍 **Auditoria** | `/audit-dashboard.html` | Executa auditoria automatizada de inconsistências | ✅ Ativo |
| 📊 **GPSX Completo** | `/dashboard-gpsx.html` | Dashboard GPSX preto/branco com dados interativos | ✅ Ativo |
| 💳 **Financeiro** | `/financial-dashboard.html` | Dashboard de dados financeiros | ✅ Ativo |
| 🔄 **Sincronização** | `/dashboard-sync.html` | Status de sincronização em tempo real | ✅ Ativo |

### Aliases (URLs Alternativas)

```
/reconciliacao.html          → /reconciliation-dashboard.html
/auditoria.html              → /audit-dashboard.html
/dashboard-completo.html     → /dashboard-gpsx.html
```

## 📡 APIs para Integração

### Dados de Pagamentos

```bash
# Listar todos os pagamentos aprovados (Minhas Vendas)
curl http://localhost:3001/api/charges

# Listar todos os saques realizados (Financeiro)
curl http://localhost:3001/api/saques
```

### Auditoria

```bash
# Executar auditoria completa (gera relatório)
curl http://localhost:3001/api/audit/run

# Verificar status da auditoria
curl http://localhost:3001/api/audit/status
```

### Sincronização

```bash
# Status da última sincronização
curl http://localhost:3001/api/sync-status

# Forçar sincronização agora
curl -X POST http://localhost:3001/api/sync-now
```

## 🎯 Workflow Típico

### 1️⃣ Verificar Saúde Geral
```
Acesse: http://localhost:3001/reconciliation-dashboard.html
└─ Score < 95? → Há pagamentos pendentes
```

### 2️⃣ Executar Auditoria Completa
```
Acesse: http://localhost:3001/audit-dashboard.html
Clique: [🚀 Executar Auditoria Completa]
└─ Analisa: pagamentos pendentes, atrasos, discrepâncias
```

### 3️⃣ Investigar Discrepâncias
```
Auditoria mostra alertas críticos?
└─ Identifique cliente
└─ Filtre na Reconciliação
└─ Confirme com Financeiro da Cakto
```

### 4️⃣ Validar com Cakto
```
Compare:
- Dashboard Reconciliação (nosso sistema)
  └─ Minhas Vendas: R$ 95.512,71 (76 pagamentos)
  └─ Saques: R$ 0 (ou número de saques)
  
- Cakto Financeiro
  └─ Saldo Disponível: R$ 22.110,57
  └─ Saldo Pendente: R$ 392,45
```

## 📊 Exemplo: Caso Leonardo Lemos

### 1. Descobrir o Problema
```
Dashboard Reconciliação:
├─ Filtre: "Leonardo" ou "leonardo@..."
├─ Vê: R$ 7.349,75 - Status "NÃO SACADO"
└─ Data: Há 35 dias (31/03/2026)
```

### 2. Investigar na Auditoria
```
Auditoria Financeira:
├─ Clique em [🚀 Executar Auditoria Completa]
├─ Vê na seção "⚡ Avisos": ATRASO_COMPENSACAO
├─ Leonardo Lemos: R$ 7.349,75 (atraso de 35 dias)
└─ Severidade: CRÍTICA (>7 dias)
```

### 3. Confirmar na Cakto
```
Cakto > Financeiro:
├─ Saldo Pendente: Procure por Leonardo
├─ Se encontrar: está processando (esperar)
├─ Se não encontrar: investigar onde foi o dinheiro
└─ Contactar suporte Cakto se necessário
```

## 🔧 Configuração Necessária

### Se a Tabela `saques` Não Existe
O sistema ainda não está capturando os dados de saques. Para ativar:

**Opção 1: Importar via API**
```bash
curl -X POST http://localhost:3001/api/import/data \
  -H "Content-Type: application/json" \
  -d '{
    "type": "saques",
    "data": [
      {
        "date": "2026-04-10",
        "amount": 22110.57,
        "status": "APROVADO"
      }
    ]
  }'
```

**Opção 2: Conectar com Webhook Cakto**
```bash
Endpoint: http://seu-servidor:3001/api/webhook/cakto
Método: POST
Eventos: transaction.completed, payment.received, etc
```

## 📈 Métricas Importantes

### Health Score (Saúde da Reconciliação)

```
Score = 100 - (dias_atraso × 5) - (pagamentos_pendentes × 10)

Interpretação:
├─ 95-100: ✅ Operacional - Pagamentos fluem normalmente
├─ 80-94:  ⚠️ Atenção - Alguns pagamentos em processamento
├─ 60-79:  🚨 Aviso - Muitos pagamentos atrasados
└─ < 60:   🆘 Crítico - Pipeline travado
```

### Reconciliation Ratio

```
Razão = (Total Sacado / Total Aprovado) × 100%

Esperado:
├─ 100%: Perfeito - Tudo foi sacado
├─ 90-99%: Normal - Alguns em processamento
├─ 70-89%: Aviso - Muitos pagamentos pendentes
└─ < 70%: Crítico - Pipeline muito atrasado
```

## 🆘 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Dashboard em branco | Aguarde 3s para carregar dados da API |
| Tabela vazia | Dados ainda não importados, use `/api/import/data` |
| Score sempre 100 | Sem saques registrados, configure webhook Cakto |
| Filtro não funciona | Aguarde dados carregarem completamente |
| Erro de conexão | Verifique se servidor está rodando: `curl localhost:3001` |

## 📞 Suporte

- **Email:** mentor@gpsx.com.br
- **Logs do servidor:** `/tmp/server.log`
- **Banco de dados:** `.data/cakto.db` (SQLite)

---

**🚀 Pronto para usar!**

1. Acesse: http://localhost:3001/reconciliation-dashboard.html
2. Abra o navegador
3. Comece a monitorar seus pagamentos em tempo real
