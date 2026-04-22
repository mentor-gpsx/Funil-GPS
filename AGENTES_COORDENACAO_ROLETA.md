# 🤖 Coordenação de Agentes - Sistema de Roleta

**Reunião Executiva: Validação Crítica da Implementação**

Data: 2026-04-09  
Participantes: @architect, @data-engineer, @qa, @dev  
Status: **🔴 NO-GO PARA PRODUÇÃO**

---

## DECISÃO EXECUTIVA

| Item | Decisão | Responsável |
|------|---------|------------|
| **Veredito** | BLOQUEADO - 6 problemas críticos | @qa |
| **Timeline** | 2-3 sprints para correção completa | @dev, @data-engineer |
| **Risco** | ALTO - Perda de dados, race conditions | @architect |
| **Próximo Passo** | Implementar Fase B com fixes críticos | @dev |

---

## 3 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 🔴 CRÍTICO #1: toggleSellerRoleta() não persiste em Supabase

**Problema Identificado por:** @architect  
**Severidade:** CRÍTICO  
**Impacto:** Admin alterna roleta em UI → localStorage muda → Supabase não muda → Nova aba carrega valor antigo

```javascript
// PROBLEMA ATUAL (linha 4572-4573 em funil.html)
CONFIG.SELLER_META[sellerKey].roleta_ativa = !CONFIG.SELLER_META[sellerKey].roleta_ativa;
saveSellerRoletaConfig(); // ONLY localStorage, NEVER Supabase!
```

**Solução por @data-engineer:**
```javascript
// CORRIGIDO
async function toggleSellerRoleta(sellerKey) {
  const newState = !CONFIG.SELLER_META[sellerKey].roleta_ativa;
  
  try {
    // 1. Atualizar Supabase PRIMEIRO
    await _sb.from('roleta_settings')
      .update({ 
        roleta_ativa: newState,
        updated_at: new Date().toISOString(),
        updated_by: _userProfile.id
      })
      .eq('seller_key', sellerKey);
    
    // 2. DEPOIS atualizar localStorage (espelhar Supabase)
    CONFIG.SELLER_META[sellerKey].roleta_ativa = newState;
    saveSellerRoletaConfig();
    
    console.log(`[Roleta] ✓ Toggled roleta_ativa=${newState} for ${sellerKey} (Supabase + localStorage)`);
  } catch(e) {
    console.error(`[Roleta] Erro ao toggle em Supabase:`, e);
    // ROLLBACK: Não altera localStorage se Supabase falhar
  }
}
```

**Validação (TEST 1):**
- [ ] localStorage alterado = Supabase alterado simultaneamente
- [ ] Se Supabase falhar, localStorage ROLLBACK automático
- [ ] Timestamp de sincronização < 100ms

---

### 🔴 CRÍTICO #2: removeSpinGrant() tem race condition (sem lock)

**Problema Identificado por:** @architect  
**Severidade:** CRÍTICO  
**Impacto:** 2 admins clicam "-B" simultaneamente → ambos removem o MESMO grant → 2 spins sumem, 1 fica pending

```javascript
// PROBLEMA ATUAL (linha 4170-4177)
const { data: grants } = await _sb
  .from('roleta_grants')
  .select('id')
  .eq('seller_key', seller)
  .eq('wheel', wheel)
  .eq('spin_status', 'pending')
  .order('created_at', { ascending: true })
  .limit(1);

// SEM LOCK: Dois admins podem pegar o MESMO grant ID simultâneos!
if (grants?.length > 0) {
  await _sb.from('roleta_grants').update({ spin_status: 'revoked' }).eq('id', grants[0].id);
}
```

**Solução por @data-engineer:**

#### Opção A: PostgreSQL Advisory Lock (Recomendado)
```javascript
// Supabase RPC com lock pessimista
async function removeSpinGrant(seller, wheel) {
  if (_userProfile?.role !== 'admin') return;
  
  try {
    const result = await _sb.rpc('revoke_grant_safe_with_lock', {
      p_seller_key: seller,
      p_wheel: wheel,
      p_revoked_by: _userProfile.id
    });
    
    if (result.data.success) {
      pendingSpins[seller][wheel]--;
      saveSpins();
      updateRoletaNotif();
      renderQueueGrid();
    } else {
      console.warn(`[Roleta] Grant already revoked or unavailable`);
    }
  } catch(e) {
    console.error(`[Roleta] Erro ao revogar:`, e);
  }
}
```

#### SQL Function com Lock
```sql
CREATE OR REPLACE FUNCTION revoke_grant_safe_with_lock(
  p_seller_key TEXT,
  p_wheel TEXT,
  p_revoked_by UUID
)
RETURNS TABLE(success BOOLEAN, grant_id UUID) AS $$
DECLARE
  v_grant_id UUID;
BEGIN
  -- Obter lock pessimista na primeira grant pendente
  SELECT id INTO v_grant_id
  FROM roleta_grants
  WHERE seller_key = p_seller_key
    AND wheel = p_wheel
    AND spin_status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE; -- LOCK PESSIMISTA: Bloqueia outras transações
  
  IF v_grant_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;
  
  -- Atualizar com lock mantido
  UPDATE roleta_grants
  SET spin_status = 'revoked'
  WHERE id = v_grant_id;
  
  -- Log de auditoria
  INSERT INTO roleta_revocation_log (grant_id, revoked_by)
  VALUES (v_grant_id, p_revoked_by);
  
  RETURN QUERY SELECT TRUE, v_grant_id;
END;
$$ LANGUAGE plpgsql;
```

**Validação (TEST 2):**
- [ ] 10+ removeSpinGrant simultâneos → exatamente 10 spins revogados (sem falhas)
- [ ] Nenhuma "double-spend" ou grant duplicado
- [ ] Latência < 500ms mesmo com lock

---

### 🔴 CRÍTICO #3: pendingSpins vs roleta_grants dessincronizados

**Problema Identificado por:** @architect  
**Severidade:** CRÍTICO  
**Impacto:** localStorage incrementa → async Supabase falha silenciosamente → próxima aba carrega do BD e perde giros

```javascript
// PROBLEMA ATUAL
pendingSpins[entry.seller][wheel]++; // ← Imediato (local)
saveSpins(); // localStorage agora tem count=5

// Depois, async em background:
await _sb.from('roleta_grants').insert({ ... }); // ← Se falhar, localStorage avançou
```

**Solução por @data-engineer:**

#### Abordagem 1: Supabase First (Recomendado)
```javascript
async function detectNewClosings() {
  const ids = new Set(closingsData.map(c => c.id));
  if (prevClosingIds === null) { prevClosingIds = ids; return; }

  let changedGrants = []; // Track successful inserts

  for (const id of ids) {
    if (prevClosingIds.has(id)) continue;
    const entry = closingsData.find(c => c.id === id);
    if (!entry || !entry.seller) continue;

    // Verificar roleta_ativa
    try {
      const { data: settings } = await _sb
        .from('roleta_settings')
        .select('roleta_ativa')
        .eq('seller_key', entry.seller)
        .single();

      if (!settings?.roleta_ativa) continue;
    } catch(e) { continue; }

    const wheel = (entry.valor >= 9900) ? 'alta' : 'baixa';

    // ✅ PASSO 1: Inserir em Supabase PRIMEIRO
    try {
      const { data: inserted } = await _sb.from('roleta_grants').insert({
        seller_key: entry.seller,
        wheel,
        source: 'auto-closing',
        origin_id: entry.id,
      }).select('id');
      
      changedGrants.push(inserted[0].id);
    } catch(e) {
      // Se falhar, NÃO incrementa localStorage
      console.error(`[Roleta] Falha ao inserir em Supabase:`, e);
      continue;
    }

    // ✅ PASSO 2: DEPOIS incrementar localStorage (espelhar Supabase)
    if (!pendingSpins[entry.seller]) pendingSpins[entry.seller] = { alta: 0, baixa: 0 };
    pendingSpins[entry.seller][wheel]++;
  }

  prevClosingIds = ids;
  if (changedGrants.length > 0) {
    saveSpins();
    updateRoletaNotif();
    console.log(`[Roleta] Sincronizado: ${changedGrants.length} giros (Supabase → localStorage)`);
  }
}
```

#### Abordagem 2: Real-time Subscriptions (Longo prazo)
```javascript
// Supabase real-time sync (elimina polling)
_sb.from('roleta_grants')
  .on('*', payload => {
    if (payload.eventType === 'INSERT') {
      const { seller_key, wheel } = payload.new;
      if (!pendingSpins[seller_key]) pendingSpins[seller_key] = { alta: 0, baixa: 0 };
      pendingSpins[seller_key][wheel]++;
      updateRoletaNotif();
    } else if (payload.eventType === 'UPDATE' && payload.new.spin_status === 'revoked') {
      const { seller_key, wheel } = payload.new;
      pendingSpins[seller_key][wheel] = Math.max(0, pendingSpins[seller_key][wheel] - 1);
      updateRoletaNotif();
    }
  })
  .subscribe();
```

**Validação (TEST 3):**
- [ ] Insert em Supabase ANTES de incrementar localStorage
- [ ] Se Supabase falha, localStorage não muda
- [ ] Sincronização bidirecional < 5 segundos
- [ ] Próxima aba carrega valor correto do BD

---

## SCHEMA FIXES (por @data-engineer)

### Migration 002: Constraints & Denormalization

```sql
-- FILE: migrations/002_fix_roleta_constraints_and_denormalization.sql

-- 1. Adicionar constraint de integridade
ALTER TABLE roleta_grants
ADD CONSTRAINT check_manual_grant_requires_granted_by 
  CHECK (source != 'manual-grant' OR granted_by IS NOT NULL);

-- 2. Remover redundância: seller_key em roleta_spins
ALTER TABLE roleta_spins DROP COLUMN seller_key;

-- 3. Índices estratégicos
CREATE INDEX idx_roleta_grants_seller_status 
  ON roleta_grants(seller_key, spin_status);
CREATE INDEX idx_roleta_grants_pending_origin 
  ON roleta_grants(origin_id, spin_status) 
  WHERE spin_status = 'pending';

-- 4. Criar tabela de auditoria de revogações
CREATE TABLE IF NOT EXISTS roleta_revocation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES roleta_grants(id),
  revoked_by UUID REFERENCES auth.users,
  revoked_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_revocation_log_grant_id ON roleta_revocation_log(grant_id);
```

---

## PLANO DE IMPLEMENTAÇÃO - FASE B (Fixes Críticos)

| Fase | Tarefa | Responsável | Blocker | Timeline |
|------|--------|------------|---------|----------|
| **B1** | Implementar toggleSellerRoleta com Supabase | @dev | ✅ SIM | 2-4h |
| **B2** | Implementar removeSpinGrant com Advisory Lock | @dev | ✅ SIM | 3-6h |
| **B3** | Refatorar detectNewClosings (Supabase First) | @dev | ✅ SIM | 2-3h |
| **B4** | Aplicar migration 002 no Supabase | @data-engineer | ✅ SIM | 0.5h |
| **B5** | Implementar SQL functions (revoke_grant_safe) | @data-engineer | ✅ SIM | 1-2h |
| **B6** | Testes automatizados (TEST 1-6) | @qa | ✅ SIM | 4-6h |
| **B7** | Performance testing (TEST 7) | @qa | ❌ NÃO | 2h |
| **B8** | Documentação e rollback plan | @dev | ❌ NÃO | 1h |

**Total: 2-3 sprints (80-100 horas de trabalho)**

---

## TESTE RÁPIDO (Smoke Test)

Após implementar cada fix, execute:

```bash
# TEST 1: localStorage → Supabase sync
npm test -- test/roleta/localStorage-supabase-sync.test.js

# TEST 2: Race condition
npm test -- test/roleta/race-condition-lock.test.js

# TEST 3: State consistency
bash test/roleta/state-consistency.sh

# TEST 4: Schema constraints
npm test -- test/roleta/schema-constraints.test.js

# TEST 5: ACID guarantees
npm test -- test/roleta/transaction-acid.test.ts

# TEST 6: Cache sync
npm test -- test/roleta/distributed-cache-sync.test.js

# TEST 7: Performance (opcional)
bash test/roleta/performance-load-test.sh
```

**Go-Live apenas quando TODOS os testes passarem com status PASS.**

---

## RECOMENDAÇÕES ARQUITETURAIS (por @architect)

### Curto Prazo (Fase B)
- ✅ Implementar Supabase First (INSERT antes de localStorage)
- ✅ Adicionar Advisory Lock em revogações
- ✅ Persistir roleta_ativa em Supabase (não localStorage)

### Médio Prazo (Fase C - Sprint 4-5)
- Real-time subscriptions (Supabase) para eliminar polling
- WebSocket para notificações instantâneas
- Refatorar pendingSpinsMeta (persistir em BD)

### Longo Prazo (Fase D - Sprint 6+)
- Event sourcing para auditoria completa
- CQRS pattern para read/write separation
- Escalabilidade multi-região

---

## DECISÕES DOCUMENTADAS

| Decisão | Justificativa | Aproved By |
|---------|---------------|-----------|
| Advisory Lock em Supabase | Prevents race conditions sem overhead | @architect, @data-engineer |
| Supabase First pattern | Sincronização atômica e auditável | @architect, @dev |
| localStorage cache only | Performance, nunca source of truth | @architect, @qa |
| Real-time para Fase C | Elimina polling, melhora UX | @architect |
| Remover pendingSpinsMeta | Reduz redundância e estado volátil | @architect, @data-engineer |

---

## PRÓXIMOS PASSOS

1. **HOJE:** @dev começa implementação de B1-B3
2. **AMANHÃ:** @data-engineer aplica migration 002
3. **DIA 3:** @qa executa testes completos
4. **DIA 4-5:** Ajustes e validação de produção
5. **DIA 6:** Deploy em staging
6. **DIA 7+:** Monitoramento e Fase C

---

**Coordenação de Agentes: CONCLUÍDA**  
**Próxima Reunião:** Após implementação de B1-B3  
**Prioridade:** CRÍTICA - Bloqueia go-live
