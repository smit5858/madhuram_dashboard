import httpService from "./http-service";

export interface PlatformData {
  id: number;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformFilters {
  status?: "active" | "inactive" | "";
}

const getPlatforms = (filters: PlatformFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: PlatformData[] }>("/platforms", { params: filters, signal: config?.signal });

const createPlatform = (data: { name: string; isActive?: boolean }) =>
  httpService.post<{ success: boolean; message: string; data: PlatformData }>("/platforms", data);

const updatePlatform = (id: number, data: { name?: string; isActive?: boolean }) =>
  httpService.put<{ success: boolean; message: string; data: PlatformData }>(`/platforms/${id}`, data);

const deletePlatform = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/platforms/${id}`);

export default {
  getPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
};
