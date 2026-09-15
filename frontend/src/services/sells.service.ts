import httpService from "./http-service";
import type { LedgerBalance } from "@/shared/utils/ledgerBalance";
import type { ProductType } from "@/shared/enum/product-type";

export interface SaleItemData {
  id?: number;
  saleId?: number;
  productId: number;
  productName?: string;
  Product?: {
    id: number;
    name: string;
    description?: string;
    productType?: ProductType;
  };
  quantity: number;
  sellingPrice: number;
  fulfillmentStatus?: "PENDING" | "PARTIALLY_FULFILLED" | "FULFILLED" | "BACKORDERED" | "CANCELLED";
  allocatedQuantity?: number;
  fulfilledQuantity?: number;
  backorderedQuantity?: number;
  returnedQuantity?: number;
  /** SerialUnit rows tied to this line item (SaleItem.hasMany(SerialUnit)) — RESERVED/SOLD
   *  units are the ones currently assigned to this order's shipment. */
  SerialUnits?: { id: number; serialNumber: string; status: string }[];
}

export interface PaymentData {
  id: number;
  saleId: number;
  amount: number;
  method?: "Cash" | "UPI" | "Card" | "BankTransfer" | "Other" | null;
  bankAccountId?: number | null;
  bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } | null;
  /** Optional transaction/reference number for this specific payment — most useful for UPI/BankTransfer. */
  transactionRef?: string | null;
  notes?: string | null;
  createdAt?: string;
  creator?: { id: number; name: string };
  Sale?: { id: number; customerName: string; sellingAmount: number; paymentStatus?: string };
}

/** One entry in a multi-payment-method write payload — see PAYMENT_METHOD_OPTIONS/PaymentsEditor.
 *  A sale/order can be paid for with more than one of these at once (e.g. part Cash, part UPI). */
export interface PaymentEntry {
  method: "Cash" | "UPI" | "Card" | "BankTransfer" | "Other";
  amount: number;
  bankAccountId?: number | null;
  transactionRef?: string | null;
  notes?: string | null;
}

export interface SaleData {
  id?: number;
  invoiceNumber?: string;
  platform?: string;
  customerId?: number;
  customerName: string;
  customerNumber?: string;
  /** Read-only quick-glance summary of the sale's Payment rows: null (nothing collected yet), the
   *  single method used, or "Multiple" once more than one distinct method contributed to
   *  collectedAmount. The itemized breakdown always lives in `payments`. */
  paymentMethod?: "Cash" | "UPI" | "Card" | "BankTransfer" | "Other" | "Multiple";
  /** Legacy single-account fields — superseded by `bankPayments` (amount per bank), kept for
   *  backend responses that still mirror the first allocation's bank. */
  bankAccountId?: number | null;
  bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } | null;
  /** The sale's collected amount, split across bank accounts — each row is one (bank account,
   *  amount) allocation, and the same bank account can appear more than once (rows are never
   *  merged). `id`/`bankAccount` are populated on the hydrated read shape and omitted on the
   *  write shape sent on create/update. */
  bankPayments?: { id?: number; bankAccountId: number; amount: number; bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } }[];
  city?: string;
  fromAddress?: string;
  pincode?: string;
  /** Who this order is being sent to/handled by. Defaults to "Madhuram Motor"; editable when
   *  an order is sent by/to another party. */
  to?: string;
  /** Optional courier company chosen at sale-entry time — seeds Courier.courierName on the
   *  record(s) created for this sale; still freely editable per-record from the Courier module. */
  courierName?: string;
  /** Shipping/courier charge entered on this sale's own form — a plain additive amount, never
   *  negative. Distinct from the monthly Courier Charge aggregate on the Couriers page. */
  courierCharge?: number;
  sellingAmount: number;
  collectedAmount: number;
  pendingAmount?: number;
  refundedAmount?: number;
  /** The date this sale actually happened on — user-editable, defaults to today at entry time.
   *  Independent of createdAt (the record's own insert timestamp, which never changes on edit). */
  saleDate?: string;
  status?: "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED";
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED";
  fulfillmentStatus?: "PENDING" | "PARTIALLY_FULFILLED" | "FULFILLED" | "BACKORDERED" | "CANCELLED";
  /** Whether this sale currently has at least one active (non-cancelled) Courier record —
   *  read-only, computed by the backend (see sells.controller.js#attachCourierEntryFlags). Used
   *  to initialize the "Create Courier Entry" checkbox correctly when opening Edit Sell. */
  hasCourierEntries?: boolean;
  /** Write-only on update: flips whether the sale should have Courier record(s) for its items —
   *  created/cancelled to match, without duplicating an existing one (see
   *  orderService.setCourierEntryForSale). Omit to leave courier entries untouched. */
  createCourierEntry?: boolean;
  notes?: string;
  createdBy?: number;
  items?: SaleItemData[];
  payments?: PaymentData[];
  creator?: { id: number; name: string; email: string };
  customer?: {
    id: number;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    city?: string;
    pincode?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  /** The customer's live running account balance (advance/pending), carried across ALL of their
   *  sales — not this sale's own pendingAmount. Null when the sale has no linked customer. See
   *  backend sells.controller.js#attachLedgerBalances. */
  customerLedgerBalance?: LedgerBalance | null;
}

export interface CreateSalePayload {
  platform?: string;
  customerId?: number;
  customerName: string;
  customerNumber?: string;
  /** The order's initial payment(s) — one entry per method (e.g. part Cash, part UPI). Omit or
   *  leave empty for an order with nothing collected yet. collectedAmount is derived as the sum. */
  payments?: PaymentEntry[];
  city?: string;
  fromAddress?: string;
  pincode?: string;
  /** Who this order is being sent to/handled by. Defaults to "Madhuram Motor"; editable when
   *  an order is sent by/to another party. */
  to?: string;
  /** Optional courier company chosen at sale-entry time — seeds Courier.courierName on the
   *  record(s) created for this sale; still freely editable per-record from the Courier module. */
  courierName?: string;
  /** Shipping/courier charge entered on this sale's own form — a plain additive amount, never
   *  negative. Distinct from the monthly Courier Charge aggregate on the Couriers page. */
  courierCharge?: number;
  sellingAmount: number;
  /** Derived from `payments` — kept for callers (e.g. a Lead's placeholder sale) that don't
   *  collect anything at creation and never send `payments` at all. */
  collectedAmount: number;
  notes?: string;
  /** The date this sale actually happened on. Defaults to today on the backend when omitted. */
  saleDate?: string;
  /** Whether to create a Courier record for each order line after the sale is created.
   *  Defaults to true on the backend when omitted. */
  createCourierEntry?: boolean;
  items: Array<{
    productId: number;
    quantity: number;
    sellingPrice: number;
    serialNumbers?: string[];
  }>;
}

export interface CancelSaleOptions {
  /** Skips restocking/releasing the units back to available — use when they're not resellable. */
  defective?: boolean;
  reason?: string;
}

export interface SellsTotalsData {
  totalSellingAmount: number;
  totalCollectedAmount: number;
  totalPendingAmount: number;
  totalSalesCount: number;
  scope?: string;
}

export interface SalesFilters {
  platform?: string;
  paymentMethod?: string;
  status?: string;
  city?: string;
  customerName?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
  userId?: number | string;
  createdBy?: number | string;
}


const getSales = (filters: SalesFilters, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: SaleData[], meta: { page: number; totalPages: number; total: number }; }>("/sells", { params: filters, signal: config?.signal });

const getSellsTotals = (filters?: SalesFilters) =>
  httpService.get<{ success: boolean; data: SellsTotalsData }>("/sells/totals", { params: filters });

export interface SalesDailyTrendRow {
  date: string;
  totalSelling: number;
  salesCount: number;
}

const getSalesDailyTrend = (params: { startDate?: string; endDate?: string }, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: SalesDailyTrendRow[] }>("/sells/daily-trend", {
    params,
    signal: config?.signal,
  });

const getSaleById = (id: number) =>
  httpService.get<{ success: boolean; data: SaleData }>(`/sells/${id}`);

const createSale = (data: CreateSalePayload) =>
  httpService.post<{ success: boolean; message: string; data: SaleData }>("/sells", data);

const updateSale = (id: number, data: Omit<Partial<SaleData>, "payments"> & { payments?: PaymentEntry[] }) =>
  httpService.put<{ success: boolean; message: string; data: SaleData }>(`/sells/${id}`, data);

const deleteSale = (id: number, options?: CancelSaleOptions) =>
  httpService.delete<{ success: boolean; message: string }>(`/sells/${id}`, { data: options });

const exportSales = (format: "pdf" | "excel", filters?: SalesFilters) =>
  httpService.get(`/sells/export`, { params: { ...filters, format }, responseType: "blob",});

const getPayments = (saleId: number) =>
  httpService.get<{ success: boolean; data: PaymentData[] }>(`/sells/${saleId}/payments`);

const recordPayment = (saleId: number, data: { amount: number; method?: string; bankAccountId?: number | null; transactionRef?: string; notes?: string }) =>
  httpService.post<{ success: boolean; message: string; data: SaleData }>(`/sells/${saleId}/payments`, data);

// Records one or more new payments against an existing sale in one call — e.g. the remaining
// balance collected as part Cash/part UPI at once. See PaymentEntry.
const recordPayments = (saleId: number, payments: PaymentEntry[]) =>
  httpService.post<{ success: boolean; message: string; data: SaleData }>(`/sells/${saleId}/payments`, { payments });

// Edits one existing payment entry already recorded against a sale (amount/method/bank
// account/ref) — e.g. correcting a mistyped amount. Returns the sale with recomputed totals.
const updatePayment = (
  saleId: number,
  paymentId: number,
  data: { amount?: number; method?: string; bankAccountId?: number | null; transactionRef?: string | null; notes?: string | null }
) => httpService.put<{ success: boolean; message: string; data: SaleData }>(`/sells/${saleId}/payments/${paymentId}`, data);

// Removes one existing payment entry outright. Returns the sale with recomputed totals.
const deletePayment = (saleId: number, paymentId: number) =>
  httpService.delete<{ success: boolean; message: string; data: SaleData }>(`/sells/${saleId}/payments/${paymentId}`);

// Adds a new product line to an existing sale — lets a Sales member finish filling in a sale
// after the fact (e.g. a Lead-originated sale that started with just one placeholder line).
const addSaleItem = (
  saleId: number,
  data: { productId: number; quantity: number; sellingPrice: number; serialNumbers?: string[] }
) => httpService.post<{ success: boolean; message: string; data: SaleItemData }>(`/sells/${saleId}/items`, data);

// Edits an existing line's price and/or quantity — the other half of addSaleItem above.
const updateSaleItem = (saleId: number, itemId: number, data: { quantity?: number; sellingPrice?: number }) =>
  httpService.put<{ success: boolean; message: string; data: SaleItemData }>(`/sells/${saleId}/items/${itemId}`, data);

export default {
  getSales,
  getSellsTotals,
  getSalesDailyTrend,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
  exportSales,
  getPayments,
  recordPayment,
  recordPayments,
  updatePayment,
  deletePayment,
  addSaleItem,
  updateSaleItem,
};
