import type { CourierData } from "../../services/courier.service";
import { DELIVERY_MODE_LABEL } from "../constants/deliveryMode";

/** Normalizes a raw Indian mobile number into the digits-only, country-code-prefixed form
 *  wa.me expects (e.g. "8264858795" -> "918264858795"). Returns null if the number doesn't
 *  look like a valid Indian mobile number once normalized, so callers can block sharing
 *  instead of opening WhatsApp with a broken link. */
export const normalizeIndianMobile = (raw: string | null | undefined): string | null => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;

  // Strip a leading trunk "0" (e.g. "08264858795") before checking for a country code, so it
  // isn't mistaken for part of one.
  const trunkStripped = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;

  let national: string;
  if (trunkStripped.length === 10) {
    national = trunkStripped;
  } else if (trunkStripped.length === 12 && trunkStripped.startsWith("91")) {
    national = trunkStripped.slice(2);
  } else if (trunkStripped.length === 13 && trunkStripped.startsWith("091")) {
    national = trunkStripped.slice(3);
  } else {
    return null;
  }

  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `91${national}`;
};

/** Courier `entryDate` is a DATEONLY string ("YYYY-MM-DD") — reformatted by splitting the
 *  string directly (not via `new Date()`) so no timezone conversion can shift the calendar day. */
export const formatCourierShareDate = (entryDate: string | null | undefined): string => {
  if (!entryDate) return "N/A";
  const [year, month, day] = entryDate.split("-");
  if (!year || !month || !day) return entryDate;
  return `${day}-${month}-${year}`;
};

/** "Product Name(qty)" list for the products a courier share message should mention. When the
 *  courier belongs to a multi-product shipment group, every sibling sharing that same
 *  `shipmentGroupId` is included (matches what CourierViewModal's "Products in this Order"
 *  table shows as actually going out together); otherwise it falls back to this record alone. */
export const getCourierProductsLine = (courier: CourierData, siblings?: CourierData[]): string => {
  const grouped = courier.shipmentGroupId
    ? (siblings || []).filter((s) => s.shipmentGroupId === courier.shipmentGroupId)
    : [];
  const items = grouped.length > 0 ? grouped : [courier];

  return items
    .map((item) => `${item.productName || "N/A"}(${item.quantity ?? 1})`)
    .join(", ");
};

const getCourierTypeLabel = (courier: CourierData): string => {
  if (courier.deliveryMode) return DELIVERY_MODE_LABEL[courier.deliveryMode];
  return courier.freePickup ? "Free" : "Paid";
};

/** Builds the exact WhatsApp share message text for a courier record, per the fixed template
 *  used across the Courier module — every value pulled from the courier record, nothing hardcoded. */
export const buildCourierShareMessage = (courier: CourierData, siblings?: CourierData[]): string => {
  const cityLine = courier.pincode ? `${courier.city || "N/A"} (${courier.pincode})` : courier.city || "N/A";
  const charge = Number(courier.charge || 0).toFixed(2);

  return [
    "📦 Courier Details",
    "",
    `📅 Date: ${formatCourierShareDate(courier.entryDate)}`,
    `👤 Customer: ${courier.customerName || courier.name || "N/A"}`,
    `📞 Mobile: ${courier.mobileNo || courier.phone || "N/A"}`,
    `🏠 Address: ${courier.address || "N/A"}`,
    `🏙️ City: ${cityLine}`,
    "📍 From: MADHURAM MOTORS",
    "",
    "📦 Products:",
    getCourierProductsLine(courier, siblings),
    "",
    `🚚 Type: ${getCourierTypeLabel(courier)}`,
    `🏢 Courier Company: ${courier.courierName || "N/A"}`,
    `💰 Charges: ₹${charge}`,
    `🔍 Tracking ID: ${courier.trackId || "N/A"}`,
    "",
    "— Shared from Courier System",
  ].join("\n");
};

/** Resolves the wa.me link to open for sharing this courier, or null when the customer's
 *  mobile number is missing/invalid (callers should show an error instead of opening WhatsApp). */
export const getCourierShareUrl = (courier: CourierData, siblings?: CourierData[]): string | null => {
  const phone = normalizeIndianMobile(courier.mobileNo || courier.phone);
  if (!phone) return null;

  const message = buildCourierShareMessage(courier, siblings);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};
