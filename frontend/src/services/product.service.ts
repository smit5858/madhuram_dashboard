import httpService from "./http-service";
import type { ProductType } from "@/shared/enum/product-type";

export interface DealerRef {
  id: number;
  name: string;
}

/** A stored product photo — fetch the binary with getProductImage (authenticated). */
export interface ProductImageRef {
  id: number;
}

export interface ProductData {
  id: number;
  name: string;
  description: string | null;
  productType: ProductType;
  isActive: boolean;
  /** false for products quick-added from the Sells form without "Save as New Product". */
  isMasterProduct: boolean;
  /** Product photos (up to MAX_PRODUCT_IMAGES), cover first. */
  images?: ProductImageRef[];
  /** Whether at least one product photo has been uploaded. */
  hasImage?: boolean;
  /** Currently on-hand/available count. NON_SERIAL/HARDWARE_ORDER_BASED: quantity - reserved.
   *  SERIALIZED: count of AVAILABLE units. SOFTWARE: null — not applicable, no stock concept. */
  currentStock: number | null;
  reserved: number | null;
  available: number | null;
  /** SERIALIZED only. */
  sold?: number;
  /** SERIALIZED: price of the most recently received unit (individual units can still vary —
   *  see per-unit detail on ProductDetail.units). Null for SOFTWARE (no purchase concept). */
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
  /** Sale line (customer) this unit is assigned to, if any. */
  saleItemId?: number | null;
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

export interface WaitingForSerialLine {
  saleItemId: number;
  saleId: number;
  invoiceNumber: string | null;
  customerName: string | null;
  quantity: number;
}

export interface ProductDetail extends ProductData {
  total?: number;
  /** SERIALIZED only — sales waiting for a serial pick in Courier; they hold AVAILABLE units. */
  waitingForSerial?: WaitingForSerialLine[];
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
  /** SERIALIZED: applied to every unit still in stock (AVAILABLE). NON_SERIAL / HARDWARE_ORDER_BASED: sets the Stock row's price. */
  purchasePrice?: number | null;
  /** For SERIALIZED, applied to every unit still in stock (AVAILABLE). */
  sellingPrice?: number | null;
  dealerId?: number | null;
  /** NON_SERIAL / HARDWARE_ORDER_BASED only — sets the Stock row's on-hand quantity. */
  quantity?: number;
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

export type ProductExportFormat = "pdf" | "excel";

/** Full catalog export — every product in the database (all statuses, zero stock included),
 *  independent of the list's search/filters/pagination. Returns the generated file as a blob. */
const exportProducts = (format: ProductExportFormat) =>
  httpService.get<Blob>("/products/export", { params: { format }, responseType: "blob" });

/** Customer-facing product catalogue card PDF (Share action) — backend whitelists customer-safe fields only. */
const downloadProductSharePdf = (id: number, price?: number) =>
  httpService.get<Blob>(`/products/${id}/share.pdf`, {
    // Optional share-only price override (never saved); 0 hides the price.
    params: price !== undefined ? { price } : undefined,
    responseType: "blob",
  });

/** Max photos per product — kept in sync with backend productImage.service.js#MAX_IMAGES_PER_PRODUCT. */
export const MAX_PRODUCT_IMAGES = 4;

type ProductImagesResponse = { success: boolean; message: string; data: { images: ProductImageRef[] } };

/** One product photo as a blob — authenticated, so it can't be a plain <img src> URL. */
const getProductImage = (productId: number, imageId: number) =>
  httpService.get<Blob>(`/products/${productId}/images/${imageId}`, { responseType: "blob" });

/** Adds one photo (max MAX_PRODUCT_IMAGES). Send a JPEG/PNG blob (see pages/products/utils/productImage.ts). */
const uploadProductImage = (productId: number, image: Blob) =>
  httpService.post<ProductImagesResponse>(`/products/${productId}/images`, image, {
    headers: { "Content-Type": image.type || "image/jpeg" },
  });

/** Makes this photo the cover (first) one — used as the share card / PDF hero. */
const setProductCoverImage = (productId: number, imageId: number) =>
  httpService.put<ProductImagesResponse>(`/products/${productId}/images/${imageId}/cover`);

const deleteProductImage = (productId: number, imageId: number) =>
  httpService.delete<ProductImagesResponse>(`/products/${productId}/images/${imageId}`);

/** Products_Export_2026-11-18.xlsx — kept in sync with backend productExport.service.js#productExportFileBase. */
export const productExportFileName = (format: ProductExportFormat) => {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `Products_Export_${date}.${format === "pdf" ? "pdf" : "xlsx"}`;
};

export default {
  exportProducts,
  downloadProductSharePdf,
  getProductImage,
  uploadProductImage,
  setProductCoverImage,
  deleteProductImage,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
