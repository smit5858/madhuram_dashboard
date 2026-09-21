import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";

export type PendingBillStatus = "PENDING" | "PARTIALLY_PAID" | "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | "CANCELLED";
export type PendingBillType = "GENERAL" | "RESTOCK";
export type PendingBillPaymentStatus = "Pending Verification" | "Verified" | "Rejected";
export type PendingBillPaymentMethod = "Cash" | "UPI" | "Card" | "BankTransfer" | "Other";

export interface PendingBillPaymentData {
    id?: number;
    /** Null for an account-level payment (made from the account page), which belongs to `accountKey`. */
    pendingBillId?: number | null;
    accountKey?: string | null;
    amount: number | string;
    paymentMethod: PendingBillPaymentMethod;
    paymentDate: string;
    transactionRef?: string | null;
    /** Which configured bank account this BankTransfer/UPI payment used — set via the "Select
     *  Bank" field, same pattern as Sells/Customer Ledger. */
    bankAccountId?: number | null;
    bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } | null;
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
    /** The Seller/Dealer/Company this bill is owed to — bills sharing one are grouped into an account. */
    dealerName?: string | null;
    accountKey?: string | null;
    amount: number | string;
    billDate: string;
    description?: string | null;
    // Restock-only detail — set on legacy billType === "RESTOCK" bills (they used to be auto-created
    // from a new product or restock action; that no longer happens, but existing ones still display).
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
    bankAccountId?: number | string;
    notes?: string;
}

/** One Seller/Dealer/Company's Pending Bill account — a row of the main Pending Bill list. */
export interface PendingBillAccountSummary {
    accountKey: string;
    name: string;
    billCount: number;
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
    /** PENDING = still owes money (Active); SETTLED = fully paid (Settled / History). */
    status: "PENDING" | "SETTLED";
    lastTransactionDate: string | null;
}

export interface PendingBillAccountFilters {
    search?: string;
    startDate?: string;
    endDate?: string;
    status?: "PENDING" | "SETTLED";
    page?: number;
    limit?: number;
}

/** One row of an account's transaction history: a bill (adds to what's owed) or a payment (reduces it). */
export interface PendingBillAccountTransaction {
    id: string;
    type: "BILL" | "PAYMENT";
    date: string;
    amount: number;
    description: string;
    note?: string | null;
    billId?: number | null;
    paymentId?: number;
    paymentMethod?: PendingBillPaymentMethod;
    bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } | null;
    reference?: string | null;
    paymentStatus?: PendingBillPaymentStatus;
    rejectionReason?: string | null;
    recordedBy?: { id: number; name: string } | null;
    /** The Expense this payment created (its own Created By is the user who made the payment). */
    expense?: { id: number; status: "PENDING" | "APPROVED" | "REJECTED"; creator?: { id: number; name: string } | null } | null;
    /** False for a payment still awaiting verification / rejected (old flow) — it doesn't move the balance. */
    affectsBalance: boolean;
    /** Outstanding balance after this row. */
    balance: number;
}

export interface PendingBillAccountDetail {
    account: PendingBillAccountSummary;
    bills: PendingBillData[];
    transactions: PendingBillAccountTransaction[];
}

export interface AccountPaymentResult {
    payment: PendingBillPaymentData;
    previousOutstanding: number;
    outstanding: number;
}

const getPendingBillAccounts = (params?: PendingBillAccountFilters, config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: PendingBillAccountSummary[]; meta: PaginationMeta }>("/pending-bills/accounts", {
        params,
        signal: config?.signal,
    });

const getPendingBillAccount = (accountKey: string) =>
    httpService.get<{ success: boolean; data: PendingBillAccountDetail }>(`/pending-bills/accounts/${encodeURIComponent(accountKey)}`);

const createAccountPayment = (accountKey: string, data: PendingBillPaymentEntryData) =>
    httpService.post<{ success: boolean; message: string; data: AccountPaymentResult }>(
        `/pending-bills/accounts/${encodeURIComponent(accountKey)}/payments`,
        data
    );

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
    getPendingBillAccounts,
    getPendingBillAccount,
    createAccountPayment,
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
