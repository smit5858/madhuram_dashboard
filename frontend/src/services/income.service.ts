import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";
import type { PaymentMethod } from "@/shared/constants/paymentMethod";

export type IncomeStatus = "PENDING" | "APPROVED";

export interface IncomeEntryData {
    id?: number;
    entryType?: "INCOME";
    category?: string;
    customerId?: number | null;
    customerName: string;
    customerPhone?: string | null;
    productName?: string | null;
    serialNumber?: string | null;
    amount: number | string;
    entryDate: string;
    paymentMethod?: PaymentMethod | null;
    bankName?: string | null;
    description?: string | null;
    status?: IncomeStatus;
    creator?: { id: number; name: string } | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface IncomeFilters {
    search?: string;
    paymentMethod?: PaymentMethod | "";
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

export interface IncomeTotalsData {
    totalIncome: number;
    totalCount: number;
}

export interface DailyBalanceData {
    id: number;
    date: string;
    openingBalance: number | string;
    totalIn: number | string;
    totalOut: number | string;
    closingBalance: number | string;
}

export interface UpdateBalancePayload {
    password: string;
    date?: string;
    closingBalance: number;
}

const getIncomeEntries = (params?: IncomeFilters, config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: IncomeEntryData[]; meta: PaginationMeta }>("/income", {
        params,
        signal: config?.signal,
    });

const getIncomeTotals = (params?: IncomeFilters, config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: IncomeTotalsData }>("/income/totals", {
        params,
        signal: config?.signal,
    });

const getDailyBalances = (
    params?: { page?: number; limit?: number; startDate?: string; endDate?: string },
    config?: { signal?: AbortSignal }
) =>
    httpService.get<{ success: boolean; data: DailyBalanceData[]; meta: PaginationMeta }>("/income/daily-balances", {
        params,
        signal: config?.signal,
    });

const getIncomeById = (id: number) =>
    httpService.get<{ success: boolean; data: IncomeEntryData }>(`/income/${id}`);

const createIncomeEntry = (data: IncomeEntryData) =>
    httpService.post<{ success: boolean; message: string; data: IncomeEntryData }>("/income", data);

const updateIncomeEntry = (id: number, data: IncomeEntryData) =>
    httpService.put<{ success: boolean; message: string; data: IncomeEntryData }>(`/income/${id}`, data);

const deleteIncomeEntry = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/income/${id}`);

const updateBalance = (data: UpdateBalancePayload) =>
    httpService.post<{ success: boolean; message: string; data: DailyBalanceData }>("/income/update-balance", data);

const approveIncomeEntry = (id: number) =>
    httpService.put<{ success: boolean; message: string; data: IncomeEntryData }>(`/income/${id}/approve`, {});

export default {
    getIncomeEntries,
    getIncomeTotals,
    getDailyBalances,
    getIncomeById,
    createIncomeEntry,
    updateIncomeEntry,
    deleteIncomeEntry,
    updateBalance,
    approveIncomeEntry,
};
