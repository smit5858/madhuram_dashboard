const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = "Madhuram Motors";
// Same letterhead logo used by the Sales export — swap this file (or point elsewhere) to
// change branding without touching the generators below.
const LOGO_PATH = path.join(__dirname, "../assets/logo.jpg");

const DELIVERY_MODE_LABEL = {
  OFFICE_PICKUP: "Office Pickup",
  CHANGE: "Change",
  PENDING: "Pending",
  FREE: "Free",
};

const STOCK_STATUS_LABEL = {
  IN_STOCK: "In Stock",
  OUT_OF_STOCK: "Out of Stock",
};

// Single source of truth for export columns — shared by both generators below so the two
// files never drift apart. `pdfWidth: null` columns are Excel-only (kept out of the PDF to
// keep it readable in landscape); Excel gets every column since width isn't a constraint.
const COURIER_EXPORT_COLUMNS = [
  { key: "customerName", header: "Customer Name", width: 20, pdfWidth: 85, get: (c) => c.customerName || c.name || "" },
  { key: "address", header: "Address", width: 28, pdfWidth: null, get: (c) => c.address || "" },
  { key: "city", header: "City", width: 14, pdfWidth: null, get: (c) => c.city || "" },
  { key: "mobileNo", header: "Mobile No.", width: 14, pdfWidth: 70, get: (c) => c.mobileNo || c.phone || "" },
  { key: "productName", header: "Product Name", width: 20, pdfWidth: 85, get: (c) => c.productName || "" },
  {
    key: "productStockStatus",
    header: "Product Stock Status",
    width: 18,
    pdfWidth: 70,
    get: (c) => (c.productStockStatus ? STOCK_STATUS_LABEL[c.productStockStatus] : ""),
  },
  {
    key: "serialNumbers",
    header: "Serial Numbers",
    width: 24,
    pdfWidth: 85,
    get: (c) => (c.SaleItem?.SerialUnits || []).map((u) => u.serialNumber).join(", "),
  },
  { key: "charge", header: "Charge", width: 10, pdfWidth: 45, get: (c) => (c.charge != null ? Number(c.charge).toFixed(2) : "") },
  { key: "freePickup", header: "Free Pickup", width: 10, pdfWidth: null, get: (c) => (c.freePickup ? "Yes" : "No") },
  { key: "courierName", header: "Courier Name", width: 16, pdfWidth: null, get: (c) => c.courierName || "" },
  { key: "trackId", header: "Track ID", width: 16, pdfWidth: 65, get: (c) => c.trackId || "" },
  { key: "kg", header: "KG", width: 8, pdfWidth: null, get: (c) => (c.kg != null ? String(c.kg) : "") },
  { key: "quantity", header: "Qty", width: 6, pdfWidth: 30, get: (c) => c.quantity ?? "" },
  { key: "status", header: "Status", width: 16, pdfWidth: 60, get: (c) => c.status || "" },
  {
    key: "deliveryMode",
    header: "Delivery Mode",
    width: 16,
    pdfWidth: 65,
    get: (c) => (c.deliveryMode ? DELIVERY_MODE_LABEL[c.deliveryMode] : ""),
  },
  { key: "entryDate", header: "Entry Date", width: 12, pdfWidth: 55, get: (c) => (c.entryDate ? dayjs(c.entryDate).format("DD-MM-YYYY") : "") },
  { key: "completedDate", header: "Delivered Date", width: 14, pdfWidth: 60, get: (c) => (c.completedDate ? dayjs(c.completedDate).format("DD-MM-YYYY") : "") },
  { key: "note", header: "Note", width: 24, pdfWidth: null, get: (c) => c.note || "" },
];

async function generateCourierExcel(couriers, res) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Outgoing Couriers");
  sheet.columns = COURIER_EXPORT_COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  const lastColLetter = sheet.getColumn(COURIER_EXPORT_COLUMNS.length).letter;

  // Header band: column A hosts the logo, merged across rows 1-2 so it sits as a single
  // "cell" beside the two lines of company text (name + subtitle) — the closest visual
  // equivalent Excel allows to putting an image and text inside one literal cell. Mirrors
  // the Sales export header exactly (see salesExport.service.js).
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
  subtitleCell.value = `Outgoing Couriers Export — Generated on ${dayjs().format("DD-MM-YYYY, hh:mm A")}`;
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
  headerRow.values = COURIER_EXPORT_COLUMNS.map((c) => c.header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEFC" } };
  });

  couriers.forEach((courier) => {
    sheet.addRow(COURIER_EXPORT_COLUMNS.map((c) => c.get(courier)));
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="outgoing-couriers-${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function generateCourierPdf(couriers, res) {
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: 30 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="outgoing-couriers-${Date.now()}.pdf"`);
  doc.pipe(res);

  const pdfColumns = COURIER_EXPORT_COLUMNS.filter((c) => c.pdfWidth);
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
    doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Outgoing Couriers Export", startX + logoWidth + 12, headerTop + 24);
    doc.fillColor("black");
    y = headerTop + logoWidth + 15;
    doc.moveTo(startX, y - 8).lineTo(doc.page.width - doc.page.margins.right, y - 8).strokeColor("#cccccc").stroke();
  };

  const drawHeader = () => {
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
  drawHeader();

  couriers.forEach((courier) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ layout: "landscape", size: "A4", margin: 30 });
      y = doc.page.margins.top;
      drawHeader();
    }
    let x = startX;
    pdfColumns.forEach((col) => {
      doc.text(String(col.get(courier) ?? ""), x, y, { width: col.pdfWidth, height: rowHeight, ellipsis: true });
      x += col.pdfWidth;
    });
    y += rowHeight;
  });

  doc.end();
}

module.exports = { generateCourierExcel, generateCourierPdf, COURIER_EXPORT_COLUMNS };
