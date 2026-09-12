import httpService from "./http-service";
import type { LedgerBalance } from "@/shared/utils/ledgerBalance";
import type { LedgerPaymentMethod } from "@/shared/constants/ledgerPaymentMethod";

export interface LedgerEntry {
  id: number;
  customerId: number;
  saleId?: number | null;
  sale?: { id: number; invoiceNumber?: string } | null;
  type: "SALE" | "PAYMENT" | "ADJUSTMENT" | "MANUAL_DEBIT";
  amount: number;
  paymentMethod?: LedgerPaymentMethod | null;
  /** Legacy single-account fields — superseded by `bankPayments` (amount per bank), kept for
   *  backend responses that still mirror the first allocation's bank. */
  bankAccountId?: number | null;
  bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } | null;
  /** This entry's amount, split across bank accounts — each row is one (bank account, amount)
   *  allocation, and the same bank account can appear more than once (rows are never merged). */
  bankPayments?: { id?: number; bankAccountId: number; amount: number; bankAccount?: { id: number; bankName: string; accountHolderName: string; accountNumber: string } }[];
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
  /** Splits the payment across bank accounts — one {bankAccountId, amount} row per allocation.
   *  Required (and must add up to exactly `amount`) when paymentMethod is BankTransfer or UPI. */
  bankPayments?: { bankAccountId: number; amount: number }[];
  transactionDate?: string;
  reference?: string;
  note?: string;
  saleId?: number | null;
}

export interface UpdateLedgerEntryPayload {
  amount?: number;
  paymentMethod?: LedgerPaymentMethod | null;
  bankPayments?: { bankAccountId: number; amount: number }[];
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

export interface RecordManualDebitPayload {
  amount: number;
  transactionDate?: string;
  reference?: string;
  note?: string;
}

// A manual debit added via Debited's "Add Debited Record" form — see
// customerLedger.controller.js#recordManualDebit.
const recordManualDebit = (customerId: number, data: RecordManualDebitPayload) =>
  httpService.post<{ success: boolean; message: string; data: { entry: LedgerEntry; balance: LedgerBalance } }>(
    `/customers/${customerId}/ledger/manual-debits`,
    data
  );

export interface ManualDebitEntry {
  id: number;
  amount: number;
  transactionDate: string;
  reference?: string | null;
  note?: string | null;
}

export interface DebtorRow {
  id: number;
  name: string;
  phone: string;
  city?: string | null;
  balance: LedgerBalance;
  totalPurchase: number;
  totalPaid: number;
  lastTransactionDate: string | null;
  /** This customer's own manually-added debit (Debited's Add form), if any — the record the
   *  main table's Edit action targets. Null if their balance comes only from sales/payments. */
  manualDebitEntry: ManualDebitEntry | null;
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
  recordManualDebit,
  getDebtors,
  getReceivableTotals,
};
