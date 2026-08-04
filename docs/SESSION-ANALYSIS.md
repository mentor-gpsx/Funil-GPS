# Funil-GPS: Análise de Escopo, Tempo & Créditos
**Data:** 2026-05-08  
**Contexto Disponível:** ~94K tokens (de 200K)

---

## 📊 Estado Atual do Projeto

### Stories Completadas
| Story | Status | Data | Notas |
|-------|--------|------|-------|
| **2.2** | ✅ DONE | 2026-05-07 | Financial Reports (DRE, Cash Flow, Metrics, Shareable Links, Archive) |
| **1.2** | ⏳ READY FOR REVIEW | Implementado | Chart of Accounts API (CRUD + RLS) |
| **1.3** | ⏳ READY FOR REVIEW | Implementado | Journal Entries API (Draft→Post→Reverse) |
| **1.4** | ⏳ READY FOR REVIEW | Implementado | Authentication (JWT + MFA TOTP + Session Mgmt) |
| **1.5** | ⏳ READY FOR REVIEW | Implementado | Audit Logging (Hash Chain + Immutability) |

### Stories em Revisão (QA Pendente)
| Story | Priority | Status | Bloqueador |
|-------|----------|--------|-----------|
| **1.1** | P0 CRITICAL | Ready for Review | Funil de Vendas (USER REQUEST: NÃO MEXER) |
| **1.2-1.5** | P0 | Ready for Review | @qa gate decision needed |

---

## 🎯 Escopo Total do Epic ERP-FOUNDATION

### Fase 1: MVP Production-Ready (Sprint 1-2)
✅ **5 Stories total:**

1. **Story 1.1** - Database Schema & RLS (8 SP)
   - Status: READY FOR REVIEW
   - Bloqueador: FUNIL DE VENDAS (user request: NÃO MEXER)
   - Ação: Deixar para próxima sessão

2. **Story 1.2** - Chart of Accounts API (5 SP)
   - Status: ✅ IMPLEMENTADO
   - Ação: @qa review (30 min)

3. **Story 1.3** - Journal Entries API (13 SP)
   - Status: ✅ IMPLEMENTADO
   - Ação: @qa review (1 hora)

4. **Story 1.4** - Authentication & MFA (8 SP)
   - Status: ✅ IMPLEMENTADO
   - Ação: @qa review (45 min)

5. **Story 1.5** - Audit Logging (5 SP)
   - Status: ✅ IMPLEMENTADO
   - Ação: @qa review (45 min)

### Fase 2: Features Enterprise (não iniciado)
- DRE automático, Fluxo de caixa, Relatórios
- Conciliação multi-gateway, Plano hierárquico, Centros de custo
- **Estimativa:** 3-4 sprints

---

## ⏱️ Estimativa de Tempo POR ATIVIDADE

### Opção A: QA Review das 4 Stories (1.2-1.5)
| Atividade | Tempo | Tokens |
|-----------|-------|--------|
| @qa review Story 1.2 (Accounts) | 30 min | ~8K |
| @qa review Story 1.3 (Entries) | 60 min | ~12K |
| @qa review Story 1.4 (Auth) | 45 min | ~10K |
| @qa review Story 1.5 (Audit) | 45 min | ~10K |
| **@devops push** (4x commits) | 15 min | ~5K |
| **TOTAL** | **3h 15m** | **~45K tokens** |

**Resultado:** ✅ PASSA em contexto disponível (94K > 45K)  
**Timeline:** Viável hoje, com margem

---

### Opção B: Adicionar Story 1.1 QA (Funil)
**Status:** NÃO RECOMENDADO (user request: não mexer)
- ⚠️ Story 1.1 é da Funil de Vendas
- ⚠️ User explicitamente pediu: "sem mudar NADA no Funil de Vendas"
- ⚠️ Deixar para próxima sessão

---

## 📌 Caminho Recomendado para Hoje

### Plano A (Seguro, 100% Viável)
```
1. @qa *review 1.2  → Accounts API QA gate
2. @qa *review 1.3  → Entries API QA gate
3. @qa *review 1.4  → Auth API QA gate
4. @qa *review 1.5  → Audit API QA gate
5. @devops *push    → 4 commits to main
6. Documentar completion
```
**Tempo:** 3h 15m  
**Contexto usado:** ~45K  
**Margem:** 49K tokens (seguro)

### Plano B (Se Quiser Mais)
Após completar Plano A, ainda há **49K tokens livres**:
- Pode consultar @po para próxima story (Fase 2)
- Pode iniciar research/planejamento (sem código)
- **NÃO TENTE implementação nova** (seria arriscado)

---

## ⚠️ Restrições & Riscos

### Restrição do Usuário
- ❌ **Story 1.1 (Funil de Vendas) FORA DO ESCOPO HOJE**
- ✅ Tudo mais (stories 1.2-1.5 + 2.2) está aberto

### Riscos de Contexto
| Atividade | Custo | Risco |
|-----------|-------|-------|
| @qa review 4 stories | ~40K | BAIXO ✅ |
| @devops push 4x | ~5K | BAIXO ✅ |
| Implementar nova story | ~50K+ | CRÍTICO ❌ |
| Refatoração/análise pesada | ~30K+ | ALTO ⚠️ |

---

## 🎯 Recomendação Final

### ✅ FAÇA HOJE (Plano A)
- QA review das 4 stories prontas (1.2-1.5)
- Push tudo para main
- **Timeline:** 3h 15m
- **Crédito utilizado:** 45K / 94K
- **Margem de segurança:** 49K tokens

### ⏳ DEIXE PARA PRÓXIMA SESSÃO
- Story 1.1 (Funil) - respeitando restrição do usuário
- Fase 2 (Features Enterprise)
- Qualquer implementação nova

### 💡 BENEFÍCIO
Com Plano A hoje você vai ter:
- ✅ 4 stories produzidas (1.2-1.5) deployadas
- ✅ Total 5 stories completas (+ 2.2 anterior)
- ✅ Margem de 49K tokens para continuação
- ✅ Funil de Vendas totalmente intacto

---

**Decisão:** Quer seguir Plano A (QA + Push)?
