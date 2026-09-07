import httpService from "./http-service";
import type { LedgerBalance } from "@/shared/utils/ledgerBalance";
import type { LedgerPaymentMethod } from "@/shared/constants/ledgerPaymentMethod";

export interface LedgerEntry {
  id: number;
  customerId: number;
  saleId?: number | null;
  sale?: { id: number; invoiceNumber?: string } | null;
  type: "SALE" | "PAYMENT" | "ADJUSTMENT";
  amount: number;
  paymentMethod?: LedgerPaymentMethod | null;
  bankAccountId?: number | null;
  bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } | null;
  transactionDate: string;
  reference?: string | null;
  note?: string | null;
  creator?: { id: number; name: string } | null;
  createdAt?: string;
}

export interface LedgerCustomer {
  id: number;
  name: string;
  phone: string;
}

export interface LedgerData {
  customer: LedgerCustomer;
  balance: LedgerBalance;
  entries: LedgerEntry[];
}

export interface RecordLedgerPaymentPayload {
  amount: number;
  paymentMethod: LedgerPaymentMethod;
  bankAccountId?: number | null;
  transactionDate?: string;
  reference?: string;
  note?: string;
  saleId?: number | null;
}

export interface UpdateLedgerEntryPayload {
  amount?: number;
  paymentMethod?: LedgerPaymentMethod | null;
  bankAccountId?: number | null;
  transactionDate?: string;
  reference?: string;
  note?: string;
}

const getCustomerLedger = (customerId: number) =>
  httpService.get<{ success: boolean; data: LedgerData }>(`/customers/${customerId}/ledger`);

const recordLedgerPayment = (customerId: number, data: RecordLedgerPaymentPayload) =>
  httpService.post<{ success: boolean; message: string; data: { entry: LedgerEntry; balance: LedgerBalance } }>(
    `/customers/${customerId}/ledger/payments`,
    data
  );

const updateLedgerEntry = (customerId: number, entryId: number, data: UpdateLedgerEntryPayload) =>
  httpService.put<{ success: boolean; message: string; data: { entry: LedgerEntry; balance: LedgerBalance } }>(
    `/customers/${customerId}/ledger/entries/${entryId}`,
    data
  );

// Hard delete — Admin-only (enforced by the backend regardless of permission), no more void.
const deleteLedgerEntry = (customerId: number, entryId: number) =>
  httpService.delete<{ success: boolean; message: string; data: { balance: LedgerBalance } }>(
    `/customers/${customerId}/ledger/entries/${entryId}`
  );

const downloadStatementPdf = (customerId: number) =>
  httpService.get(`/customers/${customerId}/ledger/statement.pdf`, { responseType: "blob" });

export interface DebtorRow {
  id: number;
  name: string;
  phone: string;
  city?: string | null;
  balance: LedgerBalance;
  totalPurchase: number;
  totalPaid: number;
  lastTransactionDate: string | null;
}

export interface DebtorFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  /** "PENDING" (default, current outstanding customers) or "SETTLED" (settled/history) */
  status?: "PENDING" | "SETTLED";
}

export interface DebtorListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Account → Debited: every customer currently in Pending, highest-pending first.
const getDebtors = (filters: DebtorFilters, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: DebtorRow[]; meta: DebtorListMeta }>("/customers/debtors", {
    params: filters,
    signal: config?.signal,
  });

export interface ReceivableTotalsData {
  totalReceivable: number;
  debtorCount: number;
}

// Accounts dashboard "Receivable" KPI — sum of every customer's outstanding balance.
const getReceivableTotals = (config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: ReceivableTotalsData }>("/customers/debtors/totals", {
    signal: config?.signal,
  });

export default {
  getCustomerLedger,
  recordLedgerPayment,
  updateLedgerEntry,
  deleteLedgerEntry,
  downloadStatementPdf,
  getDebtors,
  getReceivableTotals,
};
