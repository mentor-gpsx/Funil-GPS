# Export Formats Documentation

**Version:** 1.0  
**Last Updated:** 2026-05-07

## Overview

Financial reports can be exported in three formats:
- PDF (Professional reports with formatting)
- CSV (Data analysis and spreadsheet import)
- Excel (Advanced analysis with formulas and formatting)

All exports include:
- Timestamps and metadata
- Tenant isolation (single-tenant data only)
- Data integrity checks
- Unique filenames with version identifiers

---

## PDF Export

### Format Specification

**Library:** pdfkit  
**MIME Type:** `application/pdf`  
**File Extension:** `.pdf`

### PDF Structure

#### Document Metadata
```
Title: Financial Report - [Month/Quarter/Year]
Subject: DRE | Cash Flow | Payment Status | Metrics
Author: GPS.X Financial System
CreationDate: [timestamp]
```

#### Header Section
```
═══════════════════════════════════════════
    GPS.X FINANCIAL REPORTS
    [Report Type]
═══════════════════════════════════════════
Generated: [Date & Time]
Period: [Month/Quarter/Year]
Tenant: [Company Name]
Report ID: [report-2026-05-001]
```

#### Content Sections

**1. DRE Report**
```
DEMONSTRAÇÃO DE RESULTADO DO EXERCÍCIO (DRE)
Período: Maio/2026

┌─────────────────────────────────┬──────────────┐
│ Receita Bruta                   │   R$ 150.000 │
│ (-) Taxas e Comissões          │   (R$ 6.000) │
├─────────────────────────────────┼──────────────┤
│ Receita Líquida                 │   R$ 144.000 │
├─────────────────────────────────┼──────────────┤
│ MRR (Receita Recorrente)        │   R$ 45.000  │
│ Churn Rate                      │   2,50%      │
│ Período Anterior (Abr/2026)     │   R$ 140.000 │
│ Variação                        │   +7,14%     │
└─────────────────────────────────┴──────────────┘
```

**2. Cash Flow Report**
```
FLUXO DE CAIXA
Período: 01/05/2026 - 31/05/2026

Resumo Executivo:
┌──────────────────────────────────┬──────────────┐
│ Entradas Totais                  │   R$ 250.000 │
│ Saídas Totais                    │   (R$ 50.000)│
├──────────────────────────────────┼──────────────┤
│ Caixa Líquido                    │   R$ 200.000 │
│ Saldo Inicial                    │   R$ 100.000 │
│ Saldo Final                      │   R$ 300.000 │
└──────────────────────────────────┴──────────────┘

Fluxo Diário (amostra):
┌────────────┬─────────────┬──────────────┬────────────┐
│ Data       │ Entradas    │ Saídas       │ Saldo      │
├────────────┼─────────────┼──────────────┼────────────┤
│ 01/05/2026 │ R$ 10.000   │ (R$ 2.000)   │ R$ 108.000 │
│ 02/05/2026 │ R$ 15.000   │ (R$ 1.500)   │ R$ 121.500 │
│ 03/05/2026 │ R$ 8.000    │ (R$ 500)     │ R$ 129.000 │
└────────────┴─────────────┴──────────────┴────────────┘

Distribuição por Método de Pagamento:
  PIX (60%):         R$ 150.000
  Boleto (30%):      R$ 75.000
  Cartão (10%):      R$ 25.000
```

**3. Metrics Report**
```
MÉTRICAS DE RECEITA RECORRENTE
Período: Maio/2026

┌──────────────────────────────────┬──────────────┐
│ MRR (Receita Recorrente Mensal)  │   R$ 45.000  │
│   Subscriptions Ativas           │   150        │
│   Variação vs Mês Anterior       │   +5,88%     │
├──────────────────────────────────┼──────────────┤
│ ARR (Receita Anual)              │  R$ 540.000  │
├──────────────────────────────────┼──────────────┤
│ Churn Rate                       │   2,50%      │
│   Status                         │   Saudável   │
│   Subscriptions Canceladas       │   4          │
├──────────────────────────────────┼──────────────┤
│ LTV (Valor da Vida Útil)         │   R$ 6.000   │
│   Com Margem (60%)               │   R$ 3.600   │
├──────────────────────────────────┼──────────────┤
│ CAC (Custo de Aquisição)         │   R$ 250     │
│   Período de Payback             │   1,5 mês    │
│   Razão LTV:CAC                  │   24:1       │
│   Status                         │   Excelente  │
└──────────────────────────────────┴──────────────┘

Análise por Cohort:
┌──────────┬──────┬──────────┬──────────────┐
│ Cohort   │ Size │ Ret. M2  │ Revenue      │
├──────────┼──────┼──────────┼──────────────┤
│ Mar/2026 │ 50   │ 90,0%    │ R$ 15.000    │
│ Abr/2026 │ 45   │ 88,0%    │ R$ 13.500    │
│ Mai/2026 │ 55   │ —        │ R$ 16.500    │
└──────────┴──────┴──────────┴──────────────┘
```

### Formatting Rules

**Colors:**
- Good metrics (> target): Green (#00AA00)
- Warning metrics (80-100% of target): Orange (#FFAA00)
- Bad metrics (< 80% of target): Red (#AA0000)
- Neutral values: Black (#000000)

**Fonts:**
- Title: 24pt, Bold, Primary Color
- Section Headers: 14pt, Bold
- Table Headers: 11pt, Bold, White on Gray background
- Table Data: 10pt, Regular
- Footer: 8pt, Gray (page numbers, date)

**Layout:**
- Page size: A4 (210x297mm)
- Margins: 20mm top/bottom, 15mm left/right
- Line spacing: 1.5
- Table borders: 0.5pt, Gray (#CCCCCC)
- Maximum 30 rows per page (multi-page support)

### Filename Format

```
financial_report_{type}_{period}_{timestamp}.pdf

Examples:
- financial_report_dre_2026-05_20260507_143000.pdf
- financial_report_cashflow_2026-Q2_20260507_143000.pdf
- financial_report_metrics_2026_20260507_143000.pdf
```

### Example PDF Output

See `examples/report-dre-may-2026.pdf` (sample output)

---

## CSV Export

### Format Specification

**MIME Type:** `text/csv`  
**Encoding:** UTF-8 with BOM (for Excel compatibility)  
**File Extension:** `.csv`

### CSV Structure

#### DRE Export

```csv
Period,Receita Bruta,Taxas,Receita Liquida,MRR,Churn Rate %
2026-05,"150000.00","6000.00","144000.00","45000.00","2.50"
2026-04,"140000.00","5600.00","134400.00","42500.00","3.00"
2026-03,"130000.00","5200.00","124800.00","40000.00","2.80"
```

#### Cash Flow Export

```csv
Date,Inflows,Outflows,Net Cash,Balance,PIX %,Boleto %,CC %
2026-05-01,"10000.00","2000.00","8000.00","108000.00","60%","30%","10%"
2026-05-02,"15000.00","1500.00","13500.00","121500.00","60%","30%","10%"
2026-05-03,"8000.00","500.00","7500.00","129000.00","60%","30%","10%"
```

#### Metrics Export

```csv
Date,MRR,ARR,Churn Rate %,LTV,CAC,LTV CAC Ratio,Active Subs
2026-05,"45000.00","540000.00","2.50","6000.00","250.00","24.00","150"
2026-04,"42500.00","510000.00","3.00","5700.00","240.00","23.75","145"
2026-03,"40000.00","480000.00","2.80","5400.00","230.00","23.48","140"
```

### CSV Escaping Rules

**Quoted Fields:**
- Values containing commas: `"value with, comma"`
- Values containing quotes: `"quote: ""example"""`
- Values containing newlines: `"multi-
line
value"`

**Examples:**
```csv
Customer,"Silva, João","Description of ""special"" product"
Date,2026-05-01,"Comment:
First line
Second line"
```

### Filename Format

```
financial_data_{type}_{period}_{timestamp}.csv

Examples:
- financial_data_dre_2026-05_20260507_143000.csv
- financial_data_cashflow_2026_Q2_20260507_143000.csv
- financial_data_metrics_2026_20260507_143000.csv
```

---

## Excel Export

### Format Specification

**Library:** xlsx  
**MIME Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
**File Extension:** `.xlsx`

### Workbook Structure

**Multiple sheets in single file:**

#### Sheet 1: DRE
```
Column A: Period
Column B: Receita Bruta
Column C: Taxas
Column D: Receita Liquida
Column E: MRR
Column F: Churn Rate
```

**Data:**
```
Period           | Receita Bruta | Taxas     | Receita Líquida | MRR      | Churn Rate
2026-05          | 150000        | 6000      | 144000         | 45000    | 2.50%
2026-04          | 140000        | 5600      | 134400         | 42500    | 3.00%
2026-03          | 130000        | 5200      | 124800         | 40000    | 2.80%
```

#### Sheet 2: Cash Flow
```
Column A: Date
Column B: Inflows
Column C: Outflows
Column D: Net Cash
Column E: Balance
```

**Data with conditional formatting:**
```
Date       | Inflows  | Outflows | Net Cash | Balance | Status
2026-05-01 | 10000    | 2000     | 8000     | 108000  | ✓ Good
2026-05-02 | 15000    | 1500     | 13500    | 121500  | ✓ Good
2026-05-03 | 8000     | 500      | 7500     | 129000  | ✓ Good
```

#### Sheet 3: Metrics
```
Column A: Date
Column B: MRR
Column C: ARR (=B×12)
Column D: Churn Rate
Column E: LTV
Column F: CAC
Column G: LTV:CAC Ratio (=E/F)
```

**Example with formulas:**
```
Date     | MRR    | ARR        | Churn  | LTV    | CAC   | LTV:CAC
2026-05  | 45000  | =B2*12     | 2.50%  | 6000   | 250   | =E2/F2
         |        | 540000     |        |        |       | 24.00
```

#### Sheet 4: Payment Analysis
```
Column A: Method
Column B: Count
Column C: Amount
Column D: Percentage
Column E: Status
```

**Data:**
```
Method | Count | Amount  | %    | Status
PIX    | 450   | 150000  | 60%  | ✓ Primary
Boleto | 75    | 75000   | 30%  | ✓ Secondary
CC     | 25    | 25000   | 10%  | ⚠ Low volume
```

#### Sheet 5: Summary
```
High-level metrics and key insights:
- Executive summary box
- Year-to-date metrics
- Top risks
- Recommended actions
```

### Formatting

**Header Row:**
- Background: Dark Blue (#0066CC)
- Font: White, Bold, 11pt
- Alignment: Center, Middle

**Data Cells:**
- Font: 10pt, Regular
- Alignment: Right-aligned for numbers, Left for text
- Number format: #,##0.00 (currency)
- Percentage format: 0.00%

**Conditional Formatting:**
- Good (>= target): Green background (#C6EFCE), Green text (#006100)
- Warning (80-100% of target): Orange background (#FFEB9C), Orange text (#9C6500)
- Bad (< 80% of target): Red background (#FFC7CE), Red text (#9C0006)

**Column Widths:**
- Period/Date: 15
- Currency values: 15
- Percentages: 12
- Text: Auto-fit (minimum 20)

### Formulas

**ARR Calculation:**
```excel
=MRR*12
Sheet3!C2 = Sheet3!B2*12
```

**LTV:CAC Ratio:**
```excel
=LTV/CAC
Sheet3!G2 = Sheet3!E2/Sheet3!F2
```

**Year-to-Date Sum:**
```excel
=SUMIF(Range, Criteria, SumRange)
=SUMIF(A:A,">=2026-01-01",B:B)
```

**Growth Percentage:**
```excel
=(Current-Previous)/Previous*100
=(B2-B3)/B3*100
```

### Filename Format

```
financial_analysis_{period}_{timestamp}.xlsx

Examples:
- financial_analysis_2026-05_20260507_143000.xlsx
- financial_analysis_2026-Q2_20260507_143000.xlsx
- financial_analysis_2026_20260507_143000.xlsx
```

---

## Common Export Features

### Data Validation

**All exports include:**
- No sensitive data (passwords, API keys, secrets)
- Required fields validation
- Data type correctness
- Currency formatting consistency
- Date format standardization (YYYY-MM-DD)

**Checks performed:**
```javascript
const validation = {
  no_secrets: !content.match(/(password|api_key|secret|token)/i),
  required_fields: requiredFields.every(f => data[f] !== null),
  currency_format: amounts.every(a => typeof a === 'number'),
  dates_iso: dates.every(d => /^\d{4}-\d{2}-\d{2}/.test(d))
};
```

### File Management

**Naming Convention:**
```
{type}_{report_type}_{period}_{timestamp}_{tenant_id}.{ext}

Components:
- type: financial_report (PDF) | financial_data (CSV) | financial_analysis (XLSX)
- report_type: dre | cashflow | metrics | payment_status
- period: 2026-05 (monthly) | 2026-Q2 (quarterly) | 2026 (annual)
- timestamp: YYYYMMDD_HHMMSS (UTC)
- ext: pdf | csv | xlsx
```

**Example Sequence:**
```
financial_report_dre_2026-05_20260507_143000_tenant-xyz.pdf
financial_data_cashflow_2026-05_20260507_143010_tenant-xyz.csv
financial_analysis_metrics_2026-05_20260507_143020_tenant-xyz.xlsx
```

### Performance Targets

| Format | Data Size | Target Time |
|--------|-----------|---|
| PDF | < 5MB | < 2 seconds |
| CSV | < 1MB | < 1 second |
| Excel | < 10MB | < 3 seconds |

### Error Handling

**Export Failure Responses:**

```json
{
  "status": "error",
  "error": "Failed to generate PDF",
  "details": "Insufficient data for selected period",
  "timestamp": "2026-05-07T14:30:00Z"
}
```

**Fallback Behavior:**
1. Try primary format
2. If fails, return alternative format (CSV)
3. If all fail, return cached version (< 24h old)
4. If no cache, return error with suggestion to retry

---

## Integration Examples

### Export via API

**PDF Export Request:**
```bash
curl -X GET "https://api.example.com/api/reports/dre/export/pdf?period=2026-05" \
  -H "Authorization: Bearer TOKEN" \
  -H "Accept: application/pdf" \
  -o report.pdf
```

**CSV Export Request:**
```bash
curl -X GET "https://api.example.com/api/reports/metrics/export/csv?period=2026-05" \
  -H "Authorization: Bearer TOKEN" \
  -H "Accept: text/csv" \
  -o metrics.csv
```

**Excel Export Request:**
```bash
curl -X GET "https://api.example.com/api/reports/export/xlsx?period=2026-05&include=dre,cashflow,metrics" \
  -H "Authorization: Bearer TOKEN" \
  -H "Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  -o financial_analysis.xlsx
```

### Scheduled Export

**Email Attachment Example:**

```
Subject: Daily DRE Report - May 7, 2026

Dear CFO,

Attached is your daily DRE report for May 7, 2026.

Key Metrics:
- Receita Bruta: R$ 150,000
- Receita Líquida: R$ 144,000
- MRR: R$ 45,000
- Churn Rate: 2.50%

Attachments:
- financial_report_dre_2026-05-07_daily.pdf
- financial_data_dre_2026-05-07_daily.csv
```

---

## Accessibility

**PDF Accessibility:**
- All text is selectable and searchable
- Tables have proper header markup
- Color not sole indicator of status (includes text labels)
- Fonts minimum 10pt for readability

**CSV Accessibility:**
- Header row clearly identifies columns
- Data in logical order
- Consistent formatting across rows

**Excel Accessibility:**
- Named ranges for key metrics
- Data validation rules
- Comments on complex formulas
- Sheet tabs clearly labeled

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-07 | Initial release - PDF, CSV, Excel support |
| Future | — | Shareable links, Historical archive |

