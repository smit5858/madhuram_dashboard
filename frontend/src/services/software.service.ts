import httpService from "./http-service";
import type { ProductData, ProductListResponse } from "./product.service";

/** Software products use the product model (productType SOFTWARE) under the "/software" permission. */
export interface SoftwareFilters {
  search?: string;
  status?: "active" | "inactive" | "";
  /** Leaves out products quick-added from the Sells form (e.g. "Other"). */
  masterOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface SoftwarePayload {
  name: string;
  description?: string;
  purchasePrice?: number | null;
  sellingPrice?: number | null;
}

export interface UpdateSoftwarePayload extends Partial<SoftwarePayload> {
  isActive?: boolean;
}

const getSoftware = (filters: SoftwareFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<ProductListResponse>("/software", { params: filters, signal: config?.signal });

const createSoftware = (data: SoftwarePayload) =>
  httpService.post<{ success: boolean; message: string; data: ProductData }>("/software", data);

const updateSoftware = (id: number, data: UpdateSoftwarePayload) =>
  httpService.put<{ success: boolean; message: string; data: ProductData }>(`/software/${id}`, data);

const deleteSoftware = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/software/${id}`);

export default {
  getSoftware,
  createSoftware,
  updateSoftware,
  deleteSoftware,
};
