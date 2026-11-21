import type { ProductData } from "@/services/product.service";

export const SHARE_COMPANY_NAME = "Madhuram Motors";
export const SHARE_TAGLINE = "Car Diagnostic Solution";

/** What a customer is allowed to see — nothing else from ProductData ever reaches the preview, the
 *  WhatsApp text or the PDF (purchase price, dealer, serials and all stock information stay internal). */
export interface CustomerProduct {
  id: number;
  name: string;
  description: string | null;
  features: string[];
  sellingPrice: number | null;
}

const hasValue = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
// Lines starting with "-", "•" or "*" in the description are treated as a feature/spec list.
const BULLET_RE = /^\s*[-•*]\s+/;

/**
 * Explicit WHITELIST mapping — mirrors backend services/productShare.service.js#toCustomerProduct so
 * the preview and PDF always match. Empty fields become null/[] and are not rendered.
 */
export const toCustomerProduct = (p: ProductData): CustomerProduct => {
  const lines = hasValue(p.description)
    ? String(p.description).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [];
  const features = lines.filter((l) => BULLET_RE.test(l)).map((l) => l.replace(BULLET_RE, ""));
  const description = lines.filter((l) => !BULLET_RE.test(l)).join("\n");
  const price = hasValue(p.sellingPrice) ? Number(p.sellingPrice) : null;

  return {
    id: p.id,
    name: p.name,
    description: description || null,
    features,
    sellingPrice: price !== null && price > 0 ? price : null,
  };
};

export const formatSharePrice = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const DIVIDER = "━━━━━━━━━━━━━━━━━━";

/** WhatsApp product message — uses WhatsApp's own formatting (*bold*, _italic_) and sections
 *  separated by dividers, so it reads like a catalogue card rather than a plain text dump. */
export const buildProductShareMessage = (cp: CustomerProduct): string => {
  const lines: string[] = [
    `🚘 *${SHARE_COMPANY_NAME.toUpperCase()}*`,
    `_${SHARE_TAGLINE}_`,
    DIVIDER,
    "",
    `🛠️ *${cp.name}*`,
  ];
  if (cp.sellingPrice !== null) lines.push("", `💰 *Price:* *${formatSharePrice(cp.sellingPrice)}*`, "✅ 100% Genuine Product");
  if (cp.description) lines.push("", "📝 *About this product*", cp.description);
  if (cp.features.length) {
    lines.push("", "✨ *Key Features*");
    cp.features.forEach((f) => lines.push(`   ✔️ ${f}`));
  }
  lines.push(
    "",
    DIVIDER,
    "📞 *Contact us for more details or to place your order.*",
    "",
    `🙏 Thank you for choosing *${SHARE_COMPANY_NAME}*!`
  );
  return lines.join("\n");
};

/** No customer is attached to a product, so this opens WhatsApp's own contact picker with the
 *  message ready. api.whatsapp.com/send, not wa.me — see courierShare.ts for why. */
export const getProductWhatsAppUrl = (cp: CustomerProduct) =>
  `https://api.whatsapp.com/send?text=${encodeURIComponent(buildProductShareMessage(cp))}`;

/** Kept in sync with backend productShare.service.js#productShareFileBase. */
export const productShareFileName = (cp: CustomerProduct) =>
  `${cp.name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "Product"}_Madhuram-Motors.pdf`;
