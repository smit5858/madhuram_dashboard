import httpService from "./http-service";
import type { LedgerBalance } from "@/shared/utils/ledgerBalance";

export interface SaleItemData {
  id?: number;
  saleId?: number;
  productId: number;
  productName?: string;
  Product?: {
    id: number;
    name: string;
    description?: string;
    productType?: "NON_SERIAL" | "SERIALIZED";
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
  notes?: string | null;
  createdAt?: string;
  creator?: { id: number; name: string };
  Sale?: { id: number; customerName: string; sellingAmount: number; paymentStatus?: string };
}

export interface SaleData {
  id?: number;
  invoiceNumber?: string;
  platform?: string;
  customerId?: number;
  customerName: string;
  customerNumber?: string;
  paymentMethod?: "Cash" | "UPI" | "Card" | "BankTransfer" | "Other";
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
  sellingAmount: number;
  collectedAmount: number;
  pendingAmount?: number;
  refundedAmount?: number;
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
  paymentMethod?: string;
  /** Splits the sale's collected amount across bank accounts — one {bankAccountId, amount} row
   *  per allocation. The same bank account may appear in more than one row (never merged), and
   *  the rows' amounts must not exceed the collected amount. */
  bankPayments?: { bankAccountId: number; amount: number }[];
  city?: string;
  fromAddress?: string;
  pincode?: string;
  sellingAmount: number;
  collectedAmount: number;
  notes?: string;
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

const updateSale = (id: number, data: Partial<SaleData>) =>
  httpService.put<{ success: boolean; message: string; data: SaleData }>(`/sells/${id}`, data);

const deleteSale = (id: number, options?: CancelSaleOptions) =>
  httpService.delete<{ success: boolean; message: string }>(`/sells/${id}`, { data: options });

const exportSales = (format: "pdf" | "excel", filters?: SalesFilters) =>
  httpService.get(`/sells/export`, { params: { ...filters, format }, responseType: "blob",});

const getPayments = (saleId: number) =>
  httpService.get<{ success: boolean; data: PaymentData[] }>(`/sells/${saleId}/payments`);

const recordPayment = (saleId: number, data: { amount: number; method?: string; bankAccountId?: number | null; notes?: string }) =>
  httpService.post<{ success: boolean; message: string; data: SaleData }>(`/sells/${saleId}/payments`, data);

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
  addSaleItem,
  updateSaleItem,
};
