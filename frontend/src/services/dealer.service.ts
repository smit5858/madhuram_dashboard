import httpService from "./http-service";

export interface DealerData {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DealerFilters {
  search?: string;
  status?: "active" | "inactive" | "";
  page?: number;
  limit?: number;
}

export interface DealerListResponse {
  success: boolean;
  data: DealerData[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateDealerPayload {
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

const getDealers = (filters: DealerFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<DealerListResponse>("/dealers", { params: filters, signal: config?.signal });

const createDealer = (data: CreateDealerPayload) =>
  httpService.post<{ success: boolean; message: string; data: DealerData }>("/dealers", data);

const updateDealer = (id: number, data: Partial<CreateDealerPayload & { isActive?: boolean }>) =>
  httpService.put<{ success: boolean; message: string; data: DealerData }>(`/dealers/${id}`, data);

const deleteDealer = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/dealers/${id}`);

export default {
  getDealers,
  createDealer,
  updateDealer,
  deleteDealer,
};
