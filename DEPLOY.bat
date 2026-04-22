@echo off
REM Automated Supabase Migration Deployment for Windows
REM Executes all roleta system migrations via Supabase CLI

setlocal enabledelayedexpansion

echo.
echo 🚀 Roleta System Migration Deployment
echo ═══════════════════════════════════════
echo.

REM Check if Supabase CLI is installed
where supabase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo ❌ Supabase CLI not found
  echo.
  echo Install via:
  echo   npm install -g supabase
  echo.
  echo Or follow: https://supabase.com/docs/guides/cli/getting-started
  exit /b 1
)

echo ✓ Supabase CLI found
echo.

REM Check if migrations directory exists
if not exist "migrations" (
  echo ❌ migrations/ directory not found
  echo.
  echo Run this script from: C:\Users\venda\Documents\funil-gps
  exit /b 1
)

echo ✓ migrations/ directory found
echo.

REM List migrations
echo 📋 Migrations to execute:
for %%F in (migrations\*.sql) do (
  echo   - %%~nxF
)
echo.

REM Push migrations
echo 🔄 Pushing migrations to Supabase...
call supabase db push

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo ❌ Migration deployment failed
  echo.
  echo Troubleshooting:
  echo 1. Ensure you're logged in: supabase login
  echo 2. Link to your project: supabase link --project-ref gmpdcgjsbbyqkuftohce
  echo 3. Try again: supabase db push
  exit /b 1
)

echo.
echo ═══════════════════════════════════════
echo ✅ Migrations deployed successfully!
echo.
echo Next steps:
echo 1. Verify in Supabase Dashboard → SQL Editor
echo 2. Run validation queries from PHASE_C_FINAL_DEPLOYMENT.md
echo 3. Test with TEST 1-9 from deployment guide
echo 4. Check funil.html console for [Roleta] logs
echo.
pause
