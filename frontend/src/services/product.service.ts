import httpService from "./http-service";
import type { ProductType } from "@/shared/enum/product-type";

export interface DealerRef {
  id: number;
  name: string;
}

export interface ProductData {
  id: number;
  name: string;
  description: string | null;
  productType: ProductType;
  isActive: boolean;
  /** false for products quick-added from the Sells form without "Save as New Product". */
  isMasterProduct: boolean;
  /** Currently on-hand/available count. NON_SERIAL/HARDWARE_ORDER_BASED: quantity - reserved.
   *  SERIALIZED: count of AVAILABLE units. SOFTWARE: null — not applicable, no stock concept. */
  currentStock: number | null;
  reserved: number | null;
  available: number | null;
  /** SERIALIZED only. */
  sold?: number;
  /** Varies per unit for SERIALIZED (never shown at product level); not applicable for SOFTWARE. */
  purchasePrice: number | null;
  sellingPrice: number | null;
  dealer: DealerRef | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SerialUnitDetail {
  id: number;
  serialNumber: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "RETURNED" | "DAMAGED" | "LOST";
  purchasePrice: number | null;
  purchaseDate: string | null;
  dealer: DealerRef | null;
  receivedAt: string | null;
  soldAt: string | null;
  returnedAt: string | null;
  sellingPrice: number | null;
  sellingDate: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
}

export interface PurchaseHistoryEntry {
  id: number;
  purchaseDate: string | null;
  quantity: number;
  purchaseAmount: number | null;
}

export interface ProductDetail extends ProductData {
  total?: number;
  units?: SerialUnitDetail[];
  /** NON_SERIAL only — one row per purchase date, merging same-day restock batches. */
  purchases?: PurchaseHistoryEntry[];
}

export interface ProductFilters {
  search?: string;
  productType?: ProductType | "";
  status?: "active" | "inactive" | "";
  /** Excludes products quick-added from the Sells form without "Save as New Product" — those
   *  are scoped to one sale and shouldn't clutter the master product catalog. */
  masterOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface ProductListResponse {
  success: boolean;
  data: ProductData[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateUnitInput {
  serialNumber: string;
  purchasePrice?: number;
  sellingPrice?: number;
  purchaseDate?: string;
  dealerId?: number;
}

export interface CreateProductPayload {
  name: string;
  description?: string;
  productType: ProductType;
  // NON_SERIAL
  quantity?: number;
  purchasePrice?: number;
  sellingPrice?: number;
  dealerId?: number;
  purchaseDate?: string;
  // SERIALIZED
  units?: CreateUnitInput[];
  /** Defaults to true server-side. Sent as `false` only by the Sells quick-add modal when
   *  "Save as New Product" is unchecked — the product backs that one sale only and is left
   *  out of the master product catalog. */
  isMasterProduct?: boolean;
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
  /** Any type except SERIALIZED (whose pricing is per sale item). */
  sellingPrice?: number;
  dealerId?: number | null;
}

const getProducts = (filters: ProductFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<ProductListResponse>("/products", { params: filters, signal: config?.signal });

const getProductById = (id: number) =>
  httpService.get<{ success: boolean; data: ProductDetail }>(`/products/${id}`);

const createProduct = (data: CreateProductPayload) =>
  httpService.post<{ success: boolean; message: string; data: ProductDetail }>("/products", data);

const updateProduct = (id: number, data: UpdateProductPayload) =>
  httpService.put<{ success: boolean; message: string; data: ProductData }>(`/products/${id}`, data);

const deleteProduct = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/products/${id}`);

export default {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
