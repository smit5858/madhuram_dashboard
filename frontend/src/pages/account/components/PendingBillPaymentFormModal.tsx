import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik, useFormikContext } from "formik";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import pendingBillService, { type PendingBillData } from "@/services/pendingBill.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import {
  PENDING_BILL_PAYMENT_METHODS,
  pendingBillPaymentEntrySchema,
  type PendingBillPaymentEntryFormValues,
} from "@/validation/pendingBill.validation";
import { getTodayISODate } from "@/shared/utils/date";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface PendingBillPaymentFormModalProps {
  bill: PendingBillData;
  onClose: () => void;
}

// "Full" is just whichever quick-fill matches the entire remaining balance — there's no separate
// concept of a full-payment vs custom-payment on the backend, only the amount submitted.
const QUICK_FILL_PERCENTAGES = [25, 50, 75, 100];

const QuickFillButtons = ({ remaining }: { remaining: number }) => {
  const { setFieldValue } = useFormikContext<PendingBillPaymentEntryFormValues>();
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_FILL_PERCENTAGES.map((pct) => (
        <button
          key={pct}
          type="button"
          onClick={() => setFieldValue("amount", ((remaining * pct) / 100).toFixed(2))}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          {pct === 100 ? "Full" : `${pct}%`}
        </button>
      ))}
    </div>
  );
};

const PendingBillPaymentFormModal = ({ bill, onClose }: PendingBillPaymentFormModalProps) => {
  const queryClient = useQueryClient();
  const remaining = Number(bill.remainingAmount ?? bill.amount);

  const initialValues: PendingBillPaymentEntryFormValues = {
    amount: "",
    paymentMethod: "Cash",
    paymentDate: getTodayISODate(),
    transactionRef: "",
    notes: "",
  };

  const saveMutation = useMutation({
    mutationFn: (data: PendingBillPaymentEntryFormValues) => pendingBillService.createPayment(bill.id!, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Payment recorded, pending Admin verification");
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
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
    if (!errors.amount && Number(values.amount) > remaining) {
      errors.amount = `Amount cannot exceed the remaining balance of ₹${remaining.toLocaleString("en-IN")}`;
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
            <h3 className="text-base font-bold text-slate-900">Record Payment</h3>
            <p className="text-xs text-slate-500">
              Remaining balance: <span className="font-semibold text-slate-700">₹{remaining.toLocaleString("en-IN")}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => saveMutation.mutate(values)}>
          <Form className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Quick fill</span>
                <QuickFillButtons remaining={remaining} />
              </div>
              <Field name="amount" label="Amount" type="number" placeholder="0.00" component={FormikInput} />
              <Field name="paymentMethod" label="Payment Method" options={methodOptions} component={FormikSelect} />
              <Field name="paymentDate" label="Payment Date" component={FormikDate} />
              <Field name="transactionRef" label="Transaction / Reference No. (optional)" placeholder="e.g. UTR / cheque no." component={FormikInput} />
              <div className="sm:col-span-2">
                <Field name="notes" label="Notes (optional)" placeholder="Optional notes" multiline component={FormikInput} />
              </div>
            </div>

            <p className="px-6 pb-1 text-[11px] text-slate-400">
              This payment will be recorded as Pending Verification until an Admin verifies it — it will not count toward the paid amount until then.
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
                {saveMutation.isPending ? "Submitting..." : "Record Payment"}
              </button>
            </div>
          </Form>
        </Formik>
      </div>
    </div>
  );
};

export default PendingBillPaymentFormModal;
