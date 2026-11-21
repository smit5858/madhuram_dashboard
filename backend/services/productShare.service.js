const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const COMPANY_NAME = "Madhuram Motors";
const TAGLINE = "Car Diagnostic Solution";
// Same logo/font assets as saleInvoice.service.js — Noto Sans is embedded for the ₹ glyph.
const LOGO_PATH = [path.join(__dirname, "../assets/logo.png"), path.join(__dirname, "../assets/logo.jpg")].find((p) => fs.existsSync(p));
const FONT_REGULAR = path.join(__dirname, "../assets/fonts/NotoSans-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/NotoSans-Bold.ttf");
const HAS_CUSTOM_FONT = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

// Palette — kept in sync with frontend ProductShareModal.tsx.
const NAVY = "#0b1f4d";
const BRAND = "#1652d9";
const DARK = "#0f172a";
const BODY = "#475569";
const MUTED = "#94a3b8";
const SOFT = "#eef3ff";
const ON_DARK = "#c7d7ff";

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";
// Lines starting with "-", "•" or "*" in the description are treated as a feature/spec list.
const BULLET_RE = /^\s*[-•*]\s+/;

/**
 * Customer-facing view of a product — an explicit WHITELIST built from the output of
 * product.controller.js#serializeProduct. Only name, description/features and selling price are
 * copied: purchase price, dealer/supplier, serial numbers and any stock information never reach the
 * PDF, even if the serialized shape grows new fields later. Mirrored by frontend
 * pages/products/utils/productShare.ts.
 */
const toCustomerProduct = (p) => {
  const lines = hasValue(p.description) ? String(p.description).split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  const features = lines.filter((l) => BULLET_RE.test(l)).map((l) => l.replace(BULLET_RE, ""));
  const description = lines.filter((l) => !BULLET_RE.test(l)).join("\n");
  const price = hasValue(p.sellingPrice) ? Number(p.sellingPrice) : null;

  return {
    name: p.name,
    description: description || null,
    features,
    sellingPrice: price !== null && price > 0 ? price : null,
  };
};

const productShareFileBase = (name) => `${String(name || "Product").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "Product"}_Madhuram-Motors`;

const PAGE_W = 420; // A5 width
const MIN_PAGE_H = 595; // A5 height — the card grows taller (never splits) for long descriptions
const PAD = 28;
const HEADER_H = 104;
const FOOTER_H = 92;

const setupFonts = (doc) => {
  if (HAS_CUSTOM_FONT) {
    doc.registerFont("Cat", FONT_REGULAR);
    doc.registerFont("Cat-Bold", FONT_BOLD);
  }
  return { REG: HAS_CUSTOM_FONT ? "Cat" : "Helvetica", BOLD: HAS_CUSTOM_FONT ? "Cat-Bold" : "Helvetica-Bold" };
};

const money = (v) => {
  const s = Number(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return HAS_CUSTOM_FONT ? `₹${s}` : `Rs. ${s}`;
};

const navyGradient = (doc, x1, y1, x2, y2) => doc.linearGradient(x1, y1, x2, y2).stop(0, NAVY).stop(1, BRAND);

// White card with a soft drop shadow.
const card = (doc, x, y, w, h, r = 16) => {
  doc.save();
  doc.roundedRect(x, y + 4, w, h, r).fillOpacity(0.07).fill(DARK);
  doc.restore();
  doc.roundedRect(x, y, w, h, r).fill("white");
  doc.roundedRect(x, y, w, h, r).lineWidth(0.6).strokeColor("#e2e8f0").stroke();
};

// Draws everything above the footer and returns where the content ends. Run twice: once on a
// scratch document to measure, then on the real one sized to fit, so the card is always one page.
const drawBody = (doc, cp, imageBuffers) => {
  const { REG, BOLD } = setupFonts(doc);
  const contentW = PAGE_W - PAD * 2;

  // ── Header band ─────────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(navyGradient(doc, 0, 0, PAGE_W, HEADER_H));
  // Subtle decorative circles.
  doc.save();
  doc.circle(PAGE_W - 30, 8, 60).fillOpacity(0.07).fill("white");
  doc.circle(PAGE_W - 95, HEADER_H + 10, 38).fillOpacity(0.05).fill("white");
  doc.restore();

  const logo = 40;
  const top = 20;
  if (LOGO_PATH) {
    doc.roundedRect(PAD, top, logo, logo, 10).fill("white");
    doc.image(LOGO_PATH, PAD + 4, top + 4, { fit: [logo - 8, logo - 8] });
  }
  const tx = PAD + (LOGO_PATH ? logo + 12 : 0);
  doc.font(BOLD).fontSize(15).fillColor("white").text(COMPANY_NAME, tx, top + 1, { lineBreak: false });
  doc.font(REG).fontSize(8.5).fillColor(ON_DARK).text(TAGLINE, tx, top + 22, { lineBreak: false });
  doc.font(BOLD).fontSize(6.5).fillColor(ON_DARK).text("PRODUCT CATALOGUE", PAD, top + 6, { width: contentW, align: "right", characterSpacing: 1.2, lineBreak: false });

  // ── Photo card (overlaps the header band) ───────────────────────────────
  // Fixed-size frames (not sized to each photo) so every product's card has the same layout; the
  // photo is fitted inside, centred, never cropped or stretched. Cover photo large, the rest
  // (up to 3) as a thumbnail strip underneath.
  let y = 76;
  const inset = 12;
  const photos = [];
  for (const buf of imageBuffers || []) {
    try {
      photos.push(doc.openImage(buf));
    } catch {
      // corrupt/unreadable photo → skipped
    }
  }
  const innerW = contentW - inset * 2;
  const heroH = 230;
  if (photos.length) {
    const thumbs = photos.slice(1, 4);
    const gap = 8;
    const thumbH = thumbs.length ? (innerW - gap * 2) / 3 : 0;
    const cardH = inset + heroH + (thumbs.length ? gap + thumbH : 0) + inset;
    card(doc, PAD, y, contentW, cardH);

    const fitInto = (img, x, fy, w, h, pad) => {
      doc.roundedRect(x, fy, w, h, 10).fill("#f8fafc");
      const scale = Math.min((w - pad * 2) / img.width, (h - pad * 2) / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      doc.image(img, x + (w - dw) / 2, fy + (h - dh) / 2, { width: dw, height: dh });
    };
    fitInto(photos[0], PAD + inset, y + inset, innerW, heroH, 6);
    thumbs.forEach((img, i) => fitInto(img, PAD + inset + i * (thumbH + gap), y + inset + heroH + gap, thumbH, thumbH, 4));
    y += cardH + 22;
  } else {
    const cardH = 170;
    card(doc, PAD, y, contentW, cardH);
    doc.roundedRect(PAD + inset, y + inset, innerW, cardH - inset * 2, 12).fill(SOFT);
    if (LOGO_PATH) doc.image(LOGO_PATH, PAGE_W / 2 - 32, y + 40, { fit: [64, 64] });
    doc.font(REG).fontSize(8).fillColor(MUTED).text(`Genuine product from ${COMPANY_NAME}`, PAD, y + cardH - 40, { width: contentW, align: "center", lineBreak: false });
    y += cardH + 22;
  }

  // ── Name ────────────────────────────────────────────────────────────────
  doc.font(BOLD).fontSize(20).fillColor(DARK).text(cp.name, PAD, y, { width: contentW, lineGap: 1 });
  y = doc.y + 6;
  doc.roundedRect(PAD, y, 36, 3, 1.5).fill(BRAND);
  y += 16;

  // ── Price ribbon ────────────────────────────────────────────────────────
  if (cp.sellingPrice !== null) {
    const h = 58;
    doc.roundedRect(PAD, y, contentW, h, 14).fill(navyGradient(doc, PAD, y, PAD + contentW, y + h));
    doc.font(BOLD).fontSize(7).fillColor(ON_DARK).text("OUR PRICE", PAD + 18, y + 11, { characterSpacing: 1.2, lineBreak: false });
    doc.font(BOLD).fontSize(22).fillColor("white").text(money(cp.sellingPrice), PAD + 18, y + 20, { lineBreak: false });
    // "Genuine Product" pill on the right. The tick is drawn as a path — Noto Sans has no ✓ glyph.
    doc.font(BOLD).fontSize(7.5);
    const pill = "GENUINE PRODUCT";
    const pillW = doc.widthOfString(pill) + 34;
    const px = PAD + contentW - pillW - 16;
    const py = y + h / 2 - 10;
    doc.roundedRect(px, py, pillW, 20, 10).fill("white");
    doc.save();
    doc.moveTo(px + 11, py + 10.2).lineTo(px + 13.6, py + 12.8).lineTo(px + 18.4, py + 7.4).lineWidth(1.6).lineCap("round").lineJoin("round").strokeColor(BRAND).stroke();
    doc.restore();
    doc.fillColor(BRAND).text(pill, px + 23, py + 5, { lineBreak: false });
    y += h + 22;
  }

  const heading = (text) => {
    doc.roundedRect(PAD, y + 2, 4, 12, 2).fill(BRAND);
    doc.font(BOLD).fontSize(11).fillColor(DARK).text(text, PAD + 12, y, { lineBreak: false });
    y += 22;
  };

  // ── About ───────────────────────────────────────────────────────────────
  if (cp.description) {
    heading("About this product");
    cp.description.split("\n").forEach((para) => {
      doc.font(REG).fontSize(9.5).fillColor(BODY).text(para, PAD, y, { width: contentW, lineGap: 2.5 });
      y = doc.y + 6;
    });
    y += 10;
  }

  // ── Key features panel ──────────────────────────────────────────────────
  if (cp.features.length) {
    heading("Key Features");
    const textX = PAD + 34;
    const textW = contentW - 48;
    doc.font(REG).fontSize(9.5);
    const rowHeights = cp.features.map((f) => Math.max(doc.heightOfString(f, { width: textW, lineGap: 2 }), 14) + 8);
    const panelH = rowHeights.reduce((a, b) => a + b, 0) + 16;
    doc.roundedRect(PAD, y, contentW, panelH, 12).fill(SOFT);
    let ry = y + 10;
    cp.features.forEach((f, i) => {
      const cx = PAD + 18;
      const cy = ry + 7.5;
      doc.circle(cx, cy, 7).fill(BRAND);
      doc.save();
      doc.moveTo(cx - 3.2, cy + 0.2).lineTo(cx - 0.8, cy + 2.6).lineTo(cx + 3.4, cy - 2.4).lineWidth(1.5).lineCap("round").lineJoin("round").strokeColor("white").stroke();
      doc.restore();
      doc.font(REG).fontSize(9.5).fillColor(DARK).text(f, textX, ry, { width: textW, lineGap: 2 });
      ry += rowHeights[i];
    });
    y += panelH + 8;
  }

  return y;
};

/** Single-page customer product catalogue card (A5 width; taller when the description is long). */
// images: photo buffers in display order (cover first), from productImage.service.
function generateProductSharePdf(product, res, { images = [] } = {}) {
  const cp = toCustomerProduct(product);

  // Pass 1 — measure on a scratch document (never piped anywhere) with a very tall page.
  const scratch = new PDFDocument({ size: [PAGE_W, 20000], margin: 0 });
  const contentBottom = drawBody(scratch, cp, images);
  scratch.end();
  const pageH = Math.max(MIN_PAGE_H, Math.ceil(contentBottom + 24 + FOOTER_H));

  // Pass 2 — the real document.
  const doc = new PDFDocument({ size: [PAGE_W, pageH], margin: 0, info: { Title: `${cp.name} — ${COMPANY_NAME}`, Author: COMPANY_NAME } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${productShareFileBase(cp.name)}.pdf"`);
  doc.pipe(res);
  drawBody(doc, cp, images);

  // ── Footer band pinned to the bottom ────────────────────────────────────
  const { REG, BOLD } = setupFonts(doc);
  const contentW = PAGE_W - PAD * 2;
  const fy = pageH - FOOTER_H;
  doc.rect(0, fy, PAGE_W, FOOTER_H).fill(navyGradient(doc, 0, fy, PAGE_W, pageH));
  doc.save();
  doc.circle(24, pageH + 6, 46).fillOpacity(0.06).fill("white");
  doc.restore();
  doc.font(BOLD).fontSize(10.5).fillColor("white").text("Contact us for more details or to place your order.", PAD, fy + 20, { width: contentW, align: "center", lineBreak: false });
  doc.font(REG).fontSize(9).fillColor(ON_DARK).text(`Thank you for choosing ${COMPANY_NAME}!`, PAD, fy + 40, { width: contentW, align: "center", lineBreak: false });
  doc.font(REG).fontSize(7.5).fillColor(ON_DARK).text(`${COMPANY_NAME}  •  ${TAGLINE}`, PAD, fy + 62, { width: contentW, align: "center", lineBreak: false });

  doc.end();
}

module.exports = { generateProductSharePdf, toCustomerProduct };
