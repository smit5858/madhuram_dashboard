import httpService from "./http-service";
import type { DealerRef, CreateUnitInput } from "./product.service";

export type SerialStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "RETURNED" | "DAMAGED" | "LOST";

export interface SerialUnitData {
  id: number;
  productId: number;
  productName?: string | null;
  serialNumber: string;
  status: SerialStatus;
  purchasePrice: number | null;
  sellingPrice: number | null;
  purchaseDate: string | null;
  dealer: DealerRef | null;
  receivedAt?: string | null;
  soldAt?: string | null;
  returnedAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  // Populated on the single-unit lookup (getSerialById) once the unit has sold.
  sellingDate?: string | null;
  customerName?: string | null;
  invoiceNumber?: string | null;
}

export interface SerialFilters {
  productId?: number;
  status?: SerialStatus;
  serialNumber?: string;
}

export interface ReceiveNonSerialPayload {
  productId: number;
  quantity: number;
  purchasePrice?: number;
  dealerId?: number;
  purchaseDate?: string;
  notes?: string;
}

export interface ReceiveSerializedPayload {
  productId: number;
  units: CreateUnitInput[];
  notes?: string;
}

const getSerials = (filters: SerialFilters, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: SerialUnitData[] }>("/inventory/serials", {
    params: filters,
    signal: config?.signal,
  });

const getSerialById = (id: number, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: SerialUnitData }>(`/inventory/serials/${id}`, {
    signal: config?.signal,
  });

const receiveStock = (data: ReceiveNonSerialPayload | ReceiveSerializedPayload) =>
  httpService.post<{ success: boolean; message: string; data: unknown }>("/inventory/receive", data);

const updateSerialStatus = (id: number, data: { status: "AVAILABLE" | "DAMAGED" | "LOST"; notes?: string }) =>
  httpService.put<{ success: boolean; message: string; data: SerialUnitData }>(`/inventory/serials/${id}`, data);

export default {
  getSerials,
  getSerialById,
  receiveStock,
  updateSerialStatus,
};
