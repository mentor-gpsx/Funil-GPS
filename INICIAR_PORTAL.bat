@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

title Portal Financeiro - GPSX
color 0A

echo.
echo ════════════════════════════════════════════════════════════
echo  🚀 PORTAL FINANCEIRO - GPSX
echo  Sistema de Reconciliação Multi-Gateway
echo ════════════════════════════════════════════════════════════
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js não encontrado!
    echo    Instale em: https://nodejs.org/
    pause
    exit /b 1
)

REM Kill any existing Node processes on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| find "3000"') do taskkill /PID %%a /F >nul 2>&1

cd /d "%~dp0"

echo ✅ Iniciando banco de dados...
call npm run setup >nul 2>&1

echo ✅ Importando dados de teste...
call npm run import:cakto:test >nul 2>&1

echo.
echo ✅ Iniciando servidor...
echo    Dashboard: http://localhost:3000/dashboard.html
echo.

REM Start the server and keep the window open
npm start

pause
