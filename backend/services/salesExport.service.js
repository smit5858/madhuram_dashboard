const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = "Madhuram Motors";
// Central place for the export letterhead logo — swap this file (or point elsewhere) to
// change branding without touching the generators below.
const LOGO_PATH = path.join(__dirname, "../assets/logo.jpg");

// Single source of truth for export columns — shared by both generators so the two
// files never drift apart.
const SALES_EXPORT_COLUMNS = [
  { key: "invoiceNumber", header: "Invoice #", width: 16, pdfWidth: 65, get: (s) => s.invoiceNumber || `SELL-#${s.id}` },
  { key: "customerName", header: "Customer Name", width: 20, pdfWidth: 80, get: (s) => s.customerName || "" },
  { key: "customerNumber", header: "Mobile No.", width: 14, pdfWidth: 65, get: (s) => s.customerNumber || "" },
  {
    key: "products",
    header: "Products",
    width: 30,
    pdfWidth: 110,
    get: (s) => (s.items || []).map((i) => `${i.Product?.name || i.productName || `Product #${i.productId}`} x${i.quantity}`).join(", "),
  },
  { key: "platform", header: "Platform", width: 14, pdfWidth: 55, get: (s) => s.platform || "" },
  { key: "paymentMethod", header: "Payment Method", width: 16, pdfWidth: 60, get: (s) => s.paymentMethod || "" },
  { key: "city", header: "City", width: 14, pdfWidth: 55, get: (s) => s.city || "" },
  { key: "to", header: "From", width: 16, pdfWidth: 60, get: (s) => s.to || "" },
  { key: "sellingAmount", header: "Selling Amount", width: 15, pdfWidth: 60, get: (s) => Number(s.sellingAmount || 0).toFixed(2) },
  { key: "collectedAmount", header: "Collected Amount", width: 16, pdfWidth: 60, get: (s) => Number(s.collectedAmount || 0).toFixed(2) },
  { key: "pendingAmount", header: "Pending Amount", width: 15, pdfWidth: 60, get: (s) => Number(s.pendingAmount || 0).toFixed(2) },
  { key: "status", header: "Status", width: 14, pdfWidth: 55, get: (s) => s.status || "" },
  { key: "createdAt", header: "Date", width: 14, pdfWidth: 55, get: (s) => (s.createdAt ? dayjs(s.createdAt).format("DD-MM-YYYY") : "") },
];

async function generateSalesExcel(sales, res) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sales Export");
  sheet.columns = SALES_EXPORT_COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  const lastColLetter = sheet.getColumn(SALES_EXPORT_COLUMNS.length).letter;

  // Header band: column A hosts the logo, merged across rows 1-2 so it sits as a single
  // "cell" beside the two lines of company text (name + subtitle) — the closest visual
  // equivalent Excel allows to putting an image and text inside one literal cell.
  sheet.getColumn(1).width = 7.5;
  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 20;
  sheet.mergeCells("A1:A2");

  sheet.mergeCells(`B1:${lastColLetter}1`);
  const nameCell = sheet.getCell("B1");
  nameCell.value = COMPANY_NAME;
  nameCell.font = { bold: true, size: 16 };
  nameCell.alignment = { vertical: "bottom", horizontal: "left", indent: 1 };

  sheet.mergeCells(`B2:${lastColLetter}2`);
  const subtitleCell = sheet.getCell("B2");
  subtitleCell.value = `Sales Export Report — Generated on ${dayjs().format("DD-MM-YYYY, hh:mm A")}`;
  subtitleCell.font = { italic: true, size: 10, color: { argb: "FF666666" } };
  subtitleCell.alignment = { vertical: "top", horizontal: "left", indent: 1 };

  if (fs.existsSync(LOGO_PATH)) {
    // Square, equal width/height so the logo is never stretched or distorted.
    // nativeCol/nativeColOff address the anchor in raw EMU (9525 EMU per px) — ExcelJS's
    // fractional `col`/`row` shorthand instead resolves against the column-width/row-height
    // "unit" scale and writes that number straight through as if it were already EMU, which
    // produces a near-zero real offset. Raw EMU keeps the logo reliably padded and vertically
    // centered inside the merged A1:A2 header cell (24pt + 20pt rows ≈ 59px tall).
    const PX_TO_EMU = 9525;
    const logoSize = 38;
    const imageId = workbook.addImage({ filename: LOGO_PATH, extension: "jpeg" });
    sheet.addImage(imageId, {
      tl: { nativeCol: 0, nativeColOff: 8 * PX_TO_EMU, nativeRow: 0, nativeRowOff: 10 * PX_TO_EMU },
      ext: { width: logoSize, height: logoSize },
      editAs: "oneCell",
    });
  }

  // Row 3 left blank for spacing, row 4 is the column header row
  const headerRow = sheet.getRow(4);
  headerRow.values = SALES_EXPORT_COLUMNS.map((c) => c.header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEFC" } };
  });

  sales.forEach((sale) => {
    sheet.addRow(SALES_EXPORT_COLUMNS.map((c) => c.get(sale)));
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sales-export-${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function generateSalesPdf(sales, res) {
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: 30 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="sales-export-${Date.now()}.pdf"`);
  doc.pipe(res);

  const pdfColumns = SALES_EXPORT_COLUMNS.filter((c) => c.pdfWidth);
  const startX = doc.page.margins.left;
  const rowHeight = 18;
  let y;

  const drawCompanyHeader = () => {
    const logoWidth = 40;
    const headerTop = doc.page.margins.top;
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, startX, headerTop, { width: logoWidth, height: logoWidth });
    }
    doc.font("Helvetica-Bold").fontSize(18).fillColor("black").text(COMPANY_NAME, startX + logoWidth + 12, headerTop + 2);
    doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Sales Export Report", startX + logoWidth + 12, headerTop + 24);
    doc.fillColor("black");
    y = headerTop + logoWidth + 15;
    doc.moveTo(startX, y - 8).lineTo(doc.page.width - doc.page.margins.right, y - 8).strokeColor("#cccccc").stroke();
  };

  const drawColumnHeader = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(8);
    pdfColumns.forEach((col) => {
      doc.text(col.header, x, y, { width: col.pdfWidth, ellipsis: true });
      x += col.pdfWidth;
    });
    y += rowHeight;
    doc.moveTo(startX, y - 4).lineTo(x, y - 4).strokeColor("#cccccc").stroke();
    doc.font("Helvetica").fontSize(8).fillColor("black");
  };

  drawCompanyHeader();
  drawColumnHeader();

  if (sales.length === 0) {
    doc.font("Helvetica").fontSize(10).text("No sales records found for the selected filters.", startX, y + 10);
  }

  sales.forEach((sale) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ layout: "landscape", size: "A4", margin: 30 });
      y = doc.page.margins.top;
      drawColumnHeader();
    }
    let x = startX;
    pdfColumns.forEach((col) => {
      doc.text(String(col.get(sale) ?? ""), x, y, { width: col.pdfWidth, height: rowHeight, ellipsis: true });
      x += col.pdfWidth;
    });
    y += rowHeight;
  });

  doc.end();
}

module.exports = { generateSalesExcel, generateSalesPdf, SALES_EXPORT_COLUMNS };
