import toast from "react-hot-toast";
import type { PaymentEntry } from "@/services/sells.service";

// Payment methods a single payment entry can use. Kept local (not the shared Income/Expense
// PAYMENT_METHOD constant) so Sells stays free to diverge — matches the sells module's own
// payment method list.
export const PAYMENT_ENTRY_METHODS = ["Cash", "UPI", "Card", "BankTransfer", "Other"] as const;
export type PaymentEntryMethod = (typeof PAYMENT_ENTRY_METHODS)[number];

export const needsBankAccount = (method: string) => method === "BankTransfer" || method === "UPI";

export interface PaymentRow {
  method: PaymentEntryMethod;
  amount: string;
  bankAccountId: number | "";
  transactionRef: string;
}

export const createEmptyPaymentRow = (method: PaymentEntryMethod = "Cash"): PaymentRow => ({
  method,
  amount: "",
  bankAccountId: "",
  transactionRef: "",
});

export interface BankAccountOption {
  // Optional/nullable to match the Bank Account service's list shape as-is — an account missing
  // an id is simply skipped when rendering the picker.
  id?: number;
  bankName?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
}

/**
 * Validates a draft list of payment rows against the order/remaining total they must not
 * exceed. Ignores blank/zero-amount rows entirely (an empty row left in the editor is not an
 * error). Returns the normalized {method, amount, bankAccountId, transactionRef} entries ready
 * to send to the API, or null (after showing a toast) if something's invalid.
 */
export const validatePaymentRows = (
  rows: PaymentRow[],
  maxTotal: number,
  { allowNegative = false }: { allowNegative?: boolean } = {}
): PaymentEntry[] | null => {
  const nonZero = rows.filter((row) => Number(row.amount) !== 0 && row.amount.trim() !== "");

  for (let i = 0; i < nonZero.length; i++) {
    const row = nonZero[i];
    const amount = Number(row.amount);
    if (!allowNegative && amount <= 0) {
      toast.error(`Payment row #${i + 1}: amount must be greater than 0`);
      return null;
    }
    if (needsBankAccount(row.method) && !row.bankAccountId) {
      toast.error(`Select a bank account for the ${row.method} payment (row #${i + 1})`);
      return null;
    }
  }

  const total = nonZero.reduce((sum, row) => sum + Number(row.amount), 0);
  if (total > maxTotal + 0.01) {
    toast.error("Total payment amount cannot exceed the order total");
    return null;
  }

  return nonZero.map((row) => ({
    method: row.method,
    amount: Number(row.amount),
    bankAccountId: needsBankAccount(row.method) && row.bankAccountId ? Number(row.bankAccountId) : null,
    transactionRef: row.transactionRef.trim() || null,
  }));
};

export const sumPaymentRows = (rows: PaymentRow[]) => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
