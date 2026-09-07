const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = "Madhuram Motors";
// Same letterhead logo used by the Sales export — see salesExport.service.js.
const LOGO_PATH = path.join(__dirname, "../assets/logo.jpg");

const describeEntry = (entry) => {
  if (entry.type === "SALE") return `Product Sale${entry.sale?.invoiceNumber ? ` (${entry.sale.invoiceNumber})` : ""}`;
  if (entry.type === "PAYMENT") return `Payment${entry.paymentMethod ? ` - ${entry.paymentMethod}` : ""}`;
  return `Adjustment${entry.note ? ` - ${entry.note}` : ""}`;
};

// Generates a printable PDF account statement for one customer — same pdfkit + letterhead
// pattern as salesExport.service.js#generateSalesPdf.
function generateCustomerStatementPdf(customer, balance, entries, res) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="statement-${customer.id}-${Date.now()}.pdf"`);
  doc.pipe(res);

  const startX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y;

  const drawCompanyHeader = () => {
    const logoWidth = 44;
    const headerTop = doc.page.margins.top;
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, startX, headerTop, { width: logoWidth, height: logoWidth });
    }
    doc.font("Helvetica-Bold").fontSize(18).fillColor("black").text(COMPANY_NAME, startX + logoWidth + 12, headerTop + 2);
    doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Customer Account Statement", startX + logoWidth + 12, headerTop + 24);
    doc.fillColor("black");
    y = headerTop + logoWidth + 16;
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor("#cccccc").stroke();
    y += 14;
  };

  drawCompanyHeader();

  doc.font("Helvetica-Bold").fontSize(12).text(`Customer: ${customer.name}`, startX, y);
  y += 16;
  doc.font("Helvetica").fontSize(10).fillColor("#444444").text(`Phone: ${customer.phone || "—"}`, startX, y);
  y += 14;
  doc.text(`Statement Date: ${new Date().toLocaleDateString("en-GB")}`, startX, y);
  y += 20;

  const balanceColor = balance.status === "ADVANCE" ? "#059669" : balance.status === "PENDING" ? "#e11d48" : "#475569";
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(balanceColor)
    .text(`Current Balance: Rs. ${Math.abs(balance.amount).toLocaleString("en-IN")} ${balance.label}`, startX, y);
  doc.fillColor("black");
  y += 26;

  const columns = [
    { key: "sr", header: "Sr No", width: 40 },
    { key: "date", header: "Date", width: 75 },
    { key: "description", header: "Description", width: pageWidth - 40 - 75 - 90 },
    { key: "amount", header: "Amount", width: 90 },
  ];
  const rowHeight = 18;

  const drawColumnHeader = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("black");
    columns.forEach((col) => {
      doc.text(col.header, x, y, { width: col.width, ellipsis: true });
      x += col.width;
    });
    y += rowHeight;
    doc.moveTo(startX, y - 4).lineTo(startX + pageWidth, y - 4).strokeColor("#cccccc").stroke();
    doc.font("Helvetica").fontSize(9);
  };

  drawColumnHeader();

  if (entries.length === 0) {
    doc.fillColor("#666666").text("No transactions recorded yet.", startX, y + 6);
  }

  entries.forEach((entry, index) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage({ size: "A4", margin: 40 });
      y = doc.page.margins.top;
      drawColumnHeader();
    }

    const amount = parseFloat(entry.amount) || 0;
    let x = startX;
    doc.fillColor("black");
    doc.text(String(index + 1), x, y, { width: columns[0].width });
    x += columns[0].width;
    doc.text(new Date(entry.transactionDate).toLocaleDateString("en-GB"), x, y, { width: columns[1].width });
    x += columns[1].width;
    doc.text(describeEntry(entry), x, y, { width: columns[2].width, ellipsis: true });
    x += columns[2].width;
    doc
      .fillColor(amount < 0 ? "#e11d48" : "#059669")
      .text(`${amount < 0 ? "-" : "+"} Rs. ${Math.abs(amount).toLocaleString("en-IN")}`, x, y, { width: columns[3].width });
    doc.fillColor("black");
    y += rowHeight;
  });

  y += 10;
  if (y + 24 > doc.page.height - doc.page.margins.bottom) {
    doc.addPage({ size: "A4", margin: 40 });
    y = doc.page.margins.top;
  }
  doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor("#cccccc").stroke();
  y += 12;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(balanceColor)
    .text(`Current Balance: Rs. ${Math.abs(balance.amount).toLocaleString("en-IN")} ${balance.label}`, startX, y);

  doc.end();
}

module.exports = { generateCustomerStatementPdf };
