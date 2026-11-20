const PDFDocument = require("pdfkit");
const dayjs = require("dayjs");
const fs = require("fs");
const path = require("path");
const { computeOrderTotal } = require("./order.service");

const COMPANY_NAME = "Madhuram Motors";
const TAGLINE = "Car Diagnostic Solution";
// Same letterhead logo as the *Export.service.js files; falls back to the .jpg that ships in assets/.
const LOGO_PATH = [path.join(__dirname, "../assets/logo.png"), path.join(__dirname, "../assets/logo.jpg")].find((p) => fs.existsSync(p));
// Noto Sans (SIL Open Font License) — embedded because the standard PDF fonts have no ₹ glyph.
const FONT_REGULAR = path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/NotoSans-Bold.ttf");
const HAS_CUSTOM_FONT = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

// Kept in sync with frontend pages/sells/utils/saleInvoice.ts#PAYMENT_STATUS_LABELS.
const PAYMENT_STATUS_LABELS = {
  PAID: "PAID",
  PARTIALLY_PAID: "PARTIALLY PAID",
  UNPAID: "UNPAID",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY REFUNDED",
};
const STATUS_COLORS = { PAID: "#059669", PARTIALLY_PAID: "#d97706", UNPAID: "#e11d48" };
const PAYMENT_METHOD_LABELS = { BankTransfer: "Bank Transfer" };

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const toAmount = (v) => parseFloat(v) || 0;
const formatAmount = (v) => toAmount(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Turns a Sale (with items.Product, payments, customer) into the receipt's display model. Mirrors
 * frontend pages/sells/utils/saleInvoice.ts#buildSaleInvoice so the preview and PDF always match:
 * empty fields are dropped entirely, cancelled lines are excluded, and
 * pending = (sellingAmount + courierCharge) - collectedAmount, floored at 0.
 */
const buildInvoiceModel = (sale) => {
  const sellingAmount = toAmount(sale.sellingAmount);
  const courierCharge = toAmount(sale.courierCharge);
  const totalAmount = computeOrderTotal(sellingAmount, courierCharge);
  const paidAmount = toAmount(sale.collectedAmount);
  const refundedAmount = toAmount(sale.refundedAmount);
  const pendingAmount = Math.max(0, totalAmount - paidAmount);
  const paymentStatus = sale.paymentStatus || (paidAmount <= 0 ? "UNPAID" : pendingAmount > 0 ? "PARTIALLY_PAID" : "PAID");

  const items = (sale.items || [])
    .filter((i) => i.fulfillmentStatus !== "CANCELLED")
    .map((i) => ({
      name: i.Product?.name || i.productName || "",
      quantity: Number(i.quantity) || 0,
      unitPrice: hasValue(i.sellingPrice) ? toAmount(i.sellingPrice) : null,
    }))
    .filter((i) => hasValue(i.name));

  const payments = (sale.payments || [])
    .filter((p) => toAmount(p.amount) !== 0)
    .map((p) => ({
      method: hasValue(p.method) ? PAYMENT_METHOD_LABELS[p.method] || p.method : null,
      amount: toAmount(p.amount),
      date: p.createdAt ? dayjs(p.createdAt).format("MMM D, YYYY") : null,
      reference: hasValue(p.transactionRef) ? String(p.transactionRef).trim() : null,
    }));

  // Ship To — the sale's own address fields first (what was entered on the sale), else the linked customer's.
  const address = hasValue(sale.fromAddress) ? sale.fromAddress : sale.customer?.address;
  const city = hasValue(sale.city) ? sale.city : sale.customer?.city;
  const pincode = hasValue(sale.pincode) ? sale.pincode : sale.customer?.pincode;

  return {
    invoiceNumber: hasValue(sale.invoiceNumber) ? sale.invoiceNumber : null,
    invoiceDate: sale.saleDate || sale.createdAt ? dayjs(sale.saleDate || sale.createdAt).format("MMM D, YYYY") : null,
    customerName: hasValue(sale.customerName) ? sale.customerName : sale.customer?.name || null,
    customerPhone: hasValue(sale.customerNumber) ? sale.customerNumber : sale.customer?.phone || null,
    shipTo: {
      address: hasValue(address) ? String(address).trim() : null,
      city: hasValue(city) ? String(city).trim() : null,
      pincode: hasValue(pincode) ? String(pincode).trim() : null,
    },
    isCancelled: sale.status === "CANCELLED",
    items,
    sellingAmount,
    courierCharge,
    totalAmount,
    paidAmount,
    pendingAmount,
    refundedAmount,
    paymentStatus,
    payments,
  };
};

/** Single-sale receipt PDF (A4 portrait) in the shop's standard invoice layout. Not a GST tax invoice. */
function generateSaleInvoicePdf(sale, res) {
  const inv = buildInvoiceModel(sale);
  const fileBase = `Invoice_${(inv.invoiceNumber || `SALE-${sale.id}`).replace(/[^A-Za-z0-9_-]+/g, "-")}`;

  const doc = new PDFDocument({ size: "A4", margin: 36, info: { Title: `${COMPANY_NAME} — ${inv.invoiceNumber || "Invoice"}`, Author: COMPANY_NAME } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.pdf"`);
  doc.pipe(res);

  if (HAS_CUSTOM_FONT) {
    doc.registerFont("Inv", FONT_REGULAR);
    doc.registerFont("Inv-Bold", FONT_BOLD);
  }
  const REG = HAS_CUSTOM_FONT ? "Inv" : "Helvetica";
  const BOLD = HAS_CUSTOM_FONT ? "Inv-Bold" : "Helvetica-Bold";
  const money = (v) => (HAS_CUSTOM_FONT ? `₹${formatAmount(v)}` : `Rs. ${formatAmount(v)}`);

  const DARK = "#333333";
  const MUTED = "#777777";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;

  // Right-hand "label: value" rows (meta block + totals) — label right-aligned against a fixed
  // column, value right-aligned against the page edge, exactly like the reference layout.
  const LABEL_END = right - 150;
  const VALUE_END = right - 10;
  const labelValue = (y, label, value, { bold = false, size = 10, valueColor = DARK } = {}) => {
    doc.font(bold ? BOLD : REG).fontSize(size).fillColor(bold ? DARK : MUTED);
    doc.text(label, LABEL_END - 160, y, { width: 160, align: "right", lineBreak: false });
    doc.font(bold ? BOLD : REG).fillColor(valueColor);
    doc.text(value, LABEL_END + 10, y, { width: VALUE_END - LABEL_END - 10, align: "right", lineBreak: false });
  };

  // ── Header ──────────────────────────────────────────────────────────────
  const top = doc.page.margins.top;
  const logoSize = 92;
  if (LOGO_PATH) doc.image(LOGO_PATH, left + 6, top, { fit: [logoSize, logoSize] });

  doc.font(REG).fontSize(30).fillColor(DARK).text("INVOICE", left, top + 4, { width: width - 6, align: "right", lineBreak: false });
  if (inv.invoiceNumber) {
    doc.font(REG).fontSize(12).fillColor(MUTED).text(`# ${inv.invoiceNumber}`, left, top + 44, { width: width - 10, align: "right", lineBreak: false });
  }

  // Company block under the logo.
  let leftY = top + (LOGO_PATH ? logoSize + 14 : 0);
  doc.font(BOLD).fontSize(10).fillColor(DARK).text(COMPANY_NAME, left + 15, leftY, { lineBreak: false });
  leftY += 14;
  doc.font(REG).fontSize(10).fillColor(DARK).text(TAGLINE, left + 15, leftY, { lineBreak: false });
  leftY += 40;

  // Meta rows + Balance Due box on the right.
  let metaY = top + 66;
  const metaRows = [
    inv.invoiceDate && ["Date:", inv.invoiceDate],
    inv.customerPhone && ["Phone:", inv.customerPhone],
  ].filter(Boolean);
  metaRows.forEach(([label, value]) => {
    labelValue(metaY, label, value);
    metaY += 21;
  });
  labelValue(metaY, "Status:", PAYMENT_STATUS_LABELS[inv.paymentStatus] || inv.paymentStatus, {
    valueColor: STATUS_COLORS[inv.paymentStatus] || DARK,
  });
  metaY += 21;
  doc.roundedRect(LABEL_END - 145, metaY - 6, right + 12 - (LABEL_END - 145), 26, 3).fill("#f4f4f4");
  labelValue(metaY, "Balance Due:", money(inv.pendingAmount), { bold: true, size: 11.5 });
  metaY += 34;

  // Bill To / Ship To columns.
  const colX = [left + 15, left + 150];
  const colWidth = 125;
  const shipLines = [
    inv.shipTo.address && { text: inv.shipTo.address, bold: true },
    inv.shipTo.city && { text: inv.shipTo.city },
    inv.shipTo.pincode && { text: `pincode : ${inv.shipTo.pincode}` },
  ].filter(Boolean);
  let billY = leftY;
  let shipY = leftY;
  if (inv.customerName) {
    doc.font(REG).fontSize(10).fillColor(MUTED).text("Bill To:", colX[0], billY, { lineBreak: false });
    billY += 18;
    doc.font(BOLD).fontSize(10).fillColor(DARK).text(inv.customerName, colX[0], billY, { width: colWidth });
    billY = doc.y;
  }
  if (shipLines.length) {
    doc.font(REG).fontSize(10).fillColor(MUTED).text("Ship To:", colX[1], shipY, { lineBreak: false });
    shipY += 18;
    shipLines.forEach((line) => {
      doc.font(line.bold ? BOLD : REG).fontSize(10).fillColor(DARK).text(line.text, colX[1], shipY, { width: colWidth });
      shipY = doc.y;
    });
  }

  let y = Math.max(billY, shipY, metaY) + 40;

  if (inv.isCancelled) {
    doc.roundedRect(left, y - 10, width, 24, 3).fill("#fef2f2");
    doc.font(BOLD).fontSize(10).fillColor("#be123c").text("THIS ORDER HAS BEEN CANCELLED", left, y - 5, { width, align: "center", lineBreak: false });
    y += 30;
  }

  // ── Items table ─────────────────────────────────────────────────────────
  const col = {
    item: { x: left + 15, w: width - 260 },
    qty: { x: right - 245, w: 60 },
    rate: { x: right - 185, w: 95 },
    amount: { x: right - 90, w: 80 },
  };
  const drawTableHeader = () => {
    doc.roundedRect(left - 6, y, width + 12, 22, 3).fill("#3c3c3c");
    doc.font(REG).fontSize(10).fillColor("white");
    doc.text("Item", col.item.x, y + 5, { lineBreak: false });
    doc.text("Quantity", col.qty.x, y + 5, { width: col.qty.w, lineBreak: false });
    doc.text("Rate", col.rate.x, y + 5, { width: col.rate.w, align: "right", lineBreak: false });
    doc.text("Amount", col.amount.x, y + 5, { width: col.amount.w, align: "right", lineBreak: false });
    y += 32;
  };
  drawTableHeader();

  inv.items.forEach((item) => {
    doc.font(BOLD).fontSize(10);
    const rowHeight = Math.max(doc.heightOfString(item.name, { width: col.item.w }), 14) + 6;
    if (y + rowHeight > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top;
      drawTableHeader();
    }
    doc.font(BOLD).fontSize(10).fillColor(DARK).text(item.name, col.item.x, y, { width: col.item.w });
    doc.font(REG).text(String(item.quantity), col.qty.x, y, { width: col.qty.w, lineBreak: false });
    if (item.unitPrice !== null) {
      doc.text(money(item.unitPrice), col.rate.x, y, { width: col.rate.w, align: "right", lineBreak: false });
      doc.text(money(item.unitPrice * item.quantity), col.amount.x, y, { width: col.amount.w, align: "right", lineBreak: false });
    }
    y += rowHeight;
  });

  // ── Totals (right) + payment details (left) ─────────────────────────────
  const totals = [];
  if (inv.courierCharge > 0) {
    totals.push(["Subtotal:", money(inv.sellingAmount)], ["Courier Charge:", money(inv.courierCharge)]);
  }
  totals.push(["Total:", money(inv.totalAmount)], ["Amount Paid:", money(inv.paidAmount)]);
  if (inv.refundedAmount > 0) totals.push(["Refunded:", money(inv.refundedAmount)]);

  const paymentBlockHeight = inv.payments.length ? 20 + inv.payments.length * 16 : 0;
  y += 50;
  if (y + Math.max(totals.length * 24, paymentBlockHeight) + 60 > bottomLimit()) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  let totalsY = y;
  totals.forEach(([label, value]) => {
    labelValue(totalsY, label, value);
    totalsY += 24;
  });

  let payY = y;
  if (inv.payments.length) {
    doc.font(REG).fontSize(10).fillColor(MUTED).text("Payment Details:", left + 15, payY, { lineBreak: false });
    payY += 20;
    inv.payments.forEach((p) => {
      const label = [p.method, p.date, p.reference && `Ref: ${p.reference}`].filter(Boolean).join("  ·  ") || "Payment";
      doc.font(REG).fontSize(9).fillColor(DARK).text(label, left + 15, payY, { width: 185, lineBreak: false, ellipsis: true });
      doc.font(REG).text(money(p.amount), left + 200, payY, { width: 70, align: "right", lineBreak: false });
      payY += 16;
    });
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  y = Math.max(totalsY, payY) + 40;
  doc.font(BOLD).fontSize(11).fillColor(DARK).text("Thank you for your business!", left, y, { width, align: "center", lineBreak: false });
  doc.font(REG).fontSize(8.5).fillColor(MUTED).text(`${COMPANY_NAME} — ${TAGLINE}`, left, y + 17, { width, align: "center", lineBreak: false });

  doc.end();
}

module.exports = { generateSaleInvoicePdf, buildInvoiceModel };
