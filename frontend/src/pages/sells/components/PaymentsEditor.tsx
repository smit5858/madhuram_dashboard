import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { blurNumberInputOnWheel } from "@/shared/utils/input";
import {
  PAYMENT_ENTRY_METHODS,
  needsBankAccount,
  createEmptyPaymentRow,
  type PaymentRow,
  type PaymentEntryMethod,
  type BankAccountOption,
} from "@/pages/sells/utils/paymentRows";

interface PaymentsEditorProps {
  rows: PaymentRow[];
  onChange: (rows: PaymentRow[]) => void;
  bankAccounts: BankAccountOption[];
  /** Allows a row's amount to go negative, for correcting an earlier over-collection instead of
   *  recording a new payment (e.g. when adding payments to an already-existing sale). */
  allowNegative?: boolean;
  addLabel?: string;
}

// Multi-row "Payment Method" editor: lets the user record an order/payment as a combination of
// methods (e.g. part Cash, part UPI) instead of just one. Used both for a brand-new sale's
// initial payment(s) and for topping up an existing sale with new payment(s) — see Sells.tsx.
const PaymentsEditor: React.FC<PaymentsEditorProps> = ({ rows, onChange, bankAccounts, allowNegative = false, addLabel = "Add Payment" }) => {
  const updateRow = (index: number, patch: Partial<PaymentRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...rows, createEmptyPaymentRow()]);
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-[10px] text-slate-400">No payment rows added yet — click "{addLabel}" to record one.</p>
      )}

      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
          <select
            value={row.method}
            onChange={(e) => {
              const method = e.target.value as PaymentEntryMethod;
              updateRow(index, { method, bankAccountId: needsBankAccount(method) ? row.bankAccountId : "" });
            }}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
          >
            {PAYMENT_ENTRY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <input
            type="number"
            step="0.01"
            min={allowNegative ? undefined : "0"}
            value={row.amount}
            onChange={(e) => updateRow(index, { amount: e.target.value })}
            onWheel={blurNumberInputOnWheel}
            placeholder="Amount"
            className="w-28 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
          />

          {needsBankAccount(row.method) && (
            <select
              value={row.bankAccountId}
              onChange={(e) => updateRow(index, { bankAccountId: e.target.value ? Number(e.target.value) : "" })}
              className="min-w-[9rem] flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
            >
              <option value="">-- Select Bank Account --</option>
              {bankAccounts
                .filter((acc): acc is BankAccountOption & { id: number } => acc.id != null)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bankName} — {acc.accountHolderName}
                  </option>
                ))}
            </select>
          )}

          <input
            type="text"
            value={row.transactionRef}
            onChange={(e) => updateRow(index, { transactionRef: e.target.value })}
            placeholder="Ref/Txn # (optional)"
            className="min-w-[8rem] flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
          />

          <button
            type="button"
            onClick={() => removeRow(index)}
            className="rounded p-1 text-slate-400 hover:text-rose-600 transition"
            title="Remove Row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
      >
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  );
};

export default PaymentsEditor;
