# Fase A: Auto-Geração + Liberação Manual de Giros

## Visão Geral

Implementação da arquitetura centralizada da roleta com suporte simultâneo para **auto-geração** (a partir de closings do ClickUp) e **liberação manual** (por admin).

---

## Componentes Implementados

### 1. **Banco de Dados** (`migrations/001_create_roleta_tables.sql`)

Três tabelas centralizadas:

#### `roleta_settings`
- Configuração por vendedor
- `seller_key` (PK): maria, nicolas, kennyd, gabriel
- `roleta_existe`: Feature disponível para vendedor
- `roleta_ativa`: Feature habilitada por admin
- `updated_at`, `updated_by`: Auditoria

#### `roleta_grants`
- Log de todas as liberações (auto ou manual)
- `id` (PK): UUID única por grant
- `seller_key` (FK): Qual vendedor
- `wheel`: 'alta' ou 'baixa'
- **`source`**: **'auto-closing'** ou **'manual-grant'** (differentiator)
- `origin_id`: ID do closing (null se manual)
- `granted_by`: UUID do admin que liberou manualmente
- `spin_status`: 'pending' | 'used' | 'revoked'

#### `roleta_spins`
- Histórico de giros realizados
- `grant_id` (FK): Qual grant foi usado
- `result`: Prêmio obtido
- `spun_at`, `spun_by`: Quando e quem girou

---

## Fluxos de Funcionamento

### Fluxo 1: Auto-Geração (Closing → Giro Automático)

```
ClickUp: Nova closing criada
         ↓
detectNewClosings() é executado periodicamente
         ↓
1. Verifica se NOVA closing (não vista antes)
2. Verifica seller_key (não 'outros')
3. **Valida roleta_ativa=true em Supabase** ← NOVO
4. Define wheel: alta (>=R$9900) ou baixa (<R$9900)
5. Insere em roleta_grants com:
   - source='auto-closing' ← NOVO
   - origin_id=closing.id ← NOVO
   - granted_by=null
6. Incrementa pendingSpins[seller][wheel] (localStorage)
7. Atualiza UI com updateRoletaNotif()
```

**Código:**
```javascript
// Salvar em Supabase também
try {
  await _sb.from('roleta_grants').insert({
    seller_key: entry.seller,
    wheel,
    source: 'auto-closing',
    origin_id: entry.id,
    granted_by: null, // sistema automático
  });
} catch(e) {
  console.error(`[Roleta] Erro ao inserir em Supabase:`, e);
}
```

---

### Fluxo 2: Liberação Manual (Admin → Giro Manual)

```
Admin clica em "Conceder Giro"
         ↓
grantSpin() é executado
         ↓
1. Valida admin (role='admin')
2. Obtém seller e wheel do form
3. Incrementa pendingSpins[seller][wheel] (localStorage)
4. **Insere em roleta_grants com source='manual-grant'** ← NOVO
5. Atualiza UI com updateRoletaNotif()
```

**Código:**
```javascript
// Inserir em Supabase com source='manual-grant'
try {
  const { data: { session } } = await _sb.auth.getSession();
  await _sb.from('roleta_grants').insert({
    seller_key: seller,
    wheel,
    source: 'manual-grant',
    granted_by: session?.user?.id || null,
  });
  console.log(`[Roleta] ✓ Giro ${wheel} concedido manualmente a ${seller}`);
} catch(e) {
  console.error('[Roleta] Erro ao inserir grant em Supabase:', e);
}
```

---

### Fluxo 3: Revogação (Admin → Remover Giro)

```
Admin clica em "-A" ou "-B"
         ↓
removeSpinGrant(seller, wheel) é executado
         ↓
1. Valida admin
2. Decrementa pendingSpins[seller][wheel] (localStorage)
3. Remove metadata do giro mais antigo
4. **Busca grant mais antigo em Supabase** (pending)
5. **Atualiza spin_status='revoked'** ← NOVO
6. Atualiza UI
```

**Código:**
```javascript
// Atualizar status em Supabase: marcar o grant mais antigo como revoked
try {
  const { data: grants } = await _sb
    .from('roleta_grants')
    .select('id')
    .eq('seller_key', seller)
    .eq('wheel', wheel)
    .eq('spin_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (grants?.length > 0) {
    await _sb
      .from('roleta_grants')
      .update({ spin_status: 'revoked' })
      .eq('id', grants[0].id);
  }
} catch(e) {
  console.error('[Roleta] Erro ao revogar em Supabase:', e);
}
```

---

## Como Testar

### Pré-requisitos
1. **Supabase**: Executar a migração `001_create_roleta_tables.sql`
   ```sql
   -- No Supabase SQL Editor, copie e execute o arquivo inteiro
   ```

2. **Verificar dados iniciais**
   ```sql
   SELECT * FROM roleta_settings; -- Deve ter 4 vendedores
   SELECT * FROM roleta_grants;   -- Vazio no início
   ```

---

### Teste 1: Auto-Geração Funciona

**Cenário:** Admin cria um novo closing no ClickUp com valor >= R$9900

**Passos:**
1. Abra funil.html
2. Na aba "Closings", crie um novo closing
   - Nome: "Teste Auto"
   - Valor: R$10.000
   - Seller: maria
3. Aguarde ~5 segundos (detectNewClosings executa)
4. Verifique a aba "Roletas" → Queue Grid
5. **Esperado:** Maria mostra "1 giro", com "Alta 1"

**Verificar Supabase:**
```sql
SELECT * FROM roleta_grants
WHERE seller_key='maria' AND source='auto-closing'
ORDER BY created_at DESC LIMIT 1;
```

---

### Teste 2: Auto-Geração Respeita roleta_ativa

**Cenário:** Admin desativa roleta para maria, cria novo closing

**Passos:**
1. Na aba "Roletas" → "Controle de Roletas por Vendedor"
2. Clique no ícone toggle para "maria" → desativa (🔴)
3. Crie um novo closing com Seller=maria, Valor=R$11.000
4. Aguarde ~5 segundos
5. **Esperado:** Nenhum giro criado para maria
6. Verifique console: `[Roleta] ⊘ Skipped (roleta_ativa=false): maria`

**Verificar Supabase:**
```sql
SELECT COUNT(*) FROM roleta_grants
WHERE seller_key='maria' AND source='auto-closing'
AND created_at > now() - interval '1 minute';
-- Deve ser 0
```

---

### Teste 3: Liberação Manual Funciona

**Cenário:** Admin concede um giro manualmente

**Passos:**
1. Na aba "Roletas" → "Conceder Giro"
2. Selecione:
   - Vendedor: nicolas
   - Wheel: baixa
3. Clique "Conceder Giro"
4. Verifique Queue Grid → nicolas deve ter "Baixa 1"

**Verificar Supabase:**
```sql
SELECT * FROM roleta_grants
WHERE seller_key='nicolas' AND source='manual-grant'
ORDER BY created_at DESC LIMIT 1;
```

---

### Teste 4: Ambos os Fluxos Funcionam Juntos

**Cenário:** Auto-geração E manual grants para o mesmo vendedor

**Passos:**
1. Crie closing: Seller=gabriel, Valor=R$9.800 (baixa) → Auto-giro
2. Conceda 1 giro manual (baixa) para gabriel
3. Verifique Queue Grid → gabriel deve ter "Baixa 2"

**Verificar Supabase:**
```sql
SELECT wheel, source, COUNT(*) as total
FROM roleta_grants
WHERE seller_key='gabriel'
GROUP BY wheel, source;
-- Esperado:
-- baixa | auto-closing | 1
-- baixa | manual-grant | 1
```

---

### Teste 5: Revogação Marca Como Revoked

**Cenário:** Admin revoga um giro

**Passos:**
1. Com gabriel tendo 2 giros na Queue Grid
2. Clique "-B" (remover giro baixa)
3. Queue Grid → gabriel agora tem "Baixa 1"

**Verificar Supabase:**
```sql
SELECT id, spin_status, source, created_at FROM roleta_grants
WHERE seller_key='gabriel' AND wheel='baixa'
ORDER BY created_at;
-- Esperado:
-- id1 | revoked | auto-closing | 2026-04-09 10:00:00
-- id2 | pending | manual-grant | 2026-04-09 10:05:00
```

---

## Arquitetura de Sincronização

### Fonte de Verdade por Camada

| Dado | Fonte Primária | Sincronia |
|------|----------------|-----------|
| **Giros Pendentes (count)** | localStorage (`pendingSpins`) | Imediato (UI responsiva) |
| **Giros Pendentes (registro)** | Supabase (`roleta_grants`) | Eventual (async) |
| **Configuração (existe/ativa)** | Supabase (`roleta_settings`) | Verificado antes de criar |
| **Histórico** | Supabase (`roleta_spins`) | Registrado após uso |

### Por Que Dois Lugares?

1. **localStorage**: Responsividade instantânea da UI
2. **Supabase**: Fonte de verdade duradoura, auditoria, sincronização multi-aba

### Sincronização

- **→ Supabase**: Toda vez que cria grant (auto ou manual) ou revoga
- **← Supabase**: Carregamento inicial, validações críticas, revogação

---

## Monitoramento

### Logs da Roleta

Abra o console (F12) e procure por `[Roleta]`:

```
[Roleta] +1 giro alta para maria (Closing: Deal Name)
[Roleta] ✓ Giro baixa concedido manualmente a nicolas
[Roleta] ✓ Giro alta revogado de gabriel
[Roleta] ⊘ Skipped (roleta_ativa=false): kennyd
[Roleta] Erro ao inserir em Supabase: {...}
```

---

## Próximos Passos (Fase B)

- [ ] Optimizações:
  - Remover pendingSpinsMeta (usar Supabase diretamente)
  - Consolidar localStorage e Supabase
  - Real-time subscriptions para síncronização multi-aba

- [ ] Validações adicionais:
  - Limite máximo de giros pendentes por vendedor
  - Timeout de giros (expiração após X horas)
  - Histórico detalhado de prêmios

- [ ] WebSockets para notificações em tempo real
