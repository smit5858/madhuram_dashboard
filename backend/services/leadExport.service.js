const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = "Madhuram Motors";
// Same letterhead logo as salesExport.service.js / accountExport.service.js.
const LOGO_PATH = path.join(__dirname, "../assets/logo.jpg");

const STATUS_LABELS = {
  PENDING: "Pending",
  PROGRESS: "Progress",
  COMPLETED: "Completed",
  INCOMPLETED: "Incompleted",
  NOT_INTERESTED: "Not Interested",
};
const APPROVAL_LABELS = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

const formatDate = (value) => (value ? dayjs(value).format("DD-MM-YYYY") : "");

// Mirrors Leads.tsx#getNextFollowUp so the exported "Next Follow-up" matches the table column:
// nearest upcoming PENDING slot, else the earliest PENDING one, else Follow-up 1.
const nextFollowUpDate = (lead) => {
  const today = dayjs().format("YYYY-MM-DD");
  const slots = [
    { date: lead.followUp1Date, status: lead.followUp1Status },
    { date: lead.followUp2Date, status: lead.followUp2Status },
    { date: lead.followUp3Date, status: lead.followUp3Status },
  ].filter((s) => s.date);
  const pending = slots.filter((s) => s.status !== "DONE").sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const chosen = pending.find((s) => s.date >= today) || pending[0] || slots[0];
  return chosen ? formatDate(chosen.date) : "";
};

// All follow-up notes, labelled by slot — the closest thing a Lead has to "remarks".
const remarks = (lead) =>
  [1, 2, 3]
    .map((n) => (lead[`followUp${n}Notes`] ? `F${n}: ${String(lead[`followUp${n}Notes`]).trim()}` : null))
    .filter(Boolean)
    .join(" | ");

// Single source of truth for export columns — shared by both generators so the Excel and PDF
// files never drift apart. Columns without a pdfWidth are Excel-only (too wide for landscape A4).
const LEAD_EXPORT_COLUMNS = [
  { key: "srNo", header: "Sr. No.", width: 8, pdfWidth: 32, get: (r, i) => i + 1 },
  { key: "id", header: "Lead ID", width: 9, pdfWidth: 38, get: (r) => `#${r.id}` },
  { key: "customerName", header: "Customer Name", width: 24, pdfWidth: 90, get: (r) => r.customerName || "" },
  { key: "companyName", header: "Company", width: 22, pdfWidth: 80, get: (r) => r.companyName || "" },
  { key: "phone", header: "Phone", width: 14, pdfWidth: 62, get: (r) => r.phone || "" },
  { key: "city", header: "City", width: 14, pdfWidth: 55, get: (r) => r.city || "" },
  { key: "address", header: "Address", width: 30, get: (r) => r.address || "" },
  { key: "platform", header: "Lead Source", width: 16, pdfWidth: 60, get: (r) => r.platform?.name || "" },
  { key: "product", header: "Product", width: 24, pdfWidth: 80, get: (r) => r.product?.name || "Other" },
  { key: "quantity", header: "Qty", width: 7, pdfWidth: 26, get: (r) => r.quantity },
  { key: "status", header: "Status", width: 15, pdfWidth: 58, get: (r) => STATUS_LABELS[r.status] || r.status || "" },
  { key: "approvalStatus", header: "Approval", width: 12, get: (r) => APPROVAL_LABELS[r.approvalStatus] || r.approvalStatus || "" },
  { key: "salesEmployee", header: "Sales Employee", width: 20, pdfWidth: 72, get: (r) => r.salesEmployee?.name || "" },
  { key: "createdAt", header: "Created Date", width: 13, pdfWidth: 56, get: (r) => formatDate(r.createdAt) },
  { key: "nextFollowUp", header: "Next Follow-up", width: 14, pdfWidth: 58, get: nextFollowUpDate },
  { key: "remarks", header: "Remarks", width: 45, get: remarks },
];

/**
 * Report metadata the controller resolves once (names, not ids) and both generators print.
 * @typedef {{ periodLabel: string, employeeLabel: string, filterLabel: string, fileBaseName: string }} LeadReportMeta
 */

const reportHeaderLines = (meta, count) => [
  `Period: ${meta.periodLabel}   |   Employee: ${meta.employeeLabel}   |   Total Leads: ${count}`,
  meta.filterLabel,
  `Generated on ${dayjs().format("DD-MM-YYYY, hh:mm A")}`,
];

async function generateLeadExcel(rows, meta, res) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  const columns = LEAD_EXPORT_COLUMNS;
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const lastColLetter = sheet.getColumn(columns.length).letter;
  const hasLogo = fs.existsSync(LOGO_PATH);

  sheet.mergeCells(`A1:${lastColLetter}1`);
  const nameCell = sheet.getCell("A1");
  nameCell.value = `${COMPANY_NAME} — Leads Report`;
  nameCell.font = { bold: true, size: 16 };
  nameCell.alignment = { vertical: "bottom", horizontal: "left", indent: hasLogo ? 6 : 0 };
  sheet.getRow(1).height = 24;

  reportHeaderLines(meta, rows.length).forEach((line, i) => {
    const rowNum = i + 2;
    sheet.mergeCells(`A${rowNum}:${lastColLetter}${rowNum}`);
    const cell = sheet.getCell(`A${rowNum}`);
    cell.value = line;
    cell.font = { size: 10, color: { argb: "FF555555" }, italic: i === 2 };
    cell.alignment = { vertical: "top", horizontal: "left", indent: hasLogo ? 6 : 0 };
  });

  if (hasLogo) {
    const PX_TO_EMU = 9525;
    const imageId = workbook.addImage({ filename: LOGO_PATH, extension: "jpeg" });
    sheet.addImage(imageId, {
      tl: { nativeCol: 0, nativeColOff: 8 * PX_TO_EMU, nativeRow: 0, nativeRowOff: 8 * PX_TO_EMU },
      ext: { width: 38, height: 38 },
      editAs: "oneCell",
    });
  }

  // Row 5 blank for spacing, row 6 is the column header row (frozen so it stays visible on scroll).
  const HEADER_ROW = 6;
  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.values = columns.map((c) => c.header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEFC" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: columns.length } };

  rows.forEach((row, i) => {
    const added = sheet.addRow(columns.map((c) => c.get(row, i)));
    added.alignment = { vertical: "top", wrapText: false };
  });
  sheet.getColumn("remarks").alignment = { vertical: "top", wrapText: true };
  sheet.getColumn("address").alignment = { vertical: "top", wrapText: true };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${meta.fileBaseName}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function generateLeadPdf(rows, meta, res) {
  const PAGE_OPTIONS = { layout: "landscape", size: "A4", margin: 30 };
  // bufferPages lets us stamp "Page X of Y" once the total page count is known.
  const doc = new PDFDocument({ ...PAGE_OPTIONS, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${meta.fileBaseName}.pdf"`);
  doc.pipe(res);

  const pdfColumns = LEAD_EXPORT_COLUMNS.filter((c) => c.pdfWidth);
  const tableWidth = pdfColumns.reduce((w, c) => w + c.pdfWidth, 0);
  const startX = doc.page.margins.left;
  const rowHeight = 18;
  // Reserve room at the bottom for the page-number footer.
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 14;
  let y;

  const drawReportHeader = () => {
    const logoWidth = 40;
    const headerTop = doc.page.margins.top;
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, startX, headerTop, { width: logoWidth, height: logoWidth });
    }
    const textX = startX + logoWidth + 12;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("black").text(`${COMPANY_NAME} — Leads Report`, textX, headerTop);
    doc.font("Helvetica").fontSize(9).fillColor("#555555");
    const lines = reportHeaderLines(meta, rows.length);
    lines.forEach((line, i) => doc.text(line, textX, headerTop + 21 + i * 11, { width: tableWidth - logoWidth - 12 }));
    doc.fillColor("black");
    y = headerTop + 21 + lines.length * 11 + 14;
    doc.moveTo(startX, y - 8).lineTo(startX + tableWidth, y - 8).strokeColor("#cccccc").stroke();
  };

  const drawColumnHeader = () => {
    doc.rect(startX, y - 4, tableWidth, rowHeight).fill("#E8EEFC");
    doc.fillColor("black");
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(8);
    pdfColumns.forEach((col) => {
      doc.text(col.header, x + 2, y, { width: col.pdfWidth - 4, height: rowHeight, ellipsis: true, lineBreak: false });
      x += col.pdfWidth;
    });
    y += rowHeight;
    doc.font("Helvetica").fontSize(8).fillColor("black");
  };

  const ensureRoom = () => {
    if (y + rowHeight > bottomLimit()) {
      doc.addPage(PAGE_OPTIONS);
      y = doc.page.margins.top;
      drawColumnHeader();
    }
  };

  drawReportHeader();
  drawColumnHeader();

  rows.forEach((row, i) => {
    ensureRoom();
    if (i % 2 === 1) {
      doc.rect(startX, y - 4, tableWidth, rowHeight).fill("#F8FAFC");
      doc.fillColor("black");
    }
    let x = startX;
    pdfColumns.forEach((col) => {
      doc.text(String(col.get(row, i) ?? ""), x + 2, y, {
        width: col.pdfWidth - 4,
        height: rowHeight,
        ellipsis: true,
        lineBreak: false,
      });
      x += col.pdfWidth;
    });
    y += rowHeight;
  });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Writing below the bottom margin would make pdfkit auto-add a page; lift the margin first.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor("#777777")
      .text(`Page ${i - range.start + 1} of ${range.count}`, startX, doc.page.height - bottom - 10, {
        width: tableWidth,
        align: "right",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
}

const exportLeads = async (format, rows, meta, res) =>
  format === "pdf" ? generateLeadPdf(rows, meta, res) : generateLeadExcel(rows, meta, res);

module.exports = { exportLeads, STATUS_LABELS, APPROVAL_LABELS };
