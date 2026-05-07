# 💰 Portal Financeiro - GPSX

Sistema de Conciliação Automática Multi-Gateway com Análise de Auditoria Avançada.

**Suporta:** Cakto, Infinitepay e outras plataformas de pagamento.

## 🚀 Quick Start

### 1. Instalar Dependências
```bash
npm install
```

### 2. Setup Inicial
```bash
npm run setup
```

Isso irá:
- ✅ Criar banco de dados SQLite
- ✅ Criar tabelas necessárias
- ✅ Importar dados do CSV (orders_report.csv)
- ✅ Exibir estatísticas de importação

### 3. Iniciar Servidor
```bash
npm start
```

Servidor rodando em: `http://localhost:3000`

### 4. Abrir Dashboard
Acesse: `http://localhost:3000/dashboard.html`

---

## 📊 Funcionalidades

### 6 Abas Principais

1. **📊 Dashboard**
   - 4 KPIs em tempo real (Esperado, Recebido, Discrepância, Taxa %)
   - Últimas 10 cobranças com detalhes expansíveis
   - Health Score do sistema

2. **💵 Receitas**
   - Análise completa de cobranças
   - Filtros por gateway e método
   - Ticket médio, valores brutos e líquidos

3. **📈 Previsibilidade**
   - Análise de 30 dias de histórico
   - Estatísticas de receita diária
   - Projeções e tendências

4. **🔗 Conciliação**
   - Status de todas as cobranças
   - Identificação de não-conciliadas
   - Resumo de pendências

5. **🔍 Auditoria**
   - Análise por método de pagamento
   - Análise por gateway
   - Análise por produto
   - Resumo de taxas

6. **📋 Evidências**
   - Lista completa de cobranças (charges)
   - Lista completa de saques (withdrawals)
   - Rastreamento de transações

---

## 📁 Estrutura de Pastas

```
funil-gps/
├── backend/
│   ├── src/
│   │   └── server.js          # API REST principal
│   ├── scripts/
│   │   ├── import-csv.js      # Importer do CSV
│   │   ├── import-cakto-test-data.js
│   │   └── import-cakto-manual.js
│   └── .data/
│       └── cakto.db           # Database SQLite
├── dashboard.html             # Frontend principal (GPSX design)
├── orders_report.csv          # Dados de entrada
├── setup.js                   # Script de inicialização
├── package.json
└── README.md
```

---

## 🗄️ Banco de Dados

### Tabelas

#### `customers`
```sql
- id (PRIMARY KEY)
- email (UNIQUE)
- name
- phone
- document
- total_spent (REAL)
- created_at (TIMESTAMP)
```

#### `charges`
```sql
- id (PRIMARY KEY)
- customer_id (FK → customers)
- gateway (ENUM: infinitepay, cakto)
- external_id (UNIQUE)
- product_name
- amount (REAL)
- fee (REAL)
- method
- status (ENUM: paid, open, pending)
- created_at
- paid_at
```

#### `saques`
```sql
- id (PRIMARY KEY, AUTO INCREMENT)
- cakto_id (UNIQUE)
- data
- amount (REAL)
- taxa (REAL)
- status (ENUM: APROVADO, PENDENTE)
- tipo
- descricao
- created_at (TIMESTAMP)
```

---

## 🔌 API REST

### GET `/health`
Status do servidor

### GET `/api/dashboard`
KPIs em tempo real
```json
{
  "kpis": {
    "expectedAmount": 95512.00,
    "receivedAmount": 67610.00,
    "discrepancyAmount": 27902.00,
    "reconciliationRatio": 70.76,
    "totalCustomers": 76,
    "healthScore": 70.76
  }
}
```

### GET `/api/charges`
Lista todas as cobranças

### GET `/api/saques`
Lista todos os saques/withdrawals

### GET `/api/reconciliation`
Análise de conciliação
```json
{
  "matched": 45,
  "pending": 20,
  "unmatched": 11,
  "data": [...]
}
```

### GET `/api/forecast`
Previsibilidade de receitas (30 dias)

### GET `/api/customers`
Análise por cliente

### GET `/api/audit`
Dados de auditoria avançada

---

## 📝 Arquivo CSV

Formato esperado: `orders_report.csv`

Colunas necessárias:
- `Email do Cliente`
- `Nome do Cliente`
- `Telefone do Cliente`
- `Número do Documento do Cliente`
- `Valor Pago pelo Cliente`
- `Taxas`
- `Método de Pagamento`
- `Status da Venda`
- `Produto`
- `Data da Venda`
- `Data de Pagamento`
- `ID da Venda`

---

## 🎨 Design

**Esquema de Cores GPSX:**
- 🖤 Preto: Headers e elementos principais
- ⚪ Branco: Fundo e cards
- 🔴 Vermelho/Orange: Alertas e destaques (#ff4500)
- ✅ Verde: Status positivos (#2ecc71)
- 🔵 Azul: Status neutros (#3498db)

---

## 🛠️ Scripts Adicionais

### Importar CSV
```bash
npm run import:csv
```
Importa dados do arquivo `backend/data/orders_report.csv`

### Importar Dados de Teste Cakto
```bash
npm run import:cakto:test
```
Insere dados de teste para validação

### Importar Dados Manuais Cakto
```bash
npm run import:cakto:manual
```
Permite inserir dados manualmente do dashboard Cakto

---

## 🔄 Fluxo de Sincronização

1. **CSV Input** → `orders_report.csv`
2. **Import** → Banco de dados SQLite
3. **Processing** → Normalização e reconciliação
4. **API** → REST endpoints
5. **Frontend** → Dashboard interativo
6. **Output** → Relatórios e análises

---

## 📊 Métricas Principais

- **Taxa de Conciliação**: % de cobranças sincronizadas
- **Discrepância**: Valor não sincronizado
- **Health Score**: Score de saúde do sistema (0-100)
- **Ticket Médio**: Valor médio por cobrança
- **MRR**: Monthly Recurring Revenue (se aplicável)

---

## 🐛 Troubleshooting

### Erro: "SQLITE_CANTOPEN"
```bash
# Criar diretório de dados
mkdir -p .data
npm run setup
```

### Erro: "orders_report.csv not found"
```bash
# Certifique-se que o arquivo está no diretório raiz
ls orders_report.csv
npm run setup
```

### Port 3000 em uso
```bash
PORT=3001 npm start
# Então acesse: http://localhost:3001/dashboard.html
```

---

## 📞 Suporte

Para questões sobre discrepâncias e reconciliação:
- Verifique a aba "Auditoria" para análise detalhada
- Consulte "Evidências" para rastreamento de transações
- Analise a "Conciliação" para status de sincronização

---

## 📄 Licença

Proprietary • GPSX • 2026

---

**Última atualização:** 2026-05-05
