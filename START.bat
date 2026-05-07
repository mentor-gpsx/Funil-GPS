@echo off
cd /d "C:\Users\venda\Documents\funil-gps"
echo.
echo ===================================
echo Portal Financeiro - Iniciando...
echo ===================================
echo.
npm run setup
echo.
echo Iniciando servidor...
npm start
pause
