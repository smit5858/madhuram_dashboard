import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";

export type PendingBillStatus = "PENDING" | "APPROVED";

export interface PendingBillData {
    id?: number;
    name: string;
    dealerName?: string | null;
    amount: number | string;
    billDate: string;
    description?: string | null;
    status?: PendingBillStatus;
    approvedBy?: number | null;
    approvedAt?: string | null;
    creator?: { id: number; name: string } | null;
    approver?: { id: number; name: string } | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface PendingBillFilters {
    search?: string;
    status?: PendingBillStatus | "";
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

const getPendingBills = (params?: PendingBillFilters, config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: PendingBillData[]; meta: PaginationMeta }>("/pending-bills", {
        params,
        signal: config?.signal,
    });

const getPendingBillById = (id: number) =>
    httpService.get<{ success: boolean; data: PendingBillData }>(`/pending-bills/${id}`);

const createPendingBill = (data: PendingBillData) =>
    httpService.post<{ success: boolean; message: string; data: PendingBillData }>("/pending-bills", data);

const updatePendingBill = (id: number, data: PendingBillData) =>
    httpService.put<{ success: boolean; message: string; data: PendingBillData }>(`/pending-bills/${id}`, data);

const deletePendingBill = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/pending-bills/${id}`);

const approvePendingBill = (id: number) =>
    httpService.post<{ success: boolean; message: string; data: PendingBillData }>(`/pending-bills/${id}/approve`, {});

export default {
    getPendingBills,
    getPendingBillById,
    createPendingBill,
    updatePendingBill,
    deletePendingBill,
    approvePendingBill,
};
