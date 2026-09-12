import { Field, Form, Formik } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2, XCircle } from "lucide-react";
import customerLedgerService, { type LedgerEntry } from "@/services/customerLedger.service";
import bankAccountService from "@/services/bankAccount.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import { ledgerPaymentSchema, type LedgerPaymentFormValues } from "@/validation/customerLedger.validation";
import { LEDGER_PAYMENT_METHOD_OPTIONS } from "@/shared/constants/ledgerPaymentMethod";
import { getTodayISODate } from "@/shared/utils/date";
import { blurNumberInputOnWheel } from "@/shared/utils/input";

// Needs the Bank Account split shown/required — Bank Transfer and UPI are both routed through a
// bank account, unlike Cash/Card/Other.
const needsBankSplit = (paymentMethod: string) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";

interface LedgerPaymentModalProps {
  customerId: number;
  customerName: string;
  /** null = collecting a new payment. Set = editing an existing ledger entry (spec §20). */
  entry?: LedgerEntry | null;
  /** Sale row this collection was triggered from, if any — stored purely for traceability. */
  saleId?: number | null;
  onClose: () => void;
}

/** Payment collection / edit form (spec §12/§20) — EMI payments, partial payments, pending
 *  collection, and advance payments are all just a ledger PAYMENT credit. Reused for both the
 *  Sells table's "Collect Payment" action and the Customer Ledger page's edit flow. */
const LedgerPaymentModal = ({ customerId, customerName, entry, saleId, onClose }: LedgerPaymentModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!entry?.id;

  const { data: bankAccountsResponse } = useQuery({
    queryKey: ["bank-accounts-active"],
    queryFn: () => bankAccountService.getActiveBankAccounts(),
  });
  const bankAccountsList = bankAccountsResponse?.data?.data || [];

  // Same {bankAccountId, amount} row shape/logic as the Add/Edit Sales form's Bank Account Split
  // (see Sells.tsx's `bankPayments` state) — prefer the entry's own split rows when present, and
  // fall back to its legacy single bankAccountId column for an older entry that predates the split.
  const initialBankPayments: { bankAccountId: number | ""; amount: string }[] =
    entry?.bankPayments && entry.bankPayments.length > 0
      ? entry.bankPayments.map((bp) => ({ bankAccountId: bp.bankAccountId, amount: String(bp.amount) }))
      : entry?.bankAccountId
      ? [{ bankAccountId: entry.bankAccountId, amount: String(Math.abs(entry.amount)) }]
      : [];

  const initialValues: LedgerPaymentFormValues = {
    amount: entry ? String(Math.abs(entry.amount)) : "",
    paymentMethod: entry?.paymentMethod || "Cash",
    bankPayments: initialBankPayments,
    transactionDate: entry?.transactionDate || getTodayISODate(),
    reference: entry?.reference || "",
    note: entry?.note || "",
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["customer-ledger", customerId] });
    queryClient.invalidateQueries({ queryKey: ["sells"] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: LedgerPaymentFormValues) => {
      const payload = {
        amount: Number(values.amount),
        paymentMethod: values.paymentMethod as any,
        bankPayments: needsBankSplit(values.paymentMethod)
          ? values.bankPayments
              .filter((row) => row.bankAccountId)
              .map((row) => ({ bankAccountId: Number(row.bankAccountId), amount: Number(row.amount) }))
          : [],
        transactionDate: values.transactionDate,
        reference: values.reference || undefined,
        note: values.note || undefined,
      };
      return isEdit
        ? customerLedgerService.updateLedgerEntry(customerId, entry!.id, payload)
        : customerLedgerService.recordLedgerPayment(customerId, { ...payload, saleId });
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Transaction updated successfully" : "Payment recorded successfully"));
      invalidateAll();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save transaction");
    },
  });

  const validate = (values: LedgerPaymentFormValues) => {
    const result = ledgerPaymentSchema.safeParse(values);
    const errors: Partial<Record<keyof LedgerPaymentFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof LedgerPaymentFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Transaction" : "Collect Payment"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => saveMutation.mutate(values)} enableReinitialize>
          {({ values, errors, setFieldValue }) => {
            const bankPayments = values.bankPayments;
            const bankPaymentsError = typeof errors.bankPayments === "string" ? errors.bankPayments : null;

            const addBankRow = () => {
              setFieldValue("bankPayments", [...bankPayments, { bankAccountId: "", amount: "" }]);
            };
            const removeBankRow = (index: number) => {
              setFieldValue("bankPayments", bankPayments.filter((_, i) => i !== index));
            };
            const updateBankRow = (index: number, field: "bankAccountId" | "amount", value: number | "" | string) => {
              const copy = [...bankPayments];
              copy[index] = { ...copy[index], [field]: value } as { bankAccountId: number | ""; amount: string };
              setFieldValue("bankPayments", copy);
            };

            return (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
                  <input
                    readOnly
                    disabled
                    value={customerName}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500"
                  />
                </div>
                <Field name="amount" label="Amount" type="number" placeholder="0.00" component={FormikInput} />
                <Field
                  name="paymentMethod"
                  label="Payment Method"
                  options={LEDGER_PAYMENT_METHOD_OPTIONS}
                  component={FormikSelect}
                />
                {needsBankSplit(values.paymentMethod) && (
                  // Same {bankAccountId, amount} multi-row split as the Add/Edit Sales form's
                  // Bank Account field (Sells.tsx) — a dropdown + amount per row, with add/remove,
                  // reused here instead of a separate multi-select implementation.
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bank Account <span className="font-normal text-slate-400">(split the amount across bank accounts)</span>
                    </label>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      {bankAccountsList.length === 0 ? (
                        <p className="text-[10px] text-amber-600">
                          No bank accounts configured yet — add one under Account → Manage Bank Account Details.
                        </p>
                      ) : (
                        <>
                          {bankPayments.length === 0 && (
                            <p className="text-[10px] text-slate-400 mb-2">
                              No bank account rows added — add one to record which bank(s) the payment went into.
                            </p>
                          )}
                          <div className="space-y-2">
                            {bankPayments.map((row, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <select
                                  value={row.bankAccountId}
                                  onChange={(e) => updateBankRow(index, "bankAccountId", e.target.value ? Number(e.target.value) : "")}
                                  className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                                >
                                  <option value="">-- Select Bank Account --</option>
                                  {bankAccountsList.map((acc) => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.bankName} — {acc.accountHolderName}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={row.amount}
                                  onChange={(e) => updateBankRow(index, "amount", e.target.value)}
                                  onWheel={blurNumberInputOnWheel}
                                  placeholder="Amount"
                                  className="w-28 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeBankRow(index)}
                                  className="rounded p-1 text-slate-400 hover:text-rose-600 transition"
                                  title="Remove Row"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={addBankRow}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Plus className="h-3 w-3" /> Add Bank Account
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {bankPaymentsError && <div className="formik-input-error mt-1">{bankPaymentsError}</div>}
                  </div>
                )}
                <Field name="transactionDate" label="Payment Date" component={FormikDate} />
                <Field name="reference" label="Reference / Transaction ID" placeholder="UPI txn ID, no., etc." component={FormikInput} />
                <div className="sm:col-span-2">
                  <Field name="note" label="Note" placeholder="Optional note (e.g. EMI payment)" multiline component={FormikInput} />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3560c4] disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : isEdit ? "Update Transaction" : "Record Payment"}
                </button>
              </div>
            </Form>
            );
          }}
        </Formik>
      </div>
    </div>
  );
};

export default LedgerPaymentModal;
