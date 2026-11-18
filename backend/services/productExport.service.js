const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = "Madhuram Motors";
const REPORT_TITLE = "Products Report";
// Same letterhead logo as the other *Export.service.js files.
const LOGO_PATH = path.join(__dirname, "../assets/logo.png");

// Kept in sync with frontend shared/enum/product-type.ts#PRODUCT_TYPE_LABELS.
const PRODUCT_TYPE_LABELS = {
  NON_SERIAL: "Non-Serialized",
  SERIALIZED: "Serialized",
  SOFTWARE: "Software",
  HARDWARE_ORDER_BASED: "Order-Based",
};

const AMOUNT_FMT = "#,##0.00";
const INT_FMT = "0";
const DATE_FMT = "dd-mm-yyyy";

const toNumber = (value) => (value === null || value === undefined || value === "" ? null : Number(value));
const toDate = (value) => (value ? dayjs(value).toDate() : null);

/**
 * Single source of truth for export columns — shared by both generators so the Excel and PDF files
 * never drift apart. `get` returns a typed value (number / Date / string / null) so Excel cells keep
 * their real data type; `pdf` turns it into display text. Columns without a pdfWidth are Excel-only
 * (too wide for landscape A4). Rows are the output of product.controller.js#serializeProduct, so
 * a null stock value means "not applicable" (SOFTWARE) and is shown as N/A rather than 0.
 */
const PRODUCT_EXPORT_COLUMNS = [
  { key: "srNo", header: "Sr. No.", width: 8, pdfWidth: 28, numFmt: INT_FMT, get: (r, i) => i + 1 },
  { key: "id", header: "Product ID", width: 11, pdfWidth: 38, numFmt: INT_FMT, get: (r) => r.id },
  { key: "name", header: "Product Name", width: 34, pdfWidth: 150, get: (r) => r.name || "" },
  { key: "description", header: "Description", width: 40, wrap: true, get: (r) => r.description || "" },
  { key: "productType", header: "Type", width: 16, pdfWidth: 66, get: (r) => PRODUCT_TYPE_LABELS[r.productType] || r.productType || "" },
  { key: "status", header: "Status", width: 10, pdfWidth: 44, get: (r) => (r.isActive ? "Active" : "Inactive") },
  { key: "catalog", header: "Catalog", width: 12, get: (r) => (r.isMasterProduct ? "Master" : "Sale-only") },
  { key: "currentStock", header: "Current Stock", width: 13, pdfWidth: 50, numFmt: INT_FMT, align: "right", get: (r) => r.currentStock, na: true },
  { key: "reserved", header: "Reserved", width: 11, pdfWidth: 44, numFmt: INT_FMT, align: "right", get: (r) => r.reserved, na: true },
  { key: "available", header: "Available", width: 11, pdfWidth: 46, numFmt: INT_FMT, align: "right", get: (r) => r.available, na: true },
  // Only SERIALIZED products track a sold count; blank for every other type.
  { key: "sold", header: "Sold", width: 9, pdfWidth: 32, numFmt: INT_FMT, align: "right", get: (r) => (r.productType === "SERIALIZED" ? r.sold ?? 0 : null) },
  { key: "purchasePrice", header: "Purchase Price (Rs.)", width: 18, pdfWidth: 64, numFmt: AMOUNT_FMT, align: "right", get: (r) => toNumber(r.purchasePrice) },
  { key: "sellingPrice", header: "Selling Price (Rs.)", width: 18, pdfWidth: 64, numFmt: AMOUNT_FMT, align: "right", get: (r) => toNumber(r.sellingPrice) },
  { key: "dealer", header: "Dealer", width: 24, pdfWidth: 92, get: (r) => r.dealer?.name || "" },
  { key: "createdAt", header: "Created Date", width: 13, pdfWidth: 56, numFmt: DATE_FMT, get: (r) => toDate(r.createdAt) },
  { key: "updatedAt", header: "Last Updated", width: 13, numFmt: DATE_FMT, get: (r) => toDate(r.updatedAt) },
];

const pdfText = (col, value) => {
  if (value === null || value === undefined || value === "") return col.na ? "N/A" : "-";
  if (value instanceof Date) return dayjs(value).format("DD-MM-YYYY");
  if (typeof value === "number" && col.numFmt === AMOUNT_FMT) {
    return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
};

const summaryLine = (rows) => {
  const active = rows.filter((r) => r.isActive).length;
  return `Total Products: ${rows.length}   |   Active: ${active}   |   Inactive: ${rows.length - active}`;
};

const generatedLine = (generatedAt) => `Exported on ${dayjs(generatedAt).format("DD-MM-YYYY, hh:mm A")}`;

async function generateProductExcel(rows, meta, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  workbook.created = meta.generatedAt;
  const sheet = workbook.addWorksheet("Products");
  const columns = PRODUCT_EXPORT_COLUMNS;
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const lastColLetter = sheet.getColumn(columns.length).letter;
  const hasLogo = fs.existsSync(LOGO_PATH);

  sheet.mergeCells(`A1:${lastColLetter}1`);
  const nameCell = sheet.getCell("A1");
  nameCell.value = `${COMPANY_NAME} — ${REPORT_TITLE}`;
  nameCell.font = { bold: true, size: 16 };
  nameCell.alignment = { vertical: "bottom", horizontal: "left", indent: hasLogo ? 6 : 0 };
  sheet.getRow(1).height = 24;

  [summaryLine(rows), generatedLine(meta.generatedAt)].forEach((line, i) => {
    const rowNum = i + 2;
    sheet.mergeCells(`A${rowNum}:${lastColLetter}${rowNum}`);
    const cell = sheet.getCell(`A${rowNum}`);
    cell.value = line;
    cell.font = { size: 10, color: { argb: "FF555555" }, italic: i === 1 };
    cell.alignment = { vertical: "top", horizontal: "left", indent: hasLogo ? 6 : 0 };
  });

  if (hasLogo) {
    const PX_TO_EMU = 9525;
    const imageId = workbook.addImage({ filename: LOGO_PATH, extension: "png" });
    sheet.addImage(imageId, {
      tl: { nativeCol: 0, nativeColOff: 8 * PX_TO_EMU, nativeRow: 0, nativeRowOff: 8 * PX_TO_EMU },
      ext: { width: 38, height: 38 },
      editAs: "oneCell",
    });
  }

  // Row 4 blank for spacing, row 5 is the column header row (frozen so it stays visible on scroll).
  const HEADER_ROW = 5;
  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.values = columns.map((c) => c.header);
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF1E293B" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEFC" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: columns.length } };

  if (rows.length === 0) {
    sheet.mergeCells(`A${HEADER_ROW + 1}:${lastColLetter}${HEADER_ROW + 1}`);
    const cell = sheet.getCell(`A${HEADER_ROW + 1}`);
    cell.value = "No products found.";
    cell.font = { italic: true, color: { argb: "FF777777" } };
  }

  rows.forEach((row, i) => {
    const added = sheet.addRow(
      columns.map((c) => {
        const value = c.get(row, i);
        // Typed cells stay empty when missing; "N/A" marks stock that doesn't apply (SOFTWARE).
        return value === null || value === undefined ? (c.na ? "N/A" : null) : value;
      })
    );
    added.alignment = { vertical: "top" };
    if (i % 2 === 1) {
      added.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
  });

  columns.forEach((c) => {
    const column = sheet.getColumn(c.key);
    if (c.numFmt) column.numFmt = c.numFmt;
    if (c.align || c.wrap) {
      column.eachCell((cell, rowNumber) => {
        if (rowNumber <= HEADER_ROW) return;
        cell.alignment = { vertical: "top", horizontal: c.align, wrapText: Boolean(c.wrap) };
      });
    }
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${meta.fileBaseName}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function generateProductPdf(rows, meta, res) {
  const PAGE_OPTIONS = { layout: "landscape", size: "A4", margin: 30 };
  // bufferPages lets us stamp "Page X of Y" once the total page count is known.
  const doc = new PDFDocument({ ...PAGE_OPTIONS, bufferPages: true, info: { Title: `${COMPANY_NAME} — ${REPORT_TITLE}`, Author: COMPANY_NAME } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${meta.fileBaseName}.pdf"`);
  doc.pipe(res);

  const pdfColumns = PRODUCT_EXPORT_COLUMNS.filter((c) => c.pdfWidth);
  const tableWidth = pdfColumns.reduce((w, c) => w + c.pdfWidth, 0);
  const startX = doc.page.margins.left;
  const rowHeight = 18;
  // Reserve room at the bottom for the page-number footer.
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 14;
  let y;

  const drawReportHeader = () => {
    const hasLogo = fs.existsSync(LOGO_PATH);
    const logoWidth = hasLogo ? 40 : 0;
    const headerTop = doc.page.margins.top;
    if (hasLogo) doc.image(LOGO_PATH, startX, headerTop, { width: logoWidth, height: logoWidth });
    const textX = startX + (hasLogo ? logoWidth + 12 : 0);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("black").text(COMPANY_NAME, textX, headerTop, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#334155").text(REPORT_TITLE, textX, headerTop + 19, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor("#555555");
    const lines = [summaryLine(rows), generatedLine(meta.generatedAt)];
    lines.forEach((line, i) => doc.text(line, textX, headerTop + 34 + i * 11, { lineBreak: false }));
    doc.fillColor("black");
    y = headerTop + 34 + lines.length * 11 + 14;
    doc.moveTo(startX, y - 8).lineTo(startX + tableWidth, y - 8).strokeColor("#cccccc").stroke();
  };

  const drawColumnHeader = () => {
    doc.rect(startX, y - 4, tableWidth, rowHeight).fill("#E8EEFC");
    doc.fillColor("black");
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(8);
    pdfColumns.forEach((col) => {
      doc.text(col.header, x + 2, y, { width: col.pdfWidth - 4, height: rowHeight, ellipsis: true, lineBreak: false, align: col.align || "left" });
      x += col.pdfWidth;
    });
    y += rowHeight;
    doc.font("Helvetica").fontSize(8).fillColor("black");
  };

  // Repeats the column header at the top of every continuation page.
  const ensureRoom = () => {
    if (y + rowHeight > bottomLimit()) {
      doc.addPage(PAGE_OPTIONS);
      y = doc.page.margins.top;
      drawColumnHeader();
    }
  };

  drawReportHeader();
  drawColumnHeader();

  if (rows.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#777777").text("No products found.", startX + 2, y, { lineBreak: false });
  }

  rows.forEach((row, i) => {
    ensureRoom();
    if (i % 2 === 1) {
      doc.rect(startX, y - 4, tableWidth, rowHeight).fill("#F8FAFC");
      doc.fillColor("black");
    }
    // Inactive products are greyed out so they stand out from the live catalog at a glance.
    doc.fillColor(row.isActive ? "black" : "#888888");
    let x = startX;
    pdfColumns.forEach((col) => {
      doc.text(pdfText(col, col.get(row, i)), x + 2, y, {
        width: col.pdfWidth - 4,
        height: rowHeight,
        ellipsis: true,
        lineBreak: false,
        align: col.align || "left",
      });
      x += col.pdfWidth;
    });
    doc.fillColor("black");
    y += rowHeight;
  });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Writing below the bottom margin would make pdfkit auto-add a page; lift the margin first.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - bottom - 10;
    doc.font("Helvetica").fontSize(8).fillColor("#777777");
    doc.text(`${COMPANY_NAME} — ${REPORT_TITLE}`, startX, footerY, { width: tableWidth / 2, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, startX, footerY, { width: tableWidth, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
}

/** Base file name (no extension) — kept in sync with frontend product.service.ts#productExportFileName. */
const productExportFileBase = (generatedAt) => `Products_Export_${dayjs(generatedAt).format("YYYY-MM-DD")}`;

const exportProducts = async (format, rows, res) => {
  const generatedAt = new Date();
  const meta = { generatedAt, fileBaseName: productExportFileBase(generatedAt) };
  return format === "pdf" ? generateProductPdf(rows, meta, res) : generateProductExcel(rows, meta, res);
};

module.exports = { exportProducts };
