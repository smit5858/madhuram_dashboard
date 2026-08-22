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
  };
  quantity: number;
  sellingPrice: number;
  fulfillmentStatus?: "FULFILLED" | "PARTIAL" | "OUT_OF_STOCK";
  shortageQuantity?: number;
  availableWas?: number;
  fulfilled?: number;
  shortage?: number;
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
  status?: "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED";
  notes?: string;
  createdBy?: number;
  items?: SaleItemData[];
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
  }>;
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
}


const getSales = (filters: SalesFilters, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: SaleData[], meta: { page: number; totalPages: number; total: number }; }>("/sells", { params: filters, signal: config?.signal });

const getSaleById = (id: number) =>
  httpService.get<{ success: boolean; data: SaleData }>(`/sells/${id}`);

const createSale = (data: CreateSalePayload) =>
  httpService.post<{ success: boolean; message: string; data: SaleData }>("/sells", data);

const updateSale = (id: number, data: Partial<SaleData>) =>
  httpService.put<{ success: boolean; message: string; data: SaleData }>(`/sells/${id}`, data);

const deleteSale = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/sells/${id}`);

const exportSales = (format: "pdf" | "excel", filters?: SalesFilters) =>
  httpService.get(`/sells/export`, { params: { ...filters, format }, responseType: "blob",});

export default {
  getSales,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
  exportSales
};
