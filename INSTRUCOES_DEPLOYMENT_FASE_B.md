# 🚀 INSTRUÇÕES DE DEPLOYMENT - FASE B

## PRÉ-REQUISITOS

Você precisa executar as migrations do Supabase ANTES de testar o código.

---

## PASSO 1: Aplicar Migration 002 em Supabase

### Opção A: Via Supabase SQL Editor (Recomendado)

1. Abra: https://app.supabase.com/project/gmpdcgjsbbyqkuftohce/sql/new
2. Copie TODO o conteúdo de:
   ```
   C:\Users\venda\Documents\funil-gps\migrations\002_add_revoke_grant_safe_function.sql
   ```
3. Cole no SQL Editor do Supabase
4. Clique **"Run"**

**Esperado:** ✅ Sem erros

### Opção B: Via CLI Supabase (Se configurado)

```bash
cd "C:\Users\venda\Documents\funil-gps"
supabase db push  # Executa migrations/002_*.sql
```

---

## PASSO 2: Validar Que a Função SQL Foi Criada

No Supabase SQL Editor, execute:

```sql
-- Verificar que a função foi criada
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'revoke_grant_safe_with_lock';
-- Esperado: 1 linha com routine_type='FUNCTION'

-- Verificar que a tabela de auditoria existe
SELECT * FROM roleta_revocation_log LIMIT 1;
-- Esperado: Tabela vazia ou com dados

-- Verificar que a constraint foi adicionada
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name='roleta_grants' AND constraint_type='CHECK';
-- Esperado: check_manual_grant_requires_granted_by
```

---

## PASSO 3: Recarregar funil.html no Browser

1. Abra funil.html no browser
2. Abra o console (F12 → Console tab)
3. Limpe localStorage se necessário:
   ```javascript
   localStorage.clear()
   location.reload()
   ```

---

## PASSO 4: TESTES CRÍTICOS

### TEST 1: toggleSellerRoleta com Supabase Sync

**Teste no Console:**

```javascript
// Comando 1: Verificar estado atual
console.log("pendingSpins:", pendingSpins);
console.log("CONFIG.SELLER_META:", CONFIG.SELLER_META);

// Comando 2: Desativar roleta para maria
await toggleSellerRoleta('maria');
// Esperado no console: "[Roleta] ✓ Toggled roleta_ativa=false for maria"

// Comando 3: Verificar localStorage
console.log("localStorage roleta_ativa para maria:", CONFIG.SELLER_META.maria.roleta_ativa);
// Esperado: false

// Comando 4: Verificar Supabase (abra outra aba)
// No Supabase SQL Editor, execute:
// SELECT * FROM roleta_settings WHERE seller_key='maria';
// Esperado: roleta_ativa=false
```

**Resultado Esperado:**
```
✓ localStorage alterado = true
✓ Supabase alterado = true
✓ Ambos sincronizados em < 100ms
```

---

### TEST 2: removeSpinGrant com Advisory Lock

**Pré-requisito:** Maria deve ter pelo menos 1 giro pendente

**Teste no Console:**

```javascript
// Comando 1: Criar 2 giros para maria (manualmente)
await grantSpin();  // Na UI: Selecionar maria + baixa + clicar "Conceder Giro"
await grantSpin();  // Repetir

// Comando 2: Verificar que tem 2 giros
console.log("Maria baixa giros:", pendingSpins.maria.baixa);
// Esperado: 2

// Comando 3: Tentar remover 2 giros SIMULTANEAMENTE (simular race condition)
Promise.all([
  removeSpinGrant('maria', 'baixa'),
  removeSpinGrant('maria', 'baixa')
]);

// Aguarde 2 segundos, depois verifique:
console.log("Maria baixa giros após removal:", pendingSpins.maria.baixa);
// Esperado: 0 (ambos removidos, sem erro)

// Comando 4: Verificar que EXATAMENTE 2 registros foram marcados 'revoked' em Supabase
// No Supabase SQL Editor:
// SELECT COUNT(*) FROM roleta_grants 
// WHERE seller_key='maria' AND wheel='baixa' AND spin_status='revoked';
// Esperado: 2
```

**Resultado Esperado:**
```
✓ 2 simultâneas removals = 2 sucessos
✓ Nenhuma "double-spend" (count=0, não 1 ou 2 duplicadas)
✓ Supabase mostra exatamente 2 revoked
```

---

### TEST 3: detectNewClosings Supabase First

**Teste no Console:**

```javascript
// Comando 1: Criar nova closing manualmente (na aba Closings)
// Nome: "Teste Sync"
// Seller: gabriel
// Valor: R$ 10.000 (vai gerar "alta")
// Salvar

// Comando 2: Aguarde ~5 segundos (detectNewClosings executa a cada 30s)
// OU force manualmente (se houver função): 
// await detectNewClosings();

// Comando 3: Verifique localStorage
console.log("Gabriel alta giros:", pendingSpins.gabriel.alta);
// Esperado: 1 (se sucesso) ou 0 (se erro)

// Comando 4: Verifique Supabase
// No Supabase SQL Editor:
// SELECT * FROM roleta_grants 
// WHERE seller_key='gabriel' AND source='auto-closing' 
// ORDER BY created_at DESC LIMIT 1;
// Esperado: 1 registro com spin_status='pending'

// Comando 5: Se localStorage=1 E Supabase=1, TEST PASSOU
if (pendingSpins.gabriel.alta > 0) {
  console.log("✓ TEST 3 PASSOU: Sincronização bem-sucedida");
} else {
  console.log("✗ TEST 3 FALHOU: localStorage não foi incrementado");
}
```

**Resultado Esperado:**
```
✓ localStorage incrementado = Supabase inserido
✓ Ambos em sincronização completa
✓ Source='auto-closing' em Supabase
```

---

## PASSO 5: Monitoramento Pós-Deploy

### Verificar Logs da Roleta

Abra console (F12) e procure por:

```
[Roleta] ✓ Toggled roleta_ativa=...       ← FIX #1 funcionando
[Roleta] ✓ Giro ... revogado de ...       ← FIX #2 funcionando
[Roleta] Sincronizado: X giros ...         ← FIX #3 funcionando
```

Se ver erros, anote:
```
[Roleta] Erro ao toggle em Supabase: {...}
[Roleta] Erro crítico ao inserir em Supabase: {...}
[Roleta] Erro ao revogar: {...}
```

---

## PASSO 6: Se Tudo Passou ✅

Vá para **FASE C: Real-time Subscriptions** (elimina polling):

- [ ] Implementar Supabase real-time `on('*', ...)` em detectNewClosings
- [ ] Sincronização instantânea entre abas sem polling
- [ ] Refatorar pendingSpinsMeta (persistir em BD ou remover)

---

## ROLLBACK (Se Algo Quebrar)

Se os testes falharem, reverta a migration 002:

```sql
-- No Supabase SQL Editor, execute:
-- Arquivo: migrations/rollback/rollback_002.sql

-- Remover função
DROP FUNCTION IF EXISTS revoke_grant_safe_with_lock(TEXT, TEXT, UUID);

-- Remover tabela de auditoria
DROP TABLE IF EXISTS roleta_revocation_log;

-- Remover constraints
ALTER TABLE roleta_grants
DROP CONSTRAINT IF EXISTS check_manual_grant_requires_granted_by;

-- Remover índices
DROP INDEX IF EXISTS idx_roleta_grants_seller_status;
DROP INDEX IF EXISTS idx_roleta_grants_pending_origin;
DROP INDEX IF EXISTS idx_revocation_log_grant_id;
```

Depois, recarregue funil.html e teste novamente.

---

## PRÓXIMOS PASSOS

Após validar que TEST 1-3 passaram:

1. **Mergear funil.html atualizado** para seu projeto
2. **Executar migration 002 em produção** (Supabase dashboard)
3. **Monitorar logs** por 24h para garantir estabilidade
4. **Iniciar FASE C** (Real-time subscriptions) se tudo OK

---

**Status:** ✅ Código implementado, pronto para validação em Supabase
