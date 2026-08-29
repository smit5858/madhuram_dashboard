import httpService from "./http-service";

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
  method?: "Cash" | "UPI" | "Card" | "COD" | "BankTransfer" | "Other" | null;
  notes?: string | null;
  createdAt?: string;
  creator?: { id: number; name: string };
  Sale?: { id: number; customerName: string; sellingAmount: number; paymentStatus?: string };
}

export interface PaymentsFilters {
  search?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export interface SaleData {
  id?: number;
  invoiceNumber?: string;
  platform?: string;
  customerId?: number;
  customerName: string;
  customerNumber?: string;
  paymentMethod?: "Cash" | "UPI" | "Card" | "COD" | "BankTransfer" | "Other";
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
}

export interface CreateSalePayload {
  platform?: string;
  customerId?: number;
  customerName: string;
  customerNumber?: string;
  paymentMethod?: string;
  city?: string;
  fromAddress?: string;
  pincode?: string;
  sellingAmount: number;
  collectedAmount: number;
  notes?: string;
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

const getAllPayments = (filters?: PaymentsFilters) =>
  httpService.get<{ success: boolean; data: PaymentData[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    "/sells/payments",
    { params: filters }
  );

const recordPayment = (saleId: number, data: { amount: number; method?: string; notes?: string }) =>
  httpService.post<{ success: boolean; message: string; data: SaleData }>(`/sells/${saleId}/payments`, data);

export default {
  getSales,
  getSellsTotals,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
  exportSales,
  getPayments,
  getAllPayments,
  recordPayment,
};
