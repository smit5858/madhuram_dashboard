import type { SaleData } from "@/services/sells.service";
import { formatPhoneDisplay } from "@/shared/utils/phone";
import { normalizeIndianMobile } from "@/shared/utils/courierShare";

export const INVOICE_COMPANY_NAME = "Madhuram Motors";
export const INVOICE_TAGLINE = "Car Diagnostic Solution";

type PaymentStatus = NonNullable<SaleData["paymentStatus"]>;

/** Kept in sync with backend services/saleInvoice.service.js#PAYMENT_STATUS_LABELS. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: "PAID",
  PARTIALLY_PAID: "PARTIALLY PAID",
  UNPAID: "UNPAID",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY REFUNDED",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = { BankTransfer: "Bank Transfer" };

export interface SaleInvoiceItem {
  name: string;
  quantity: number;
  /** null when the line has no price recorded — the amount cell is then hidden, not shown as ₹0. */
  unitPrice: number | null;
}

export interface SaleInvoicePayment {
  method: string | null;
  amount: number;
  date: string | null;
  reference: string | null;
}

export interface SaleInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customerName: string | null;
  customerPhone: string | null;
  shipTo: { address: string | null; city: string | null; pincode: string | null };
  isCancelled: boolean;
  items: SaleInvoiceItem[];
  sellingAmount: number;
  courierCharge: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  refundedAmount: number;
  paymentStatus: PaymentStatus;
  payments: SaleInvoicePayment[];
}

const hasValue = (v: unknown): v is string | number => v !== null && v !== undefined && String(v).trim() !== "";
const toAmount = (v: unknown) => Number(v) || 0;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 31, 2026" — same as the backend's dayjs "MMM D, YYYY". A DATEONLY "YYYY-MM-DD" (saleDate)
 *  is split directly so no timezone conversion can shift the calendar day (see formatDisplayDate). */
const formatInvoiceDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${MONTHS[Number(dateOnly[2]) - 1]} ${Number(dateOnly[3])}, ${dateOnly[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/**
 * Display model for the Share → invoice receipt. Mirrors backend saleInvoice.service.js#buildInvoiceModel
 * so the on-screen preview and the downloaded PDF always agree: empty fields become null (and are
 * not rendered), cancelled lines are excluded, total = sellingAmount + courierCharge (the same order
 * total the backend measures payments against), pending = total - paid, floored at 0.
 */
export const buildSaleInvoice = (sale: SaleData): SaleInvoice => {
  const sellingAmount = toAmount(sale.sellingAmount);
  const courierCharge = toAmount(sale.courierCharge);
  const totalAmount = sellingAmount + courierCharge;
  const paidAmount = toAmount(sale.collectedAmount);
  const pendingAmount = Math.max(0, totalAmount - paidAmount);
  const paymentStatus: PaymentStatus =
    sale.paymentStatus ?? (paidAmount <= 0 ? "UNPAID" : pendingAmount > 0 ? "PARTIALLY_PAID" : "PAID");

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
      method: p.method ? PAYMENT_METHOD_LABELS[p.method] || p.method : null,
      amount: toAmount(p.amount),
      date: formatInvoiceDate(p.createdAt),
      reference: hasValue(p.transactionRef) ? String(p.transactionRef).trim() : null,
    }));

  // Ship To — the sale's own address fields first (what was entered on the sale), else the linked customer's.
  const pick = (own?: string | null, fallback?: string | null) =>
    hasValue(own) ? String(own).trim() : hasValue(fallback) ? String(fallback).trim() : null;

  return {
    invoiceNumber: hasValue(sale.invoiceNumber) ? sale.invoiceNumber : null,
    invoiceDate: formatInvoiceDate(sale.saleDate || sale.createdAt),
    customerName: hasValue(sale.customerName) ? sale.customerName : sale.customer?.name || null,
    customerPhone: hasValue(sale.customerNumber) ? sale.customerNumber : sale.customer?.phone || null,
    shipTo: {
      address: pick(sale.fromAddress, sale.customer?.address),
      city: pick(sale.city, sale.customer?.city),
      pincode: pick(sale.pincode, sale.customer?.pincode),
    },
    isCancelled: sale.status === "CANCELLED",
    items,
    sellingAmount,
    courierCharge,
    totalAmount,
    paidAmount,
    pendingAmount,
    refundedAmount: toAmount(sale.refundedAmount),
    paymentStatus,
    payments,
  };
};

export const formatInvoiceAmount = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Plain-text receipt for WhatsApp — same fields and same hide-when-empty rules as the PDF. */
export const buildInvoiceShareMessage = (inv: SaleInvoice): string => {
  const lines: string[] = [`*${INVOICE_COMPANY_NAME}*`, INVOICE_TAGLINE, ""];
  if (inv.invoiceNumber) lines.push(`Invoice No: ${inv.invoiceNumber}`);
  if (inv.invoiceDate) lines.push(`Date: ${inv.invoiceDate}`);
  if (inv.customerName) lines.push(`Customer: ${inv.customerName}`);
  if (inv.customerPhone) lines.push(`Phone: ${formatPhoneDisplay(inv.customerPhone) || inv.customerPhone}`);
  if (inv.isCancelled) lines.push("", "*This order has been cancelled.*");

  if (inv.items.length) {
    lines.push("", "*Products:*");
    inv.items.forEach((item) => {
      const amount = item.unitPrice !== null ? ` — ${formatInvoiceAmount(item.unitPrice * item.quantity)}` : "";
      lines.push(`• ${item.name} × ${item.quantity}${amount}`);
    });
  }

  lines.push("");
  if (inv.courierCharge > 0) {
    lines.push(`Selling Amount: ${formatInvoiceAmount(inv.sellingAmount)}`);
    lines.push(`Courier Charge: ${formatInvoiceAmount(inv.courierCharge)}`);
  }
  lines.push(`*Total Amount: ${formatInvoiceAmount(inv.totalAmount)}*`);
  lines.push(`Paid Amount: ${formatInvoiceAmount(inv.paidAmount)}`);
  if (inv.pendingAmount > 0) lines.push(`Pending Amount: ${formatInvoiceAmount(inv.pendingAmount)}`);
  if (inv.refundedAmount > 0) lines.push(`Refunded Amount: ${formatInvoiceAmount(inv.refundedAmount)}`);
  lines.push(`Payment Status: *${PAYMENT_STATUS_LABELS[inv.paymentStatus]}*`);

  lines.push("", "Thank you for your business!");
  return lines.join("\n");
};

/** WhatsApp click-to-chat link — opens the customer's chat when their number is valid, otherwise
 *  WhatsApp's own contact picker. api.whatsapp.com/send, not wa.me — see courierShare.ts for why. */
export const getInvoiceWhatsAppUrl = (inv: SaleInvoice): string => {
  const phone = normalizeIndianMobile(inv.customerPhone);
  const text = encodeURIComponent(buildInvoiceShareMessage(inv));
  return phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${text}` : `https://api.whatsapp.com/send?text=${text}`;
};

/** Invoice_INV-0007.pdf — kept in sync with backend saleInvoice.service.js file naming. */
export const invoiceFileName = (inv: SaleInvoice, saleId: number) =>
  `Invoice_${(inv.invoiceNumber || `SALE-${saleId}`).replace(/[^A-Za-z0-9_-]+/g, "-")}.pdf`;
