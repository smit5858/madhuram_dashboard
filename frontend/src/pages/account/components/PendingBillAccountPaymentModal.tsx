import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik, useFormikContext } from "formik";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import pendingBillService from "@/services/pendingBill.service";
import bankAccountService from "@/services/bankAccount.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import {
  PENDING_BILL_PAYMENT_METHODS,
  pendingBillPaymentEntrySchema,
  type PendingBillPaymentEntryFormValues,
} from "@/validation/pendingBill.validation";
import { getTodayISODate } from "@/shared/utils/date";

const needsBankAccount = (paymentMethod?: string) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface PendingBillAccountPaymentModalProps {
  accountKey: string;
  accountName: string;
  /** The account's current outstanding balance — a payment can't exceed it. */
  outstanding: number;
  onClose: () => void;
}

const formatCurrency = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// "Full" is just whichever quick-fill matches the entire outstanding balance — there's no separate
// concept of a full vs. partial payment on the backend, only the amount submitted.
const QUICK_FILL_PERCENTAGES = [25, 50, 75, 100];

const QuickFillButtons = ({ outstanding }: { outstanding: number }) => {
  const { setFieldValue } = useFormikContext<PendingBillPaymentEntryFormValues>();
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_FILL_PERCENTAGES.map((pct) => (
        <button
          key={pct}
          type="button"
          onClick={() => setFieldValue("amount", ((outstanding * pct) / 100).toFixed(2))}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          {pct === 100 ? "Full" : `${pct}%`}
        </button>
      ))}
    </div>
  );
};

// Previous outstanding − this payment = remaining outstanding, live as the amount is typed.
const PaymentPreview = ({ outstanding }: { outstanding: number }) => {
  const { values } = useFormikContext<PendingBillPaymentEntryFormValues>();
  const payment = Number(values.amount) || 0;
  const remaining = Math.max(0, Math.round((outstanding - payment) * 100) / 100);

  return (
    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
      <div className="flex items-center justify-between text-slate-600">
        <span>Previous Outstanding</span>
        <span className="font-semibold text-slate-800">{formatCurrency(outstanding)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-slate-600">
        <span>Payment</span>
        <span className="font-semibold text-emerald-600">− {formatCurrency(payment)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-slate-700">
        <span className="font-semibold">Remaining Outstanding</span>
        <span className={`text-sm font-bold ${payment > outstanding ? "text-rose-600" : remaining === 0 ? "text-emerald-600" : "text-slate-900"}`}>
          {formatCurrency(remaining)}
        </span>
      </div>
    </div>
  );
};

const PendingBillAccountPaymentModal = ({ accountKey, accountName, outstanding, onClose }: PendingBillAccountPaymentModalProps) => {
  const queryClient = useQueryClient();

  const { data: bankAccountsResponse } = useQuery({
    queryKey: ["bank-accounts-active"],
    queryFn: () => bankAccountService.getActiveBankAccounts(),
  });
  const bankAccountsList = bankAccountsResponse?.data?.data || [];

  const initialValues: PendingBillPaymentEntryFormValues = {
    amount: "",
    paymentMethod: "Cash",
    paymentDate: getTodayISODate(),
    transactionRef: "",
    bankAccountId: "",
    notes: "",
  };

  const saveMutation = useMutation({
    mutationFn: (data: PendingBillPaymentEntryFormValues) => pendingBillService.createAccountPayment(accountKey, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Payment recorded successfully");
      // The account's outstanding, history and the Expense the payment created all change.
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
      queryClient.invalidateQueries({ queryKey: ["expense"] });
      queryClient.invalidateQueries({ queryKey: ["expense-totals"] });
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to record payment");
    },
  });

  const validate = (values: PendingBillPaymentEntryFormValues) => {
    const result = pendingBillPaymentEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof PendingBillPaymentEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PendingBillPaymentEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    if (!errors.amount && Number(values.amount) > outstanding) {
      errors.amount = `Amount cannot exceed the outstanding balance of ${formatCurrency(outstanding)}`;
    }
    return errors;
  };

  const methodOptions = PENDING_BILL_PAYMENT_METHODS.map((m) => ({ value: m, label: m }));

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Pay — {accountName}</h3>
            <p className="text-xs text-slate-500">
              Current Outstanding: <span className="font-semibold text-rose-600">{formatCurrency(outstanding)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => saveMutation.mutate(values)}>
          {({ values }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Quick fill</span>
                  <QuickFillButtons outstanding={outstanding} />
                </div>
                <Field name="amount" label="Payment Amount" type="number" placeholder="0.00" component={FormikInput} />
                <Field name="paymentMethod" label="Payment Method" options={methodOptions} component={FormikSelect} />
                <Field name="paymentDate" label="Payment Date" component={FormikDate} />
                <Field name="transactionRef" label="Transaction / Reference No. (optional)" placeholder="e.g. UTR / cheque no." component={FormikInput} />
                {needsBankAccount(values.paymentMethod) && (
                  <Field
                    name="bankAccountId"
                    label="Select Bank"
                    placeholder="Select a bank account"
                    options={bankAccountsList.map((acc) => ({ value: String(acc.id), label: `${acc.bankName} — ${acc.accountHolderName}` }))}
                    component={FormikSelect}
                  />
                )}
                <div className="sm:col-span-2">
                  <Field name="notes" label="Notes (optional)" placeholder="Optional notes" multiline component={FormikInput} />
                </div>
                <PaymentPreview outstanding={outstanding} />
              </div>

              <p className="px-6 pb-1 text-[11px] text-slate-400">
                The account's outstanding balance updates immediately. An Expense entry for this payment is created under your name and
                needs Admin approval before it counts toward Total Out.
              </p>

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
                  {saveMutation.isPending ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default PendingBillAccountPaymentModal;
