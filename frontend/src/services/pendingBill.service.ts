import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";

export type PendingBillStatus = "PENDING" | "PARTIALLY_PAID" | "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | "CANCELLED";
export type PendingBillType = "GENERAL" | "RESTOCK";
export type PendingBillPaymentStatus = "Pending Verification" | "Verified" | "Rejected";
export type PendingBillPaymentMethod = "Cash" | "UPI" | "Card" | "BankTransfer" | "Cheque" | "Other";

export interface PendingBillPaymentData {
    id?: number;
    pendingBillId?: number;
    amount: number | string;
    paymentMethod: PendingBillPaymentMethod;
    paymentDate: string;
    transactionRef?: string | null;
    notes?: string | null;
    status?: PendingBillPaymentStatus;
    createdBy?: number | null;
    creator?: { id: number; name: string } | null;
    verifiedBy?: number | null;
    verifier?: { id: number; name: string } | null;
    verifiedAt?: string | null;
    rejectionReason?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface PendingBillData {
    id?: number;
    billType?: PendingBillType;
    name: string;
    dealerName?: string | null;
    amount: number | string;
    billDate: string;
    description?: string | null;
    // Restock-only detail — set when billType === "RESTOCK" (auto-created from a new product or
    // restock action, never entered manually — see pendingBillService.js#createBillForPurchase).
    productId?: number | null;
    product?: { id: number; name: string } | null;
    productNameSnapshot?: string | null;
    dealerId?: number | null;
    dealer?: { id: number; name: string } | null;
    quantity?: number | null;
    purchasePrice?: number | string | null;
    billNumber?: string | null;
    paidAmount?: number | string;
    remainingAmount?: number | string;
    status?: PendingBillStatus;
    approvedBy?: number | null;
    approvedAt?: string | null;
    creator?: { id: number; name: string } | null;
    approver?: { id: number; name: string } | null;
    createdAt?: string;
    updatedAt?: string;
    payments?: PendingBillPaymentData[];
}

export interface PendingBillFilters {
    search?: string;
    status?: PendingBillStatus | "";
    billType?: PendingBillType | "";
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

export interface PendingBillUpdateData {
    name: string;
    dealerName?: string | null;
    amount: number | string;
    billDate: string;
    description?: string | null;
    billNumber?: string | null;
}

export interface PendingBillPaymentEntryData {
    amount: number | string;
    paymentMethod: PendingBillPaymentMethod;
    paymentDate: string;
    transactionRef?: string;
    notes?: string;
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

const updatePendingBill = (id: number, data: PendingBillUpdateData) =>
    httpService.put<{ success: boolean; message: string; data: PendingBillData }>(`/pending-bills/${id}`, data);

const deletePendingBill = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/pending-bills/${id}`);

const cancelPendingBill = (id: number) =>
    httpService.post<{ success: boolean; message: string; data: PendingBillData }>(`/pending-bills/${id}/cancel`, {});

const createPayment = (billId: number, data: PendingBillPaymentEntryData) =>
    httpService.post<{ success: boolean; message: string; data: { bill: PendingBillData; payment: PendingBillPaymentData } }>(
        `/pending-bills/${billId}/payments`,
        data
    );

const deletePayment = (billId: number, paymentId: number) =>
    httpService.delete<{ success: boolean; message: string; data: PendingBillData }>(
        `/pending-bills/${billId}/payments/${paymentId}`
    );

const verifyPayment = (billId: number, paymentId: number) =>
    httpService.post<{ success: boolean; message: string; data: { bill: PendingBillData; payment: PendingBillPaymentData } }>(
        `/pending-bills/${billId}/payments/${paymentId}/verify`,
        {}
    );

const rejectPayment = (billId: number, paymentId: number, rejectionReason: string) =>
    httpService.post<{ success: boolean; message: string; data: { bill: PendingBillData; payment: PendingBillPaymentData } }>(
        `/pending-bills/${billId}/payments/${paymentId}/reject`,
        { rejectionReason }
    );

export default {
    getPendingBills,
    getPendingBillById,
    createPendingBill,
    updatePendingBill,
    deletePendingBill,
    cancelPendingBill,
    createPayment,
    deletePayment,
    verifyPayment,
    rejectPayment,
};
