# 🚀 QUICK START - Roleta System Deployment

**TL;DR:** 3 steps to get everything working.

---

## ✅ WHAT'S READY

- ✅ **funil.html** - All code implemented (dark mode, roleta system, per-user permissions)
- ✅ **3 Migrations** - All SQL files ready in `migrations/` folder
- ✅ **Testing Guide** - Complete test suite in PHASE_C_FINAL_DEPLOYMENT.md

---

## 🔧 STEP 1: Install Supabase CLI (One-time Only)

```bash
npm install -g supabase
```

Verify installation:
```bash
supabase --version
```

Expected output: `supabase version X.X.X` ✓

---

## 🔑 STEP 2: Link to Your Supabase Project (One-time Only)

```bash
supabase login
# Follow prompts to authenticate
```

Then link your project:
```bash
supabase link --project-ref gmpdcgjsbbyqkuftohce
```

Verify link:
```bash
supabase projects list
```

Expected: Your project appears in the list ✓

---

## 🚀 STEP 3: Deploy All Migrations (THIS IS IT!)

Navigate to the funil-gps folder:
```bash
cd "C:\Users\venda\Documents\funil-gps"
```

Run the deployment script:

**Windows (CMD):**
```bash
DEPLOY.bat
```

**macOS/Linux (Bash):**
```bash
bash DEPLOY.sh
```

Expected output:
```
✓ Supabase CLI found
✓ migrations/ directory found
📋 Migrations to execute:
  - 001_create_roleta_tables.sql
  - 002_add_revoke_grant_safe_function.sql
  - 003_add_roleta_user_permissions.sql
🔄 Pushing migrations to Supabase...
[Migration Summary: X migrations applied]
✅ Migrations deployed successfully!
```

---

## ✨ EVERYTHING IS NOW LIVE

Once you see "✅ Migrations deployed successfully!", the system is ready to use.

---

## 🧪 QUICK TEST (2 minutes)

1. **Open funil.html** in your browser
2. **Test dark mode:** Click 🌙 button → Colors should invert
3. **Test auto-generation:** Create a closing with value ≥ R$9,900 → Roleta should appear
4. **Check console:** Press F12 → Console tab → Look for `[Roleta] ✓` messages

All three working? ✅ You're done!

---

## 📋 COMPLETE TESTING (Optional)

For detailed testing of all 9 scenarios, follow: **PHASE_C_FINAL_DEPLOYMENT.md**

---

## 🆘 IF SOMETHING FAILS

**Error: "supabase: command not found"**
→ Run: `npm install -g supabase`

**Error: "Project not linked"**
→ Run: `supabase link --project-ref gmpdcgjsbbyqkuftohce`

**Error in migration (SQL syntax)**
→ Check the error message and see PHASE_C_FINAL_DEPLOYMENT.md § ROLLBACK section

**Can't connect to Supabase**
→ Run: `supabase login` again and verify your credentials

---

## 📊 SYSTEM IS NOW COMPLETE

**Features Available:**
- ✅ Dark mode with logo color change
- ✅ Auto-generation of roleta from closings (≥R$9,900 = alta, <R$9,900 = baixa)
- ✅ Manual grant spins (admin only)
- ✅ Per-user roleta authorization
- ✅ Grant/revoke roleta to specific users
- ✅ Real-time authorization checks
- ✅ Race condition prevention (Advisory Locks)
- ✅ Audit trail of all revocations

**Database:**
- ✅ 6 tables with proper relationships
- ✅ 5 RPC functions for backend logic
- ✅ RLS policies for security
- ✅ Performance indexes
- ✅ Audit logging

---

## 📚 DOCUMENTATION

- **PHASE_C_FINAL_DEPLOYMENT.md** - Complete deployment guide with 9 tests
- **PHASE_A_IMPLEMENTATION.md** - Architecture & design decisions
- **INSTRUCOES_DEPLOYMENT_FASE_B.md** - Previous phase documentation

---

**That's it! Your roleta system is live.** 🎉

For questions or issues, check the documentation or review the console logs.
