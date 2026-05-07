/**
 * services/pdf-export.js
 * PDF export service for financial reports
 * AC-6: Export to PDF with professional formatting
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate PDF report for DRE
 * Returns readable stream with formatted PDF
 */
function generateDREPdf(dreData, options = {}) {
  const doc = new PDFDocument({
    margin: 50,
    bufferPages: true
  });

  const {
    title = 'DRE Report',
    companyName = 'Empresa',
    reportDate = new Date().toISOString().split('T')[0]
  } = options;

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(10).font('Helvetica').text(companyName, { align: 'center' });
  doc.fontSize(9).text(`Período: ${dreData.period} | Gerado em: ${reportDate}`, { align: 'center' });
  doc.moveDown(0.5);

  // Summary table
  doc.fontSize(12).font('Helvetica-Bold').text('Resumo Executivo', { underline: true });
  doc.moveDown(0.3);

  const summaryTable = [
    ['Receita Bruta', `R$ ${formatCurrency(dreData.receita_bruta)}`],
    ['Taxas', `R$ ${formatCurrency(dreData.taxas)}`],
    ['Receita Líquida', `R$ ${formatCurrency(dreData.receita_liquida)}`],
    ['MRR', `R$ ${formatCurrency(dreData.mrr)}`],
    ['Churn Rate', `${dreData.churn_rate}%`]
  ];

  drawTable(doc, summaryTable, [200, 150]);
  doc.moveDown(1);

  // Details section
  doc.fontSize(12).font('Helvetica-Bold').text('Detalhes', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Período: ${dreData.period}`);
  doc.text(`Receita Bruta: R$ ${formatCurrency(dreData.receita_bruta)}`);
  doc.text(`Taxa (4%): R$ ${formatCurrency(dreData.taxas)}`);
  doc.text(`Receita Líquida: R$ ${formatCurrency(dreData.receita_liquida)}`);
  doc.text(`MRR: R$ ${formatCurrency(dreData.mrr)}`);
  doc.text(`Churn Rate: ${dreData.churn_rate}%`);

  // Footer
  doc.moveTo(50, doc.page.height - 50)
    .lineTo(doc.page.width - 50, doc.page.height - 50)
    .stroke();

  doc.fontSize(8).text(
    `${title} | Confidencial | ${reportDate}`,
    50,
    doc.page.height - 40,
    { align: 'center' }
  );

  return doc;
}

/**
 * Generate PDF for Cash Flow report
 */
function generateCashFlowPdf(cashFlowData, options = {}) {
  const doc = new PDFDocument({ margin: 50 });

  const { title = 'Cash Flow Report', companyName = 'Empresa' } = options;

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(10).text(companyName, { align: 'center' });
  doc.moveDown(0.5);

  // Summary
  const { summary } = cashFlowData;
  doc.fontSize(12).font('Helvetica-Bold').text('Resumo do Período', { underline: true });
  doc.moveDown(0.3);

  const summaryTable = [
    ['Total Inflows', `R$ ${formatCurrency(summary.total_inflows)}`],
    ['Total Outflows', `R$ ${formatCurrency(summary.total_outflows)}`],
    ['Net Cash', `R$ ${formatCurrency(summary.net_cash)}`],
    ['Days', `${summary.days_count}`]
  ];

  drawTable(doc, summaryTable, [200, 150]);
  doc.moveDown(1);

  // Payment Method breakdown
  doc.fontSize(12).font('Helvetica-Bold').text('Por Método de Pagamento', { underline: true });
  doc.moveDown(0.3);

  const methodHeaders = ['Método', 'Inflows', 'Outflows', '%'];
  const methodRows = cashFlowData.payment_method_breakdown.map(m => [
    m.payment_method,
    `R$ ${formatCurrency(m.total_inflows)}`,
    `R$ ${formatCurrency(m.total_outflows)}`,
    `${m.percentage_of_total}%`
  ]);

  drawTable(doc, [methodHeaders, ...methodRows], [100, 100, 100, 100]);

  return doc;
}

/**
 * Generate PDF for Payment Status report
 */
function generatePaymentStatusPdf(statusData, options = {}) {
  const doc = new PDFDocument({ margin: 50 });

  const { title = 'Payment Status Report', companyName = 'Empresa' } = options;

  doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(10).text(companyName, { align: 'center' });
  doc.moveDown(0.5);

  // Summary
  const { summary } = statusData;
  doc.fontSize(12).font('Helvetica-Bold').text('Resumo de Pagamentos', { underline: true });
  doc.moveDown(0.3);

  const summaryTable = [
    ['Em dia', `${summary.pagamentos_em_dia} (${summary.pagamentos_em_dia_pct}%)`],
    ['Pendentes', summary.pagamentos_pendentes],
    ['Atrasados', summary.pagamentos_atrasados],
    ['Valor Pendente', `R$ ${formatCurrency(summary.total_pendente_valor)}`],
    ['Valor Atrasado', `R$ ${formatCurrency(summary.total_atrasado_valor)}`]
  ];

  drawTable(doc, summaryTable, [200, 150]);
  doc.moveDown(1);

  // Aging analysis
  doc.fontSize(12).font('Helvetica-Bold').text('Análise de Vencimento', { underline: true });
  doc.moveDown(0.3);

  const agingHeaders = ['Faixa', 'Quantidade', 'Valor', '%'];
  const agingRows = Object.entries(statusData.aging_analysis).map(([bucket, data]) => [
    bucket,
    data.count,
    `R$ ${formatCurrency(data.amount)}`,
    `${data.percentage}%`
  ]);

  drawTable(doc, [agingHeaders, ...agingRows], [100, 100, 100, 100]);

  return doc;
}

/**
 * Draw a formatted table in PDF
 */
function drawTable(doc, rows, columnWidths) {
  const rowHeight = 20;
  const cellPadding = 5;

  let yPosition = doc.y;

  rows.forEach((row, rowIndex) => {
    let xPosition = doc.page.margins.left;

    row.forEach((cell, colIndex) => {
      const width = columnWidths[colIndex];

      // Draw cell border
      doc.rect(xPosition, yPosition, width, rowHeight).stroke();

      // Draw cell text
      doc.fontSize(rowIndex === 0 ? 10 : 9)
        .font(rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(cell), xPosition + cellPadding, yPosition + cellPadding, {
          width: width - cellPadding * 2,
          height: rowHeight - cellPadding * 2,
          align: colIndex === 0 ? 'left' : 'right'
        });

      xPosition += width;
    });

    yPosition += rowHeight;
  });

  doc.y = yPosition + 10;
}

/**
 * Save PDF to file
 */
function savePdfToFile(pdfDoc, filepath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filepath);

    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    writeStream.on('finish', () => resolve(filepath));
    writeStream.on('error', reject);
  });
}

/**
 * Generate PDF and return as buffer
 */
function generatePdfBuffer(pdfDoc) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    pdfDoc.on('data', chunk => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);

    pdfDoc.end();
  });
}

// Utility functions

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

module.exports = {
  generateDREPdf,
  generateCashFlowPdf,
  generatePaymentStatusPdf,
  savePdfToFile,
  generatePdfBuffer
};
