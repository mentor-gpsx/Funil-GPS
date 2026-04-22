# 🚀 PHASE C - FINAL DEPLOYMENT
## Roleta System: Complete Implementation

**Status:** ✅ Code complete | ⏳ Supabase migrations ready | 📋 Testing procedure below

---

## 📋 WHAT'S BEEN IMPLEMENTED

### 1. Dark Mode System
- ✅ CSS variables switched via `html.dark-mode` class
- ✅ Logo color changes in dark mode (white → black and vice versa)
- ✅ Toggle button with localStorage persistence
- ✅ All colors inverted correctly for night vision

### 2. Roleta System - Three Layers

#### Layer 1: Auto-Generation from Closings
- ✅ `detectNewClosings()` creates spins automatically
- ✅ Threshold: >= R$9900 = "alta" wheel, < R$9900 = "baixa" wheel
- ✅ Creates `roleta_grants` record with `source='auto-closing'`
- ✅ Supabase-first pattern: INSERT to DB BEFORE updating localStorage

#### Layer 2: Manual Grants (Admin)
- ✅ `grantSpin()` allows admin to manually grant spins
- ✅ Creates `roleta_grants` record with `source='manual-grant'`
- ✅ Only admins can grant (role check)

#### Layer 3: Per-User Authorization (NEW - Phase C)
- ✅ `grantRoletaToUser(userId, sellerId)` - Grant roleta to specific user
- ✅ `revokeRoletaFromUser(userId, sellerId)` - Revoke roleta from user
- ✅ `check_roleta_authorized()` RPC - Real-time authorization check
- ✅ Precedence rule: `roleta_settings.roleta_ativa=false` blocks ALL users
- ✅ Individual user permission only matters if seller flag is true

### 3. Concurrency & Safety
- ✅ `revoke_grant_safe_with_lock()` - PostgreSQL Advisory Lock prevents race conditions
- ✅ Audit trail in `roleta_revocation_log`
- ✅ Constraint: `source='manual-grant'` requires `granted_by NOT NULL`

### 4. Visibility & Synchronization
- ✅ `updateRoletaNotif()` syncs `pendingSpins` from Supabase
- ✅ Checks user-specific authorization via `check_roleta_authorized()`
- ✅ Updates notification badge with total pending spins
- ✅ Async/await prevents race conditions in data flow

---

## 🔧 DATABASE SETUP - DO THIS FIRST

### Step 1: Copy Each Migration to Supabase SQL Editor

Go to: https://app.supabase.com/project/gmpdcgjsbbyqkuftohce/sql/new

Run each migration **in order**:

#### Migration 001 (Create Core Tables)
```sql
-- Copy entire content from:
-- C:\Users\venda\Documents\funil-gps\migrations\001_create_roleta_tables.sql
-- Paste into Supabase SQL Editor and click "Run"
```

**Expected result:** ✅ No errors, 3 tables created (roleta_settings, roleta_grants, roleta_spins)

---

#### Migration 002 (Add Safety Features)
```sql
-- Copy entire content from:
-- C:\Users\venda\Documents\funil-gps\migrations\002_add_revoke_grant_safe_function.sql
-- Paste into Supabase SQL Editor and click "Run"
```

**Expected result:** ✅ No errors, revoke_grant_safe_with_lock() function created, roleta_revocation_log table created

---

#### Migration 003 (Per-User Permissions - NEW)
```sql
-- Copy entire content from:
-- C:\Users\venda\Documents\funil-gps\migrations\003_add_roleta_user_permissions.sql
-- Paste into Supabase SQL Editor and click "Run"
```

**Expected result:** ✅ No errors
- roleta_user_permissions table created
- check_roleta_authorized() function created
- grant_roleta_permission() function created
- revoke_roleta_permission() function created

---

### Step 2: Verify All Migrations Succeeded

In Supabase SQL Editor, run these validation queries:

```sql
-- ✓ Check all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' AND table_name LIKE 'roleta%'
ORDER BY table_name;
-- Expected: 6 tables (settings, grants, spins, revocation_log, user_permissions, + views if any)

-- ✓ Check all functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema='public' AND routine_name LIKE '%roleta%' OR routine_name LIKE '%grant%'
ORDER BY routine_name;
-- Expected: 5 functions (revoke_grant_safe_with_lock, check_roleta_authorized, grant_roleta_permission, revoke_roleta_permission, + trigger function)

-- ✓ Check seller defaults are inserted
SELECT * FROM roleta_settings;
-- Expected: 4 rows (maria, nicolas, kennyd, gabriel), all with roleta_ativa=true
```

---

## 🧪 TESTING - COMPREHENSIVE SUITE

**Prerequisites:**
- funil.html updated (code is already in place)
- All 3 migrations executed in Supabase
- Logged in as admin or test user

### TEST 1: Dark Mode Toggle
**Duration:** 1 min

1. Open funil.html in browser
2. Click the "🌙" button in header
3. Verify:
   - Background turned dark
   - Text became light
   - Logo mark color inverted
4. Refresh page (F5)
5. Verify dark mode persisted (localStorage working)
6. Click again to return to light mode

**Expected result:** ✅ PASS

---

### TEST 2: Auto-Generation (Closings → Roleta)
**Duration:** 3 min

1. Go to "Closings" tab
2. Create a new closing:
   - Name: "Test Auto-Generation"
   - Seller: maria
   - Value: R$ 15,000 (≥ 9,900 → should trigger "alta" wheel)
3. Verify in console:
   ```javascript
   console.log("pendingSpins after closing:", pendingSpins);
   // Expected: pendingSpins.maria.alta = 1
   ```
4. Go back to Dashboard
5. Hover over "maria" and check roleta notification
6. Verify notification shows: "📍 1 giro de alta"

**Expected result:** ✅ PASS (localStorage + Supabase both incremented)

---

### TEST 3: Manual Grant (Admin)
**Duration:** 2 min

1. Go to "Roletas" (admin) tab
2. Scroll to "Concessão Manual"
3. Select: maria + baixa
4. Click "Conceder Giro"
5. Alert should show: "Giro concedido!"
6. Verify in console:
   ```javascript
   console.log("maria.baixa spins:", pendingSpins.maria.baixa);
   // Expected: incremented by 1
   ```
7. In Supabase, run:
   ```sql
   SELECT * FROM roleta_grants 
   WHERE seller_key='maria' AND wheel='baixa' 
   ORDER BY created_at DESC LIMIT 1;
   -- Expected: spin_status='pending', source='manual-grant'
   ```

**Expected result:** ✅ PASS

---

### TEST 4: Grant Roleta to Specific User (NEW)
**Duration:** 3 min

**Setup:** You need a test user ID. Go to Supabase → Auth → Users, get a user UUID

1. In console, grant roleta to specific user:
   ```javascript
   // Get a real user ID from Supabase
   const testUserId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"; // Replace with real UUID
   const testSeller = "maria";
   
   await grantRoletaToUser(testUserId, testSeller);
   // Expected console: "[Roleta] ✓ Liberado para usuário xxxxxxxx"
   ```
2. Alert should show: "Roleta liberada com sucesso!"
3. Verify in Supabase:
   ```sql
   SELECT * FROM roleta_user_permissions 
   WHERE user_id='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' 
   AND seller_key='maria';
   -- Expected: is_enabled=true, granted_at=NOW()
   ```

**Expected result:** ✅ PASS

---

### TEST 5: Revoke Roleta from User (NEW)
**Duration:** 2 min

1. Use same test user from TEST 4
2. In console:
   ```javascript
   const testUserId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
   const testSeller = "maria";
   
   await revokeRoletaFromUser(testUserId, testSeller);
   // Expected console: "[Roleta] ✓ Revogado para usuário xxxxxxxx"
   ```
3. Alert should show: "Roleta revogada com sucesso!"
4. Verify in Supabase:
   ```sql
   SELECT * FROM roleta_user_permissions 
   WHERE user_id='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' 
   AND seller_key='maria';
   -- Expected: is_enabled=false, notes contains 'REVOKED: Revogado via admin UI'
   ```

**Expected result:** ✅ PASS

---

### TEST 6: User Authorization Check (NEW)
**Duration:** 3 min

**Scenario:** After revoking roleta from user (TEST 5), user should NOT see roleta

1. Log in as the test user (if possible) or simulate by checking authorization:
   ```javascript
   const testUserId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
   const testSeller = "maria";
   
   const { data: isAuth } = await _sb.rpc('check_roleta_authorized', {
     p_user_id: testUserId,
     p_seller_key: testSeller
   });
   
   console.log("User authorized for maria?", isAuth);
   // Expected: false (because we revoked in TEST 5)
   ```
2. Now grant again and verify returns true:
   ```javascript
   await grantRoletaToUser(testUserId, testSeller);
   
   // Check again
   const { data: isAuth2 } = await _sb.rpc('check_roleta_authorized', {
     p_user_id: testUserId,
     p_seller_key: testSeller
   });
   
   console.log("User authorized for maria after grant?", isAuth2);
   // Expected: true
   ```

**Expected result:** ✅ PASS

---

### TEST 7: Seller Flag Overrides Individual Permission
**Duration:** 2 min

**Scenario:** Even if user has `is_enabled=true`, if `roleta_ativa=false` at seller level, they should NOT see roleta

1. Grant roleta to test user (TEST 4)
2. Disable roleta at seller level:
   ```javascript
   await toggleSellerRoleta('maria');
   // Should toggle roleta_ativa to false in roleta_settings
   ```
3. Check authorization:
   ```javascript
   const testUserId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
   const { data: isAuth } = await _sb.rpc('check_roleta_authorized', {
     p_user_id: testUserId,
     p_seller_key: 'maria'
   });
   
   console.log("User authorized when seller disabled?", isAuth);
   // Expected: false (seller level blocks everything)
   ```
4. Re-enable seller flag:
   ```javascript
   await toggleSellerRoleta('maria');
   // Should toggle roleta_ativa back to true
   ```
5. Check authorization again:
   ```javascript
   const { data: isAuth2 } = await _sb.rpc('check_roleta_authorized', {
     p_user_id: testUserId,
     p_seller_key: 'maria'
   });
   
   console.log("User authorized when seller enabled?", isAuth2);
   // Expected: true (since individual permission still exists)
   ```

**Expected result:** ✅ PASS

---

### TEST 8: Race Condition Prevention (removeSpinGrant)
**Duration:** 3 min

**Scenario:** Two simultaneous revocations should NOT cause double-spend

1. Create 2 spins for maria (baixa):
   ```javascript
   // In "Roletas" admin tab, grant 2 spins manually
   await grantSpin('maria', 'baixa');
   await grantSpin('maria', 'baixa');
   
   console.log("maria.baixa count before removal:", pendingSpins.maria.baixa);
   // Expected: 2
   ```
2. Trigger simultaneous removals:
   ```javascript
   Promise.all([
     removeSpinGrant('maria', 'baixa'),
     removeSpinGrant('maria', 'baixa')
   ]).then(() => {
     console.log("Both removals completed");
     console.log("maria.baixa count after removal:", pendingSpins.maria.baixa);
     // Expected: 0 (both succeeded without conflict)
   });
   ```
3. Verify in Supabase:
   ```sql
   SELECT COUNT(*) as revoked_count FROM roleta_grants 
   WHERE seller_key='maria' AND wheel='baixa' AND spin_status='revoked'
   ORDER BY updated_at DESC LIMIT 2;
   -- Expected: exactly 2 revoked (no overlap/error)
   ```

**Expected result:** ✅ PASS (no "already revoked" errors)

---

### TEST 9: localStorage ↔ Supabase Synchronization
**Duration:** 2 min

1. In console, manually set a value:
   ```javascript
   pendingSpins.gabriel.alta = 5;
   localStorage.setItem('pendingSpins', JSON.stringify(pendingSpins));
   ```
2. Go to another page/tab to break localStorage context
3. Return to Dashboard
4. Call updateRoletaNotif():
   ```javascript
   await updateRoletaNotif();
   ```
5. Check that pendingSpins was resync'd from Supabase (may have different value):
   ```javascript
   console.log("pendingSpins after sync:", pendingSpins);
   // This should reflect actual DB state, not localStorage
   ```

**Expected result:** ✅ PASS (Supabase is source of truth)

---

## ✅ VERIFICATION CHECKLIST

Before marking as complete, verify:

- [ ] All 3 migrations executed in Supabase without errors
- [ ] All 6 tables exist in Supabase
- [ ] All 5 functions exist in Supabase
- [ ] funil.html is updated with dark mode code
- [ ] funil.html has grantRoletaToUser() and revokeRoletaFromUser() functions
- [ ] funil.html updateRoletaNotif() calls check_roleta_authorized() RPC
- [ ] TEST 1-9 all PASS
- [ ] Console has no JavaScript errors
- [ ] Roleta notification appears/disappears correctly
- [ ] Admin panel shows spin grants properly

---

## 🚨 ROLLBACK (If Something Breaks)

If any migration fails or you need to start over:

1. Go to Supabase SQL Editor
2. Run rollback script (drops all tables):
   ```sql
   DROP TABLE IF EXISTS roleta_revocation_log;
   DROP TABLE IF EXISTS roleta_user_permissions;
   DROP TABLE IF EXISTS roleta_spins;
   DROP TABLE IF EXISTS roleta_grants;
   DROP TABLE IF EXISTS roleta_settings;
   
   DROP FUNCTION IF EXISTS revoke_grant_safe_with_lock(TEXT, TEXT, UUID);
   DROP FUNCTION IF EXISTS check_roleta_authorized(UUID, VARCHAR);
   DROP FUNCTION IF EXISTS grant_roleta_permission(UUID, VARCHAR, UUID, TEXT);
   DROP FUNCTION IF EXISTS revoke_roleta_permission(UUID, VARCHAR, UUID, TEXT);
   DROP FUNCTION IF EXISTS update_updated_at_column();
   ```
3. Reload funil.html (F5)
4. localStorage will still have old data - clear it:
   ```javascript
   localStorage.clear();
   location.reload();
   ```

---

## 📊 SYSTEM ARCHITECTURE SUMMARY

```
┌─────────────────────────────────────────────────────────────────┐
│ FUNIL.HTML (Frontend - JavaScript)                              │
├─────────────────────────────────────────────────────────────────┤
│ ├─ Dark Mode: toggleDarkMode() ↔ localStorage                   │
│ ├─ Auto-Gen: detectNewClosings() → Supabase.INSERT              │
│ ├─ Manual: grantSpin() → Supabase.INSERT                        │
│ ├─ User Auth: grantRoletaToUser() → RPC grant_roleta_permission │
│ ├─ User Revoke: revokeRoletaFromUser() → RPC revoke_roleta_perm │
│ └─ Sync: updateRoletaNotif() → RPC check_roleta_authorized()    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
    ┌─────────────┐      ┌──────────────────┐
    │ localStorage│      │ Supabase Database│
    │             │      │                  │
    │ pendingSpins│      ├─ roleta_settings │
    │ darkMode    │      ├─ roleta_grants   │
    │ authToken   │      ├─ roleta_spins    │
    └─────────────┘      ├─ roleta_revocation_log
                         ├─ roleta_user_permissions
                         ├─ Functions (5x)
                         ├─ RLS Policies
                         └─ Indexes
```

---

## 🎯 NEXT STEPS (Optional - Phase D)

After verifying everything works:

1. **Real-time Subscriptions** - Use Supabase Realtime to push updates instead of polling
   - Replace 30-second detectNewClosings() poll with `.on('*', ...)` subscription
   - Instant sync across multiple browser tabs

2. **UI for User Permissions** - Add admin panel to manage per-user roleta grants
   - List all users for each seller
   - Buttons to grant/revoke per user
   - Audit log of who granted/revoked when

3. **Mobile App** - Port system to mobile if needed

---

## 📞 SUPPORT

If you encounter issues:

1. Check browser console (F12 → Console tab)
2. Look for `[Roleta]` log entries
3. Verify Supabase connectivity in Network tab
4. Run validation queries in Supabase SQL Editor (see Step 2 above)

**Document all errors and we'll debug together.**

---

**Status:** 🟢 Ready for deployment
**Version:** Phase C (2026-04-09)
**Owner:** Roleta System

✅ All code implemented | ⏳ Waiting for Supabase migrations | 📋 Testing ready
