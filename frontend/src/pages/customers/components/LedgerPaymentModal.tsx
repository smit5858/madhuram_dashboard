import { Field, Form, Formik } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import customerLedgerService, { type LedgerEntry } from "@/services/customerLedger.service";
import bankAccountService from "@/services/bankAccount.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import { ledgerPaymentSchema, type LedgerPaymentFormValues } from "@/validation/customerLedger.validation";
import { LEDGER_PAYMENT_METHOD_OPTIONS } from "@/shared/constants/ledgerPaymentMethod";
import { getTodayISODate } from "@/shared/utils/date";

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

  const initialValues: LedgerPaymentFormValues = {
    amount: entry ? String(Math.abs(entry.amount)) : "",
    paymentMethod: entry?.paymentMethod || "Cash",
    bankAccountId: entry?.bankAccountId || "",
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
        bankAccountId: values.paymentMethod === "BankTransfer" ? (values.bankAccountId || undefined) : undefined,
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
          {({ values }) => (
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
                {values.paymentMethod === "BankTransfer" && (
                  <Field
                    name="bankAccountId"
                    label="Bank Account"
                    placeholder="Select bank account"
                    options={bankAccountsList.map((acc) => ({ value: acc.id!, label: `${acc.bankName}  ${acc.accountNumber ? '—' + acc.accountNumber : ''}` }))}
                    component={FormikSelect}
                  />
                )}
                <Field name="transactionDate" label="Payment Date" component={FormikDate} />
                <Field name="reference" label="Reference / Transaction ID" placeholder="UPI txn ID, cheque no., etc." component={FormikInput} />
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
          )}
        </Formik>
      </div>
    </div>
  );
};

export default LedgerPaymentModal;
