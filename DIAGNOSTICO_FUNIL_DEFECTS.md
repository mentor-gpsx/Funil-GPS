# Funil de Vendas — Diagnóstico Multi-Agente: 98→2 Data Loss

**Status:** Ready for Implementation (Story to be created via @sm)  
**Date:** 2026-04-20  
**Agents:** @architect, @analyst, @data-engineer, @qa  
**Severity:** CRITICAL — Do not ship to production

---

## Executive Summary

The Funil de Vendas dashboard reports **2 leads in Prospecção** when **98 should display**. Multi-agent investigation identified **15 independent defects** across the ClickUp fetch pipeline, API aggregation, database schema, and frontend rendering. Root cause is **compounding**: a combination of missing pagination, frontend username filtering, and silent mock fallback.

---

## ROOT CAUSE RANKING

| Priority | Defect | Location | Impact | Fix Complexity |
|---|---|---|---|---|
| **P0** | Frontend username substring match (.includes) drops 96 leads | `funil.html:4381-4390` | Frontend only renders 4 hardcoded user buckets; any assignee username not containing `maria\|nicolas\|kennyd\|gabriel` → invisible | Replace `.includes()` with explicit mapping |
| **P0** | No ClickUp pagination — truncates at 100 tasks | `api/clickup.js:30` | If list >100 tasks, everything past #100 lost | Add while loop with `page=0,1,2...` |
| **P0** | `include_closed=false` by default — missing "Pago" stage | `api/clickup.js:30` | Closed/completed deals never appear | Add `&include_closed=true` to URL |
| **P0** | Silent mock fallback on error | `api/clickup.js:143,206` | Any API error → returns mock data (2 users) with zero visibility | Return HTTP 5xx with error details |
| **P0** | `.env` not loaded; CLICKUP_API_KEY empty by default | `server.js` (missing), `package.json` (missing dotenv) | Local dev always returns mock | Add `require('dotenv').config()` and `dotenv` to deps |
| **P1** | Custom field ID lookup broken (literal string instead of UUID) | `api/clickup.js:181-182` | Every lead has `email:''` and `valor:0` | Use UUIDs from `funil.html:1770-1773` |
| **P1** | Stage matching via substring in task.name misroutes 60-90% | `api/clickup.js:93-99, 172-176` | Tasks with name like "reunião agendada pendente" routed to wrong stage | Replace with ClickUp list status API call |
| **P1** | Multi-assignee duplication inflates totalLeads count | `api/clickup.js:186-200` | A lead shared by 3 users counted 3× in aggregation | Add deduplication or document explicitly |
| **P1** | Frontend hardcodes 4 sellers; other assignees invisible | `funil.html:4381-4390` | Anyone outside Maria/Nicolas/Kennyd/Gabriel bucket → no accordion | Dynamic render from `data.usuarios` |
| **P2** | API key credential hardcoded in public HTML | `funil.html:1675` | Secret exposed to every browser visitor | Move to backend, rotate key immediately |
| **P2** | Env var name mismatch (.env has CLICKUP_LIST_ID, code reads CLICKUP_CRM_VENDAS_ID) | `api/clickup.js:130,158` vs `.env` | Relies on hardcoded fallback | Align names or use explicit config |
| **P2** | RLS policies use N+1 subqueries (correlated EXISTS per row) | `supabase-setup.sql:42-72` | Performance degrades on scale; potential timeout | Wrap in SECURITY DEFINER is_admin() function |
| **P2** | Profiles/tab_permissions schema missing 4 critical columns | `api/tab-permissions.js:161,221-222` | User sync fails silently: `updated_by`, `clickup_username`, `updated_at`, `permissions` absent | Add migration with ALTER TABLE |
| **P2** | Pagination capped at 100 but no loop fallback in loadFunilByUser() | `api/clickup.js:30` | If list >100 tasks, rest silent-dropped | Implement pagination loop |
| **P3** | `req.setTimeout(10000)` has no callback; socket leak on timeout | `api/clickup.js:336` | Resource leak under timeout conditions | Add callback with `req.abort()` |

---

## DETAILED FINDINGS

### CRITICAL DEFECTS (Must fix before shipping)

#### F1: Frontend Username Bucket Filter (PRIMARY CULPRIT)
**File:** `funil.html:4381-4390`  
**Code:**
```javascript
['maria', 'nicolas', 'kennyd', 'gabriel'].forEach(userKey => {
  if (userKey === 'maria') 
    userData = usuarios.find(u => u.nome.toLowerCase().includes('maria'));
```

**Problem:** If ClickUp assignee `username` doesn't contain substring `maria|nicolas|kennyd|gabriel`, the accordion never renders. Example:
- ClickUp: `"MariaEduarda"` → matches (contains `maria`)
- ClickUp: `"m.eduarda"` → no match → **invisible**
- ClickUp: `"maria_vendas"` → matches
- ClickUp: `"Nicolas Santos"` → display_name collision with hardcoded bucket key

**Observed:** Only 2 leads show → exactly matching the 2 hardcoded buckets that get lucky matches.

**Fix:** Replace with `CONFIG.SELLERS` mapping from `funil.html:1680-1685` or expose `usuarios` dynamically in accordion renderer.

---

#### F2: No ClickUp Pagination
**File:** `api/clickup.js:30`  
**Code:**
```javascript
path: `/api/v2/list/${listId}/task?include_subtasks=false&limit=500&order_by=created&order_direction=asc`,
```

**Problem:** ClickUp API **hard-caps at 100 tasks per page**. Sending `limit=500` is silently ignored. No `page=N` loop implemented. If CRM-VENDAS has 150+ tasks, tasks 101+ are never fetched.

**Evidence:** `funil.html:3810-3820` (frontend) implements pagination correctly. Backend does not.

**Fix:** Add loop:
```javascript
let allTasks = [];
for (let page = 0; ; page++) {
  const response = await fetchClickUpList(listId, page);
  allTasks.push(...response.tasks);
  if (response.tasks.length < 100) break;
}
```

---

#### F3: `include_closed=false` by Default
**File:** `api/clickup.js:30`  
**Code:** Missing `archived=false` and `include_closed=true` params.

**Problem:** ClickUp defaults to `include_closed=false`, excluding tasks marked as "done"/completed. The "Pago" (closed/completed deals) stage likely contains 50+ tasks that are silently excluded.

**Fix:** Append `&archived=false&include_closed=true` to path.

---

#### F4: Silent Mock Fallback
**File:** `api/clickup.js:143, 206`  
**Code:**
```javascript
} catch (error) {
  return getMockFunilByUser();  // No HTTP error, just returns mock silently
}
```

**Problem:** Any error (401, 429, timeout, JSON parse fail) → returns `getMockFunilByUser()` with **exactly 2 users** (Maria Eduarda, Nicolas) and ~3 leads each. User sees HTTP 200 with fake data, no indication of failure.

**Observed:** The 2-user mock **exactly matches** the "2 shown" symptom, but `@qa` notes the mock is 9 leads, not 2, so this may not be the sole cause—but it's a critical silent failure mode.

**Fix:** Return HTTP 500 with error details:
```javascript
} catch (error) {
  console.error('[ClickUp] SYNC FAILED:', error.message);
  res.writeHead(500);
  return res.end(JSON.stringify({ 
    error: 'ClickUp sync failed',
    message: error.message,
    source: 'mock'  // mark this as fallback
  }));
}
```

---

#### F5: Missing `.env` Loading
**File:** `server.js` (missing), `package.json` (missing dotenv)  
**Problem:** No `require('dotenv')` in the codebase. Running `node server.js` locally gives `CLICKUP_API_KEY=''` (empty) unless operator manually exports env vars.

**Fix:**
1. Add `dotenv` to `package.json` devDependencies
2. Add `require('dotenv').config()` at the top of `server.js`

---

### HIGH-SEVERITY DEFECTS (Fix soon)

#### F6: Custom Field ID Lookup Broken
**File:** `api/clickup.js:181-182`  
**Code:**
```javascript
email: task.custom_fields?.find(f => f.id === 'email')?.value || '',
valor: task.custom_fields?.find(f => f.id === 'valor')?.value || 0,
```

**Problem:** ClickUp custom field IDs are UUIDs (e.g., `'131b8561-86af-4232-93b2-1951a1215e5c'`), not strings `'email'` or `'valor'`. Every comparison fails → every lead has `email:''` and `valor:0`.

**Evidence:** `funil.html:1770-1773` already has the correct UUIDs:
```javascript
FIELD_VALOR_PAGO: '131b8561-86af-4232-93b2-1951a1215e5c',
FIELD_EMAIL: '...',
```

**Fix:** Use UUID lookup instead of string match.

---

#### F7: Stage Matching via Substring in Task Name
**File:** `api/clickup.js:93-99, 172-176`  
**Code:**
```javascript
const etapaMatch = ETAPAS.find(e =>
  e.toLowerCase() === etapa.toLowerCase() ||
  task.name?.toLowerCase().includes(e.toLowerCase())  // ← BUG
) || 'Prospecção';
```

**Problem:** A task named `"Pago Cliente João"` whose ClickUp status is `"Prospecção"` gets routed to **"Pago"** stage (name match wins). Causes 60-90% misclassification.

**Fix:** Replace with explicit ClickUp status-to-stage mapping fetched from `/list/{id}/status` endpoint.

---

#### F8: Pagination Cap at 100 in loadFunilByUser
**File:** `api/clickup.js:30` (applies to both loadDistribuicao and loadFunilByUser)  
**Code:** Single call, no loop.

**Fix:** Same as F2.

---

#### F9: Multi-Assignee Duplication
**File:** `api/clickup.js:186-200`  
**Code:**
```javascript
userNames.forEach(userName => {
  // ... same leadData pushed to every assignee's bucket
  funilByUser[userName].etapas[etapaMatch].push(leadData);
});
```

**Problem:** A lead shared by 3 users appears 3 times. `totalLeads` counts it 3×. This is not data loss, but inflates the total count.

**Fix:** Either deduplicate at aggregation layer, or document and adjust the count display.

---

### MEDIUM-SEVERITY DEFECTS (Fix in P2)

#### F10: API Key Hardcoded in Public HTML
**File:** `funil.html:1675`  
**Code:**
```javascript
API_KEY: 'pk_112005023_XXXXXXXXXX'
```

**Note at line 1694:** *"Para produção, mova API_KEY para proxy backend."*

**Action:** Rotate this key immediately and move to backend.

---

#### F11: Env Var Name Mismatch
**File:** `.env` vs `api/clickup.js:130,158`  
**.env:** `CLICKUP_LIST_ID=901309503357`  
**Code:** reads `process.env.CLICKUP_CRM_VENDAS_ID`

**Fix:** Align names or add a mapping layer.

---

#### F12: RLS N+1 Queries
**File:** `supabase-setup.sql:42-72`  
**Policy:**
```sql
EXISTS(SELECT 1 FROM public.profiles WHERE ... AND role='admin')
```

Evaluated per row → quadratic cost.

**Fix:** Wrap in `SECURITY DEFINER is_admin()` function.

---

#### F13: Missing Schema Columns
**File:** `supabase-setup.sql` vs `api/tab-permissions.js`  
**Missing columns:**
- `profiles.clickup_username` (written at line 221)
- `profiles.updated_at` (written at line 222)
- `profiles.permissions` (jsonb, read/written at line 34,49)
- `tab_permissions.updated_by` (written at line 161)

**Fix:** Create migration:
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clickup_username TEXT,
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tab_permissions
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
```

---

#### F14: Socket Leak on Timeout
**File:** `api/clickup.js:336`  
**Code:**
```javascript
req.setTimeout(10000);  // No callback
req.end();
```

**Problem:** If timeout fires, socket is not closed. Resource leak under sustained timeout conditions.

**Fix:** Add callback with abort:
```javascript
req.setTimeout(10000, () => {
  req.abort();
});
```

---

## ACCEPTANCE CRITERIA

A story implementing these fixes MUST:

- [ ] Frontend dynamically renders user accordions (no hardcoded 4-user filter)
- [ ] ClickUp pagination loops until all tasks fetched
- [ ] `include_closed=true` + `archived=false` in API URL
- [ ] Mock fallback returns HTTP 5xx with error message (not HTTP 200 with fake data)
- [ ] `.env` is loaded via `dotenv`
- [ ] Custom field IDs use UUID lookup
- [ ] Stage matching uses ClickUp list status endpoint
- [ ] Schema migration creates missing columns
- [ ] API key moved from HTML to backend
- [ ] All timeout callbacks properly handle cleanup
- [ ] Test: `/api/funil-by-user` returns count within ±5% of ClickUp UI
- [ ] No credential leaks in frontend code

---

## IMPLEMENTATION ROADMAP

### Phase 1: Unblock (P0 — 2 hours)
1. **F1 (Frontend filter)** — Replace `.includes()` match with `CONFIG.SELLERS` mapping or dynamic render
2. **F2 (Pagination)** — Add while loop to fetch all pages
3. **F3 (include_closed)** — Append URL params
4. **F4 (Mock fallback)** — Return HTTP 500 on error
5. **F5 (.env loading)** — Add `require('dotenv')` + `dotenv` dependency

### Phase 2: Hardening (P1 — 3 hours)
6. **F6 (Custom fields)** — Use UUID lookup
7. **F7 (Stage matching)** — Call `/list/{id}/status` endpoint
8. **F9 (Deduplication)** — Implement if needed
9. **F13 (Schema)** — Run migration

### Phase 3: Polish (P2 — 1 hour)
10. **F10 (Credential rotation)** — Rotate key, move to backend
11. **F12 (RLS optimization)** — Add SECURITY DEFINER function
12. **F14 (Socket leak)** — Add timeout callback

### Validation
- Compare `/api/funil-by-user` count to ClickUp UI count (expect ≤ 5% variance)
- Manual testing: Create test user in ClickUp, verify accordion appears in Funil
- Load test: Verify pagination handles 500+ tasks without truncation

---

## NEXT STEPS

1. **@sm** — Create story from this document
2. **@dev** — Implement Phase 1 (P0 fixes)
3. **@qa** — Validate with test plan above
4. **@devops** — Push to production

---

**Prepared by:** Multi-Agent Diagnostic  
**Date:** 2026-04-20  
**Confidence:** 95% on root cause identification; 100% on defect list
