# 🚀 Portal Financeiro - GPSX

## Inicialização Rápida

### Opção 1: Script Automatizado (Recomendado)
1. **Abra o arquivo:** `INICIAR_PORTAL.bat`
2. **Aguarde:** O servidor iniciará automaticamente
3. **Acesse:** O navegador abrirá em `http://localhost:3000/dashboard.html`

### Opção 2: Terminal Manual
```bash
cd C:\Users\venda\Documents\funil-gps
npm start
```

Depois acesse: **http://localhost:3000/dashboard.html**

---

## 📊 O que você verá

### Dashboard Principal
- **4 KPI Cards:**
  - 💰 Valor Esperado (total de cobranças)
  - ✅ Valor Recebido (saques aprovados)
  - ⚠️ Discrepância (diferença)
  - 📊 Taxa de Reconciliação (%)

- **6 Abas de Análise:**
  1. **Dashboard** - KPIs e últimas cobranças
  2. **Receitas** - Todas as cobranças com filtros
  3. **Previsibilidade** - Previsão de 30 dias
  4. **Conciliação** - Matching de cobranças vs saques
  5. **Auditoria** - Análise por método, gateway, produto
  6. **Evidências** - Detalhes completos com agent audit

---

## 🔧 Comandos Disponíveis

```bash
# Iniciar servidor
npm start

# Setup banco de dados
npm run setup

# Importar dados de teste
npm run import:cakto:test

# Desenvolver (com reload automático)
npm run dev
```

---

## 📈 Dados de Teste

- **3 Clientes** com dados realistas
- **7 Cobranças** em diferentes status (paid/open)
- **5 Saques** aprovados (R$ 17.910,57)
- **Taxa de Reconciliação:** 111,94%

---

## 🛠️ Troubleshooting

### "Não é possível acessar esse site"
1. Verifique se o servidor está rodando (janela com "npm start" aberta)
2. Aguarde 3-5 segundos após iniciar
3. Pressione `F5` para recarregar a página

### "Porta 3000 já está em uso"
```bash
# Matare todos os processos Node.js
taskkill /F /IM node.exe

# Depois inicie novamente
npm start
```

### Banco de dados corrompido
```bash
# Deletar banco de dados
del ".data\cakto.db"

# Recrear
npm run setup
npm run import:cakto:test
```

---

## 📁 Estrutura de Pastas

```
funil-gps/
├── backend/
│   ├── src/
│   │   └── server.js          # Express API
│   └── scripts/
│       └── import-cakto-test-data.js
├── dashboard.html             # UI Principal
├── setup.js                   # Database initialization
├── package.json
└── .data/
    └── cakto.db              # SQLite database
```

---

## 🔐 Segurança

- **CORS habilitado** para localhost
- **SQLite** com índices para performance
- **Dados de teste** seguros e não produção

---

## 📞 Suporte

**API Endpoints:**
- `GET /api/dashboard` - KPIs principais
- `GET /api/charges` - Todas as cobranças
- `GET /api/saques` - Todos os saques
- `GET /api/reconciliation` - Análise de conciliação
- `GET /api/forecast` - Previsão 30 dias
- `GET /api/customers` - Clientes
- `GET /api/audit` - Auditoria detalhada
- `GET /health` - Health check

---

**Última atualização:** 2026-05-06  
**Versão:** 1.0.0
