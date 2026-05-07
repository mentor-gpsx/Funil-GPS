# Sistema Financeiro GPS.X — PRD Executivo

**Status:** Approved for Design Phase  
**Versão:** 1.0  
**Data:** 2026-04-23  
**Criado por:** Design Team (CFO + Engenheiro + Analista)

---

## VISÃO GERAL

Construir um sistema financeiro estruturado que:
- **Centraliza** dados de receita (ClickUp CRM + Cakto)
- **Modela** ciclo de vida do cliente e recorrência
- **Gera** DRE profissional com visibilidade de fluxo
- **Prevê** receita futura e risco (inadimplência, churn)
- **Decide** com confiança (dados validados)

**Princípio:** CLI-First → Dashboard observa, não comanda

---

## ENTIDADES CORE

### 1. **Cliente** (Source: ClickUp CRM OFICIAL)

```
{
  id: string (ClickUp task ID)
  nome: string
  email: string
  responsavel: string (vendedor)
  status: enum ["ativo", "inadimplente", "cancelado"]
  data_criacao: date
  
  // Metadados
  origem: "manual" | "clickup_import"
  ultima_atualizacao: datetime
}
```

**Decisão:** Cliente é unique por (email). Duplicatas resolvidas por merge (manual via admin).

---

### 2. **Recorrência** (Source: Cakto)

```
{
  id: string (Cakto subscription ID)
  cliente_id: string (referência)
  plano: string ["starter", "pro", "enterprise"]
  valor: number (BRL)
  moeda: "BRL"
  frequencia: enum ["mensal", "anual"]
  status: enum ["ativa", "pausada", "cancelada"]
  
  // Datas críticas
  data_inicio: date
  proxima_cobranca: date
  data_cancelamento: date | null
  
  // Recorrência futura
  cobrancas_previstas: [{
    data: date
    valor: number
    certeza: percentage
  }]
}
```

**Decisão:** Fonte de verdade = Cakto. ClickUp apenas confirma presença do cliente.

---

### 3. **Pagamento** (Source: Cakto)

```
{
  id: string (Cakto charge ID)
  recorrencia_id: string
  cliente_id: string
  valor: number
  status: enum ["pago", "pendente", "falhou", "reembolso"]
  data_vencimento: date
  data_pagamento: date | null
  dias_atraso: number (calcula se pendente)
  
  // Rastreabilidade
  metodo: "cartao" | "boleto" | "pix"
  tentativas: number
}
```

---

### 4. **DRE Mensal** (Calculated)

```
{
  periodo: "2026-04" (YYYY-MM)
  
  // Receita Realizada
  receita_bruta: number
  taxas_cakto: number (3-5%)
  receita_liquida: number
  
  // Análise de Status
  pagamentos_em_dia: number
  pagamentos_pendentes: number
  pagamentos_atrasados: number
  
  // Previsão (baseada em recorrências ativas)
  proxima_receita_prevista: number (próximos 30 dias)
  
  // Saúde
  tac: percentage (Taxa de Atraso ao Cliente)
  churn: percentage
  mrr: number (Monthly Recurring Revenue)
}
```

---

## INTEGRAÇÕES

### ClickUp (CRM OFICIAL)

**O que puxar:**
- Pasta: "CRM OFICIAL" (id: 901309503357)
- Campos extratos:
  - Nome (task title)
  - Email (custom field)
  - Responsável (assignee)
  - Status (stage/list status)

**Frequência:** Diária (01:00 AM)  
**Função:** Sincronização de clientes, validação de existência

**Tratamento de erro:**
- Se falhar: log + retry (max 3x)
- Se ClickUp offline: usar cache local (dados de 24h atrás)

---

### Cakto (Pagamentos)

**O que puxar:**
- `/subscriptions` → Recorrências ativas + próximas datas
- `/charges` → Histórico de pagamentos (status, valores)
- `/customers` → Validação de email + telefone

**Frequência:** A cada 6h (ou real-time webhook se disponível)  
**Função:** Fonte de verdade para receita e ciclos de cobrança

**Tratamento de erro:**
- Se falhar: HTTP 500 + retry exponencial
- Cache: 6h (usar dados locais se API indisponível)

---

## LÓGICA DE DADOS (CRÍTICO)

### Deduplicação

**Problema:** Cliente pode estar em ClickUp + Cakto com dados diferentes.

**Solução — Chave Única:**
```
MATCH = email (normalizado, lowercase, trim)

Se cliente_clickup.email == cliente_cakto.email:
  → Merge (prioridade: Cakto para dados financeiros)
```

**Regra:** 1 email = 1 cliente. Exceção: manual admin com aprovação.

---

### Status do Cliente

**Matriz de Decisão:**
```
IF recorrencia.status == "cancelada" AND data_cancelamento < 30 dias atrás:
  cliente.status = "cancelado" (churn recente)

IF existem charges "pendentes" E data_vencimento < hoje:
  cliente.status = "inadimplente" (crítico)

IF existem charges "pendentes" E data_vencimento == hoje:
  cliente.status = "ativo" (vigilância)

ELSE:
  cliente.status = "ativo" (normal)
```

---

### Previsão de Receita (Forecast)

**Lógica:**
```
forecast_30d = SUM(
  recorrencias.status == "ativa" 
  AND proxima_cobranca BETWEEN [hoje, hoje+30d]
)

forecast_90d = SUM(
  recorrencias.status == "ativa" 
  AND proxima_cobranca BETWEEN [hoje, hoje+90d]
)

risk_score = (
  pagamentos_pendentes / receita_total * 100 +
  churn_recente * 0.5
)
```

---

## ARQUITETURA TÉCNICA (Resumida)

### Stack

```
Frontend:     HTML5 + Vanilla JS (sem frameworks)
Backend:      Node.js (Express opcional)
Database:     Supabase (PostgreSQL) — já contratado
Cache:        Redis (opcional, iniciar sem)
Integrações:  REST APIs (ClickUp + Cakto)
```

### Fluxo de Dados

```
[ClickUp API] ──┐
               ├──> [Agregador] ──> [PostgreSQL] ──> [Dashboard]
[Cakto API] ───┤                        ↑
               │                     [Cache 6h]
               └──> [Validação + Deduplicação]

Atualização:
- ClickUp: Diária (01:00 AM)
- Cakto: A cada 6h ou webhook
- DRE: Calculada on-demand (< 1s)
```

---

## ESCOPO POR ETAPA

| Etapa | O Quê | Responsável | Status |
|-------|-------|------------|--------|
| **0** | PRD + Modelagem (este doc) | Design | ✅ Done |
| **1** | Backend: Agregador (ClickUp + Cakto) | @dev | → Story 1 |
| **2** | Backend: DRE + Lógica | @dev | → Story 2 |
| **3** | Backend: Forecast + Risk | @dev | → Story 3 |
| **4** | Frontend: Dashboard base | @dev + @ux | → Story 4 |
| **5** | Frontend: Filtros + Exportação | @dev | → Story 5 |
| **6** | Testes + Validações | @qa | → Story 6 |
| **7** | Deploy + Operacional | @devops | → Story 7 |

---

## CRITÉRIOS DE SUCESSO

### Dados
- ✅ Clientes em ClickUp = Clientes em Cakto (98% match)
- ✅ Receita total (DRE) = SUM(Cakto) ± 0.5%
- ✅ Zero duplicatas (audita via query)

### Performance
- ✅ Agregação completa < 30s
- ✅ Dashboard carrega < 2s
- ✅ DRE calcula on-demand < 500ms

### Confiabilidade
- ✅ Erros de API não quedam o sistema
- ✅ Dados sempre retornam (cache se necessário)
- ✅ Logs completos para auditoria

---

## DECISÕES ARQUITETURAIS

| Decisão | Por quê | Trade-off |
|---------|---------|-----------|
| **Email como chave única** | Confiável, imutável | Requer normalização rigorosa |
| **Cakto como fonte de verdade (receita)** | Sistema de pagamento = autoridade | Perder dados se Cakto falhar (mitigado com cache) |
| **DRE calculada, não armazenada** | Sempre atualizada, zero desincronização | Mais lento (aceito, calculado on-demand) |
| **CLI-First (agregador antes do dashboard)** | Lógica testável, reutilizável | Não vê dado sem CLI rodando |
| **Sem banco de dados normalizado (v1)** | Rápido de começar | Difícil escalar (v2: implementa real schema) |

---

## RISCOS & MITIGAÇÃO

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **Dados divergem (ClickUp ≠ Cakto)** | Alto | Validação diária + alertas |
| **Cakto API offline** | Médio | Cache local + fallback (dados antigos) |
| **Duplicatas de cliente** | Alto | Merge manual + constraints BD (v2) |
| **Recorrência não converge em receita** | Médio | Auditoria mensal manual |
| **Churn oculto (cliente cancela sem avisar)** | Médio | Alert se 0 cobranças em 60d |

---

## PRÓXIMAS AÇÕES

### Imediato (semana 1)
1. **Aprovação:** Validar modelagem com stakeholders
2. **Story 0:** Desdobrar PRD em stories dimensionadas (5-7 stories)
3. **Setup:** Credenciais + acesso ClickUp + Cakto

### Semana 2-3
4. **Story 1:** Backend agregador (fetch + parse)
5. **Story 2:** DRE + lógica de status
6. **Story 3:** Forecast + validações

### Semana 4+
7. **Story 4-5:** Frontend dashboard
8. **Story 6-7:** QA + Deploy

---

## DOCUMENTAÇÃO ADICIONAL NECESSÁRIA

- [ ] Mapeamento de campos ClickUp ↔ BD schema
- [ ] Query de validação (receita Cakto = DRE)
- [ ] Alertas operacionais (thresholds)
- [ ] Manual de operação (sincronizações, erros)
- [ ] SLA da API (uptime esperado)

---

**Aprovado por:** [Nome CFO / CEO]  
**Próximo review:** 2026-05-07 (pós-Story 0)

