const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = "Madhuram Motors";
// Same letterhead logo as salesExport.service.js.
const LOGO_PATH = path.join(__dirname, "../assets/logo.jpg");

const formatAmount = (value) => Number(value || 0).toFixed(2);
const formatDate = (value) => (value ? dayjs(value).format("DD-MM-YYYY") : "");
const bankWithAccount = (bank) => `${bank.bankName}${bank.accountNumber ? ` (${String(bank.accountNumber).slice(-4)})` : ""}`;
// Manual entries carry their own bankAccount; Sale/Customer Ledger synced Income rows carry a
// read-only bankPayments split instead (see income.controller.js#attachBankPayments).
const bankLabel = (row) => {
  if (row.bankAccount) return bankWithAccount(row.bankAccount);
  if (row.bankPayments?.length) {
    return row.bankPayments.map((p) => `${bankWithAccount(p)}: ${formatAmount(p.amount)}`).join(", ");
  }
  return row.bankName || "";
};

// Single source of truth for export columns — shared by both generators so the Excel and PDF
// files never drift apart. Each `get` reads the raw AccountEntry row (Income/Expense share the
// customerName/customerPhone/productName columns — see expense.controller.js#serializeExpense).
const INCOME_EXPORT_COLUMNS = [
  { key: "entryDate", header: "Date", width: 13, pdfWidth: 60, get: (r) => formatDate(r.entryDate) },
  { key: "customerName", header: "Customer Name", width: 22, pdfWidth: 95, get: (r) => r.customerName || "" },
  { key: "customerPhone", header: "Mobile No.", width: 14, pdfWidth: 65, get: (r) => r.customerPhone || "" },
  { key: "productName", header: "Products", width: 32, pdfWidth: 150, get: (r) => r.productName || "" },
  { key: "category", header: "Category", width: 14, pdfWidth: 60, get: (r) => r.category || "" },
  { key: "paymentMethod", header: "Payment Method", width: 15, pdfWidth: 60, get: (r) => r.paymentMethod || "" },
  { key: "bank", header: "Bank", width: 22, pdfWidth: 85, get: bankLabel },
  { key: "status", header: "Status", width: 12, pdfWidth: 55, get: (r) => r.status || "" },
  { key: "creator", header: "Created By", width: 16, pdfWidth: 70, get: (r) => r.creator?.name || "" },
  { key: "amount", header: "Amount", width: 14, pdfWidth: 60, isAmount: true, get: (r) => formatAmount(r.amount) },
];

const EXPENSE_EXPORT_COLUMNS = [
  { key: "entryDate", header: "Date", width: 13, pdfWidth: 60, get: (r) => formatDate(r.entryDate) },
  { key: "name", header: "Name", width: 22, pdfWidth: 95, get: (r) => r.customerName || "" },
  { key: "mobile", header: "Mobile No.", width: 14, pdfWidth: 65, get: (r) => r.customerPhone || "" },
  { key: "product", header: "Product", width: 24, pdfWidth: 100, get: (r) => r.productName || "" },
  { key: "description", header: "Notes", width: 28, pdfWidth: 110, get: (r) => r.description || "" },
  { key: "paymentMethod", header: "Payment Method", width: 15, pdfWidth: 60, get: (r) => r.paymentMethod || "" },
  { key: "bank", header: "Bank", width: 22, pdfWidth: 85, get: bankLabel },
  { key: "status", header: "Status", width: 12, pdfWidth: 55, get: (r) => r.status || "" },
  { key: "creator", header: "Created By", width: 16, pdfWidth: 70, get: (r) => r.creator?.name || "" },
  { key: "amount", header: "Amount", width: 14, pdfWidth: 60, isAmount: true, get: (r) => formatAmount(r.amount) },
];

// Human-readable summary of the filters applied, printed under the report title so the reader
// knows the file is a filtered subset rather than the whole ledger.
const describeFilters = (filters = {}) => {
  const parts = [];
  if (filters.startDate || filters.endDate) {
    parts.push(`Date: ${filters.startDate ? formatDate(filters.startDate) : "Start"} to ${filters.endDate ? formatDate(filters.endDate) : "Today"}`);
  }
  if (filters.paymentMethod) parts.push(`Payment Method: ${filters.paymentMethod}`);
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.search && String(filters.search).trim()) parts.push(`Search: "${String(filters.search).trim()}"`);
  return parts.length ? `Filters — ${parts.join(" | ")}` : "Filters — None (all records)";
};

const sumAmount = (rows) => rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

async function generateAccountExcel({ title, filePrefix, columns, rows, filters }, res) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title);
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const lastColLetter = sheet.getColumn(columns.length).letter;

  // Header band mirrors salesExport.service.js: logo in merged A1:A3, text in B1..B3.
  sheet.getColumn(1).width = Math.max(columns[0].width, 13);
  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 16;

  sheet.mergeCells(`A1:${lastColLetter}1`);
  const nameCell = sheet.getCell("A1");
  nameCell.value = COMPANY_NAME;
  nameCell.font = { bold: true, size: 16 };
  nameCell.alignment = { vertical: "bottom", horizontal: "left", indent: fs.existsSync(LOGO_PATH) ? 6 : 0 };

  sheet.mergeCells(`A2:${lastColLetter}2`);
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = `${title} Report — Generated on ${dayjs().format("DD-MM-YYYY, hh:mm A")}`;
  subtitleCell.font = { italic: true, size: 10, color: { argb: "FF666666" } };
  subtitleCell.alignment = { vertical: "top", horizontal: "left", indent: fs.existsSync(LOGO_PATH) ? 6 : 0 };

  sheet.mergeCells(`A3:${lastColLetter}3`);
  const filterCell = sheet.getCell("A3");
  filterCell.value = describeFilters(filters);
  filterCell.font = { size: 9, color: { argb: "FF444444" } };
  filterCell.alignment = { vertical: "top", horizontal: "left", indent: fs.existsSync(LOGO_PATH) ? 6 : 0 };

  if (fs.existsSync(LOGO_PATH)) {
    const PX_TO_EMU = 9525;
    const logoSize = 38;
    const imageId = workbook.addImage({ filename: LOGO_PATH, extension: "jpeg" });
    sheet.addImage(imageId, {
      tl: { nativeCol: 0, nativeColOff: 8 * PX_TO_EMU, nativeRow: 0, nativeRowOff: 8 * PX_TO_EMU },
      ext: { width: logoSize, height: logoSize },
      editAs: "oneCell",
    });
  }

  // Row 4 left blank for spacing, row 5 is the column header row
  const headerRow = sheet.getRow(5);
  headerRow.values = columns.map((c) => c.header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEFC" } };
  });

  rows.forEach((row) => {
    // Amount written as a number so Excel can sum/filter it; everything else as display text.
    sheet.addRow(columns.map((c) => (c.isAmount ? Number(row.amount || 0) : c.get(row))));
  });

  const amountIndex = columns.findIndex((c) => c.isAmount);
  if (amountIndex >= 0) {
    sheet.getColumn(amountIndex + 1).numFmt = "#,##0.00";
    const totalValues = columns.map(() => "");
    totalValues[0] = `Total (${rows.length} records)`;
    totalValues[amountIndex] = sumAmount(rows);
    const totalRow = sheet.addRow(totalValues);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filePrefix}-export-${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function generateAccountPdf({ title, filePrefix, columns, rows, filters }, res) {
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: 30 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filePrefix}-export-${Date.now()}.pdf"`);
  doc.pipe(res);

  const pdfColumns = columns.filter((c) => c.pdfWidth);
  const startX = doc.page.margins.left;
  const rowHeight = 18;
  let y;

  const drawCompanyHeader = () => {
    const logoWidth = 40;
    const headerTop = doc.page.margins.top;
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, startX, headerTop, { width: logoWidth, height: logoWidth });
    }
    const textX = startX + logoWidth + 12;
    doc.font("Helvetica-Bold").fontSize(18).fillColor("black").text(COMPANY_NAME, textX, headerTop + 2);
    doc.font("Helvetica").fontSize(9).fillColor("#666666")
      .text(`${title} Report — Generated on ${dayjs().format("DD-MM-YYYY, hh:mm A")}`, textX, headerTop + 24);
    doc.text(describeFilters(filters), textX, headerTop + 36);
    doc.fillColor("black");
    y = headerTop + logoWidth + 22;
    doc.moveTo(startX, y - 8).lineTo(doc.page.width - doc.page.margins.right, y - 8).strokeColor("#cccccc").stroke();
  };

  const drawColumnHeader = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(8);
    pdfColumns.forEach((col) => {
      doc.text(col.header, x, y, { width: col.pdfWidth, ellipsis: true, align: col.isAmount ? "right" : "left" });
      x += col.pdfWidth;
    });
    y += rowHeight;
    doc.moveTo(startX, y - 4).lineTo(x, y - 4).strokeColor("#cccccc").stroke();
    doc.font("Helvetica").fontSize(8).fillColor("black");
  };

  const ensureRoom = () => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ layout: "landscape", size: "A4", margin: 30 });
      y = doc.page.margins.top;
      drawColumnHeader();
    }
  };

  drawCompanyHeader();
  drawColumnHeader();

  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(10).text(`No ${title.toLowerCase()} records found for the selected filters.`, startX, y + 10);
  }

  rows.forEach((row) => {
    ensureRoom();
    let x = startX;
    pdfColumns.forEach((col) => {
      doc.text(String(col.get(row) ?? ""), x, y, {
        width: col.pdfWidth,
        height: rowHeight,
        ellipsis: true,
        align: col.isAmount ? "right" : "left",
      });
      x += col.pdfWidth;
    });
    y += rowHeight;
  });

  if (rows.length > 0) {
    ensureRoom();
    const tableWidth = pdfColumns.reduce((w, c) => w + c.pdfWidth, 0);
    doc.moveTo(startX, y - 4).lineTo(startX + tableWidth, y - 4).strokeColor("#cccccc").stroke();
    const amountCol = pdfColumns.find((c) => c.isAmount);
    const amountWidth = amountCol ? amountCol.pdfWidth : 80;
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text(`Total (${rows.length} records)`, startX, y, { width: tableWidth - amountWidth });
    doc.text(formatAmount(sumAmount(rows)), startX + tableWidth - amountWidth, y, { width: amountWidth, align: "right" });
  }

  doc.end();
}

const exportAccountEntries = async (format, options, res) =>
  format === "pdf" ? generateAccountPdf(options, res) : generateAccountExcel(options, res);

module.exports = { exportAccountEntries, INCOME_EXPORT_COLUMNS, EXPENSE_EXPORT_COLUMNS };
