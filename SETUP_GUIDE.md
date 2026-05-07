# 🚀 Guia de Execução - Portal Financeiro GPSX

Siga este guia passo-a-passo para iniciar o sistema completo.

---

## ✅ Pré-requisitos

- ✓ Node.js 16+ instalado
- ✓ npm ou yarn
- ✓ Arquivo `orders_report.csv` no diretório raiz
- ✓ Terminal (CMD, PowerShell ou Git Bash)

---

## 📋 Passo 1: Preparar Ambiente

### 1.1 Navegar para o diretório do projeto
```bash
cd "C:\Users\venda\Documents\funil-gps"
```

### 1.2 Instalar dependências
```bash
npm install
```

**Espere:** ~2-3 minutos (primeira instalação)

**Saída esperada:**
```
added XX packages in XXs
```

---

## 🗄️ Passo 2: Configurar Banco de Dados

### 2.1 Executar setup
```bash
npm run setup
```

**O script irá:**
1. ✅ Criar diretório `.data/`
2. ✅ Criar arquivo `cakto.db` (SQLite)
3. ✅ Criar 3 tabelas (customers, charges, saques)
4. ✅ Importar 70+ registros do CSV
5. ✅ Exibir estatísticas finais

**Saída esperada:**
```
═══════════════════════════════════════════════════════════
🚀 SETUP - Portal Financeiro
═══════════════════════════════════════════════════════════

✅ Conectado ao banco de dados SQLite

1️⃣ Criando tabelas...
✅ Tabelas criadas com sucesso

2️⃣ Importando dados do CSV...
   📊 70 registros encontrados
   ⏳ Processados: 70/70
✅ IMPORTAÇÃO CONCLUÍDA!
   📍 Clientes: 76
   📍 Cobranças: 70

📊 STATUS DO BANCO:
   Cobranças: 70
   Total: R$ 95.512,00

═══════════════════════════════════════════════════════════

🚀 PRÓXIMO PASSO:
   1. Abra outro terminal
   2. Execute: npm start
   3. Abra: http://localhost:3000/dashboard.html

═══════════════════════════════════════════════════════════
```

---

## 🎯 Passo 3: Iniciar Servidor Backend

### 3.1 Abrir novo terminal (mantendo o anterior aberto)
```bash
cd "C:\Users\venda\Documents\funil-gps"
npm start
```

**Saída esperada:**
```
✅ Financial Portal API running on port 3000
📊 Dashboard: http://localhost:3000/dashboard.html
```

**O servidor está pronto quando você ver esta mensagem.**

---

## 🌐 Passo 4: Acessar Dashboard

### 4.1 Abrir navegador
- Chrome: `http://localhost:3000/dashboard.html`
- Firefox: `http://localhost:3000/dashboard.html`
- Safari: `http://localhost:3000/dashboard.html`

### 4.2 Você verá:
```
┌─────────────────────────────────────────┐
│ 💰 Portal Financeiro                    │
│ Sistema de Conciliação Multi-Gateway    │
└─────────────────────────────────────────┘

[📊 Dashboard] [💵 Receitas] [📈 Previsibilidade]
[🔗 Conciliação] [🔍 Auditoria] [📋 Evidências]

┌─────────────┬─────────────┬─────────────┬──────────────┐
│ Valor       │ Valor       │ Discrepância│ Taxa de      │
│ Esperado    │ Recebido    │             │ Conciliação  │
│ R$ 95.512   │ R$ 67.610   │ R$ 27.902   │ 70.76%       │
└─────────────┴─────────────┴─────────────┴──────────────┘

Últimas Cobranças
[ID Venda] [Produto] [Valor] [Método] [Status] [Data]
```

---

## 📊 Passo 5: Explorar Abas

### 5.1 📊 Dashboard
- ✅ 4 KPIs em tempo real
- ✅ Últimas 10 cobranças
- ✅ Clique para expandir detalhes

### 5.2 💵 Receitas
- ✅ Todos os 70 cobranças
- ✅ Filtro por gateway e método
- ✅ Análise de valores brutos/líquidos

### 5.3 📈 Previsibilidade
- ✅ Histórico de 30 dias
- ✅ Estatísticas diárias
- ✅ Tendências e projeções

### 5.4 🔗 Conciliação
- ✅ Status: Conciliados, Pendentes, Não Conciliados
- ✅ Filtro por status
- ✅ Esperado vs Recebido

### 5.5 🔍 Auditoria
- ✅ Análise por método de pagamento
- ✅ Análise por gateway
- ✅ Análise por produto
- ✅ Resumo de taxas

### 5.6 📋 Evidências
- ✅ Lista completa de cobranças (charges)
- ✅ Lista completa de saques
- ✅ Rastreamento de transações

---

## 🔄 Passo 6: Importar Dados Adicionais (Opcional)

Se você tiver mais dados para importar:

### 6.1 Dados de teste Cakto
```bash
npm run import:cakto:test
```
Insere R$ 67.610 em saques de teste

### 6.2 Dados manuais
```bash
npm run import:cakto:manual
```
Permite adicionar saques manuais

---

## 🛑 Parar o Servidor

### Pressionar `Ctrl + C` no terminal
```bash
^C
```

Terminal mostrará:
```
^C
Shutting down gracefully...
```

---

## 🔧 Troubleshooting

### ❌ Erro: "Port 3000 in use"
```bash
# Use porta diferente
PORT=3001 npm start
# Acesse: http://localhost:3001/dashboard.html
```

### ❌ Erro: "SQLITE_CANTOPEN"
```bash
# Limpar e recomeçar
rm -r .data
npm run setup
npm start
```

### ❌ Dashboard em branco
1. Abra console (F12) → Aba Console
2. Verifique se há mensagens de erro
3. Certifique-se que servidor está rodando (verifique terminal)

### ❌ Dados não aparecem
1. Verifique se `npm run setup` completou com sucesso
2. Aguarde 2-3 segundos para carregamento inicial
3. Clique no botão 🔄 "Atualizar" em cada aba

---

## 📈 Validações

Depois do setup completo, você deve ver:

- ✅ **Dashboard**
  - Esperado: R$ 95.512,00
  - Recebido: R$ 67.610,00
  - Discrepância: R$ 27.902,00
  - Taxa: 70.76%

- ✅ **Receitas**
  - 70 cobranças listadas
  - Gateway: Infinitepay
  - Métodos diversos

- ✅ **Conciliação**
  - 45 conciliados
  - 20 pendentes
  - 5 não conciliados

- ✅ **Auditoria**
  - Análise por método
  - Análise por gateway
  - Totais de taxas

---

## 📞 Próximas Etapas

1. **API Cakto Real**
   - Adicione credenciais em `.env`
   - Configure webhook receiver
   - Implemente polling automático

2. **PostgreSQL Production**
   - Migre de SQLite para PostgreSQL
   - Configure backup automático
   - Implemente replicação

3. **Alertas em Tempo Real**
   - Webhook para discrepâncias
   - Email notifications
   - Dashboard alertas

4. **Multi-Gateway Completo**
   - Integre Cakto API
   - Integre Infinitepay API
   - Suporte para mais gateways

---

## 📄 Arquivos Principais

```
funil-gps/
├── package.json              ← Dependências e scripts
├── setup.js                  ← Inicialização do banco
├── dashboard.html            ← Frontend (GPSX design)
├── backend/
│   ├── src/server.js         ← API REST
│   ├── scripts/
│   │   ├── import-csv.js     ← Importador CSV
│   │   ├── import-cakto-test-data.js
│   │   └── import-cakto-manual.js
│   └── .data/
│       └── cakto.db          ← Database
├── orders_report.csv         ← Dados originais
├── README.md                 ← Documentação completa
├── .env.example              ← Template de variáveis
└── SETUP_GUIDE.md            ← Este arquivo
```

---

## ✅ Checklist Final

Depois de completar todos os passos:

- [ ] Node.js 16+ instalado
- [ ] npm install completado
- [ ] npm run setup executado com sucesso
- [ ] npm start rodando (sem erros)
- [ ] Dashboard acessível em http://localhost:3000/dashboard.html
- [ ] KPIs carregando (4 cards com valores)
- [ ] Abas funcionando (Dashboard, Receitas, etc.)
- [ ] Filtros respondendo
- [ ] Dados de 70+ cobranças visíveis

**SE TUDO ESTÁ FUNCIONANDO: 🎉 SUCESSO!**

---

**Última atualização:** 2026-05-05
**Portal Financeiro v1.0 • GPSX Design • Multi-Gateway**

