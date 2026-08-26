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
  /** Currently on-hand/available count. NON_SERIAL: quantity - reserved. SERIALIZED: count of AVAILABLE units. */
  currentStock: number;
  reserved: number;
  available: number;
  /** SERIALIZED only. */
  sold?: number;
  /** NON_SERIAL only — varies per unit for SERIALIZED, so never shown at product level. */
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

export interface ProductDetail extends ProductData {
  total?: number;
  units?: SerialUnitDetail[];
}

export interface ProductFilters {
  search?: string;
  productType?: ProductType | "";
  status?: "active" | "inactive" | "";
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
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
  /** NON_SERIAL only. */
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
