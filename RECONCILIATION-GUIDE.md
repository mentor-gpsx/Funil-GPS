# 💰 Guia de Reconciliação de Compensação - GPS.X

## Visão Geral

O sistema de **Reconciliação de Compensação** mapeia o fluxo de pagamentos aprovados pelos clientes (Minhas Vendas) até os saques realizados no Financeiro, identificando gaps e discrepâncias no pipeline de compensação.

### Arquitetura de Dois Fluxos

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE PAGAMENTOS CAKTO                     │
└─────────────────────────────────────────────────────────────────┘

1. MINHAS VENDAS (Entrada)
   ├─ Pagamento aprovado por cliente
   ├─ Status: PAGO
   ├─ Data: momento da aprovação
   └─ Valor: líquido após descontos

                          ⬇️ PIPELINE ⬇️
   
2. PROCESSAMENTO (Intermédio)
   ├─ Validação
   ├─ Batching
   └─ Preparação para saque

                          ⬇️ SAQUES ⬇️
   
3. FINANCEIRO > EXTRATO (Saída)
   ├─ Saque realizado
   ├─ Status: APROVADO
   ├─ Data: data do saque
   └─ Valor: agregado de vários pagamentos
```

## Exemplo Real: Leonardo Lemos

**Situação identificada:**
- Data: 31/03/2026
- Valor: R$ 7.349,75 (liquido, após descontos)
- Status em Minhas Vendas: ✅ PAGO
- Status em Financeiro Saques: ❌ NÃO APARECE

**Hipóteses:**
1. **Saldo Pendente (R$ 392,45)** - Valor está processando, ainda não foi sacado
2. **Pipeline Travado** - Aprovação não progrediu para saque
3. **Discrepância Fiscal** - Valor diverge por cálculo de descontos

**Como Investigar:**
1. Abra o Financeiro da Cakto
2. Vá para "Saldo Pendente"
3. Procure por pagamentos de Leonardo Lemos com data próxima a 31/03
4. Se não encontrar, investigar motivo da não compensação

## 🌐 Dashboards Disponíveis

### 1. **Reconciliação de Compensação**
**URL:** `http://localhost:3001/reconciliation-dashboard.html` ou `/reconciliacao.html`

**Funcionalidades:**
- 📊 Pipeline visual de 3 estágios
- 💰 Saúde da reconciliação (score 0-100)
- 🚨 Identificação de pagamentos não compensados
- 📋 Tabela detalhada com status de cada pagamento
- 💳 Histórico de saques realizados
- 🔍 Filtro por cliente/email/valor

**Como Usar:**
1. Acesse o dashboard
2. Observe a "Saúde da Reconciliação" (score no topo)
3. Se < 95: há pagamentos pendentes
4. Veja a seção "Pagamentos Não Compensados" em vermelho
5. Use filtro para investigar um cliente específico

### 2. **Auditoria Financeira Automatizada**
**URL:** `http://localhost:3001/audit-dashboard.html` ou `/auditoria.html`

**Funcionalidades:**
- 🔍 Auditoria com múltiplos agentes especializados
- ⚠️ Inconsistências críticas
- ⚡ Avisos e alertas
- 📊 Resumo por cliente
- 🏥 Health score do sistema

**Agentes Utilizados:**
1. **Coletor de Pagamentos** - Coleta todos os pagamentos
2. **Validador de Saldo** - Agrupa por status
3. **Conciliador Financeiro** - Reconcilia por cliente
4. **Auditor de Inconsistências** - Detecta delays e discrepâncias
5. **Gerador de Relatório** - Calcula saúde geral

### 3. **Dashboard GPSX Completo**
**URL:** `http://localhost:3001/dashboard-gpsx.html`

**Funcionalidades:**
- 4 abas (Overview, Customers, Charges, Payment Methods)
- Visualização completa de todos os dados
- Busca e filtros avançados
- Modais com detalhes de transações

## 📡 APIs Disponíveis

### GET `/api/charges`
**Descrição:** Retorna todos os pagamentos aprovados (Minhas Vendas)

**Resposta:**
```json
[
  {
    "id": "charge_id",
    "customer_id": "cust_123",
    "customer_name": "Leonardo Lemos",
    "email": "leonardo@example.com",
    "amount": 7349.75,
    "status": "paid",
    "payment_method": "pix",
    "paid_date": "2026-03-31T00:00:00Z",
    "created_at": "2026-03-31T12:34:56Z",
    "source": "import_manual"
  }
]
```

### GET `/api/saques`
**Descrição:** Retorna todos os saques realizados (Financeiro)

**Resposta (vazia se nenhum saque registrado):**
```json
[]
```

**Formato esperado quando houver saques:**
```json
[
  {
    "id": "saque_123",
    "date": "2026-04-10T00:00:00Z",
    "amount": 22500.50,
    "status": "APROVADO",
    "notes": "Saque automático"
  }
]
```

### GET `/api/audit/run`
**Descrição:** Executa auditoria financeira completa

**Resposta:**
```json
{
  "success": true,
  "audit": {
    "audit_id": "AUDIT-1681234567890",
    "timestamp": "2026-05-05T12:34:56.789Z",
    "status": "PASSED|FAILED",
    "health_score": 85,
    "summary": {
      "total_transactions": 76,
      "total_amount_transacted": 95512.71,
      "total_amount_received": 22110.57,
      "total_amount_pending": 392.45,
      "reconciliation_ratio": "23.15%"
    },
    "inconsistencies": {
      "critical_count": 1,
      "items": [
        {
          "type": "DISCREPANCIA_SALDO",
          "severity": "CRITICAL",
          "expected_total": 95512.71,
          "actual_total": 22110.57,
          "discrepancy_amount": 73402.14,
          "discrepancy_percentage": "76.85%",
          "message": "..."
        }
      ]
    },
    "warnings": {
      "count": 5,
      "items": [
        {
          "type": "ATRASO_COMPENSACAO",
          "customer_name": "Leonardo Lemos",
          "amount": 7349.75,
          "days_delayed": 35,
          "message": "Pagamento realizado há 35 dias mas sem reflexo no saldo"
        }
      ]
    }
  }
}
```

## 🔍 Interpretando os Resultados

### Saúde da Reconciliação (Score)

| Score | Status | Significado |
|-------|--------|------------|
| 95-100 | ✅ Saudável | Todos os pagamentos foram compensados |
| 80-94 | ⚠️ Atenção | Alguns pagamentos em processamento |
| < 80 | 🚨 Crítico | Muitos pagamentos não compensados |

### Exemplos de Discrepâncias

#### 1. Atraso na Compensação (ATRASO_COMPENSACAO)
**Quando ocorre:** Pagamento marcado como "PAGO" mas leva > 3 dias para compensar

**Cenário:**
- Leonardo Lemos: Pagamento aprovado em 31/03
- Hoje: 05/05 (35 dias depois)
- Status: Ainda não apareceu em Financeiro

**Ação:** 
- Se < 7 dias: alerta amarelo (processando normalmente)
- Se > 7 dias: alerta vermelho (investigar)

#### 2. Pagamento Atrasado (PAGAMENTO_ATRASADO)
**Quando ocorre:** Cliente com pagamento pendente > 30 dias

**Ação:** Cobrar cliente

#### 3. Discrepância de Saldo (DISCREPANCIA_SALDO)
**Quando ocorre:** Total de saques não bate com total de pagamentos aprovados

**Cenário atual:**
- Total aprovado: R$ 95.512,71
- Total sacado: R$ 22.110,57
- Diferença: R$ 73.402,14 (76,85% não compensado)

**Causa provável:** Pipeline de compensação está atrasado em massa

## 🛠️ Troubleshooting

### Problema: Dashboard mostra R$ 0 em Minhas Vendas
**Solução:** Dados ainda não foram importados
```bash
curl -X POST http://localhost:3001/api/import/data \
  -H "Content-Type: application/json" \
  -d '{"source": "cakto", "data": [...]}'
```

### Problema: Saques mostra array vazio
**Solução:** Tabela `saques` não existe no banco
- Você precisa criar essa tabela a partir dos dados do Financeiro da Cakto
- OU importar os saques via API

### Problema: Score é 100 mas há pagamentos pendentes
**Solução:** Ajustar lógica de cálculo
- Verificar se há saques que não foram registrados no sistema
- Sincronizar com Financeiro da Cakto

## 📊 Checklist de Reconciliação Mensal

- [ ] Executar `/api/audit/run`
- [ ] Verificar Health Score (deve ser > 90%)
- [ ] Revisar seção "Pagamentos Não Compensados"
- [ ] Investigar atrasos > 7 dias
- [ ] Validar total sacado vs total aprovado
- [ ] Conferir com extratos da Cakto
- [ ] Documentar discrepâncias encontradas
- [ ] Propor ações corretivas

## 📞 Contato

Para dúvidas sobre reconciliação:
- Email: mentor@gpsx.com.br
- Dashboard: http://localhost:3001/reconciliation-dashboard.html

---

**Versão:** 1.0  
**Data:** 05/05/2026  
**Status:** ✅ Em Produção
