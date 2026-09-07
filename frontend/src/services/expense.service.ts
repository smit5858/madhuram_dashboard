import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";
import type { PaymentMethod } from "@/shared/constants/paymentMethod";

export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ExpenseEntryData {
    id?: number;
    entryType?: "EXPENSE";
    category?: string;
    customerId?: number | null;
    name: string;
    mobile?: string | null;
    product?: string | null;
    amount: number | string;
    entryDate: string;
    paymentMethod?: PaymentMethod | null;
    bankName?: string | null;
    description?: string | null;
    status?: ExpenseStatus;
    creator?: { id: number; name: string } | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface ExpenseFilters {
    search?: string;
    status?: ExpenseStatus | "";
    page?: number;
    limit?: number;
}

export interface ExpenseTotalsData {
    totalExpense: number;
    totalCount: number;
}

const getExpenseEntries = (params?: ExpenseFilters, config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: ExpenseEntryData[]; meta: PaginationMeta }>("/expense", {
        params,
        signal: config?.signal,
    });

const getExpenseTotals = (config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: ExpenseTotalsData }>("/expense/totals", { signal: config?.signal });

const getExpenseById = (id: number) =>
    httpService.get<{ success: boolean; data: ExpenseEntryData }>(`/expense/${id}`);

const createExpenseEntry = (data: ExpenseEntryData) =>
    httpService.post<{ success: boolean; message: string; data: ExpenseEntryData }>("/expense", data);

const updateExpenseEntry = (id: number, data: ExpenseEntryData) =>
    httpService.put<{ success: boolean; message: string; data: ExpenseEntryData }>(`/expense/${id}`, data);

const deleteExpenseEntry = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/expense/${id}`);

const approveExpenseEntry = (id: number) =>
    httpService.put<{ success: boolean; message: string; data: ExpenseEntryData }>(`/expense/${id}/approve`, {});

const rejectExpenseEntry = (id: number) =>
    httpService.put<{ success: boolean; message: string; data: ExpenseEntryData }>(`/expense/${id}/reject`, {});

export default {
    getExpenseEntries,
    getExpenseTotals,
    getExpenseById,
    createExpenseEntry,
    updateExpenseEntry,
    deleteExpenseEntry,
    approveExpenseEntry,
    rejectExpenseEntry,
};
