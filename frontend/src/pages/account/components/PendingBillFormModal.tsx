import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik, useFormikContext } from "formik";
import toast from "react-hot-toast";
import { Package, XCircle } from "lucide-react";
import pendingBillService, {
  type PendingBillData,
  type PendingBillPaymentMethod,
  type PendingBillUpdateData,
} from "@/services/pendingBill.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import FormikCheckbox from "@/shared/components/formik-fields/FormikCheckbox";
import {
  PENDING_BILL_PAYMENT_METHODS,
  pendingBillEntrySchema,
  pendingBillEntryWithPaymentSchema,
  type PendingBillEntryWithPaymentFormValues,
} from "@/validation/pendingBill.validation";
import { getTodayISODate } from "@/shared/utils/date";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface PendingBillFormModalProps {
  /** null = creating a new record */
  bill: PendingBillData | null;
  onClose: () => void;
}

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

const PAYMENT_METHOD_OPTIONS = PENDING_BILL_PAYMENT_METHODS.map((m) => ({ value: m, label: m }));
const QUICK_FILL_PERCENTAGES = [25, 50, 75, 100];

// Quick-fill reads the total amount the user is currently typing in the same form (not a
// server value, since the bill doesn't exist yet) — "100%" fills in a full payment.
const PaymentQuickFillButtons = () => {
  const { values, setFieldValue } = useFormikContext<PendingBillEntryWithPaymentFormValues>();
  const total = Number(values.amount) || 0;
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_FILL_PERCENTAGES.map((pct) => (
        <button
          key={pct}
          type="button"
          disabled={total <= 0}
          onClick={() => setFieldValue("paymentAmount", ((total * pct) / 100).toFixed(2))}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pct === 100 ? "Full" : `${pct}%`}
        </button>
      ))}
    </div>
  );
};

const PendingBillFormModal = ({ bill, onClose }: PendingBillFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!bill?.id;
  const isRestock = bill?.billType === "RESTOCK";

  const initialValues: PendingBillEntryWithPaymentFormValues = {
    name: bill?.name || "",
    dealerName: bill?.dealerName || "",
    amount: bill?.amount !== undefined && bill?.amount !== null ? String(bill.amount) : "",
    billDate: bill?.billDate || getTodayISODate(),
    description: bill?.description || "",
    billNumber: bill?.billNumber || "",
    recordPayment: false,
    paymentAmount: "",
    paymentMethod: "Cash",
    paymentDate: getTodayISODate(),
    paymentTransactionRef: "",
    paymentNotes: "",
  };

  const saveMutation = useMutation({
    mutationFn: async (values: PendingBillEntryWithPaymentFormValues) => {
      const data: PendingBillUpdateData = {
        name: values.name.trim(),
        dealerName: values.dealerName?.trim() || undefined,
        amount: values.amount,
        billDate: values.billDate,
        description: values.description || undefined,
        billNumber: values.billNumber?.trim() || undefined,
      };
      const billRes = isEdit ? await pendingBillService.updatePendingBill(bill!.id!, data) : await pendingBillService.createPendingBill(data);

      const createdBillId = billRes.data?.data?.id;
      if (!isEdit && createdBillId && values.recordPayment && values.paymentAmount) {
        await pendingBillService.createPayment(createdBillId, {
          amount: values.paymentAmount,
          paymentMethod: values.paymentMethod as PendingBillPaymentMethod,
          paymentDate: values.paymentDate || getTodayISODate(),
          transactionRef: values.paymentTransactionRef?.trim() || undefined,
          notes: values.paymentNotes || undefined,
        });
      }
      return billRes;
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Pending bill updated successfully" : "Pending bill created successfully"));
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save pending bill");
    },
  });

  const validate = (values: PendingBillEntryWithPaymentFormValues) => {
    const schema = isEdit ? pendingBillEntrySchema : pendingBillEntryWithPaymentSchema;
    const result = schema.safeParse(values);
    const errors: Partial<Record<keyof PendingBillEntryWithPaymentFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PendingBillEntryWithPaymentFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    if (!errors.amount && isEdit && Number(values.amount) < Number(bill?.paidAmount || 0)) {
      errors.amount = `Cannot be less than the amount already verified as paid (₹${bill?.paidAmount})`;
    }
    return errors;
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Pending Bill" : "Add Bill"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {isRestock && (
          <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <div className="text-xs text-blue-800">
              <p className="font-semibold">Auto-generated from {bill?.productNameSnapshot}</p>
              <p className="mt-0.5 text-blue-700">
                Qty {bill?.quantity}
                {bill?.purchasePrice != null ? ` @ ${formatCurrency(bill.purchasePrice)}/unit` : ""} — correct the total amount and
                add the vendor's invoice/bill number below once known.
              </p>
            </div>
          </div>
        )}

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => saveMutation.mutate(values)} enableReinitialize>
          {({ values }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field name="name" label="Name" placeholder="e.g. Office rent" component={FormikInput} />
                  <Field name="dealerName" label="Dealer Name (optional)" placeholder="e.g. Vendor / dealer name" component={FormikInput} />
                  <Field name="amount" label="Amount" type="number" placeholder="0.00" component={FormikInput} />
                  <Field name="billDate" label="Date" component={FormikDate} />
                  <Field name="billNumber" label="Bill / Invoice Number (optional)" placeholder="e.g. INV-1042" component={FormikInput} />
                  <div className="sm:col-span-2">
                    <Field name="description" label="Description" placeholder="Optional description" multiline component={FormikInput} />
                  </div>
                </div>

                {!isEdit && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <Field name="recordPayment" label="Record a payment now" component={FormikCheckbox} />

                    {values.recordPayment && (
                      <div className="mt-4 flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Quick fill</span>
                          <PaymentQuickFillButtons />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field name="paymentAmount" label="Payment Amount" type="number" placeholder="0.00" component={FormikInput} />
                          <Field name="paymentMethod" label="Payment Method" options={PAYMENT_METHOD_OPTIONS} component={FormikSelect} />
                          <Field name="paymentDate" label="Payment Date" component={FormikDate} />
                          <Field
                            name="paymentTransactionRef"
                            label="Transaction / Reference No. (optional)"
                            placeholder="e.g. UTR / cheque no."
                            component={FormikInput}
                          />
                          <div className="sm:col-span-2">
                            <Field name="paymentNotes" label="Payment Notes (optional)" placeholder="Optional notes" multiline component={FormikInput} />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          This payment will be recorded as Pending Verification — it won't count toward the paid amount until an
                          Admin verifies it.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {!isEdit && (
                  <p className="text-[11px] text-slate-400">
                    New bills are created as Pending. You can also record payments (full or custom amount) later — each needs
                    Admin verification before it's counted as paid.
                  </p>
                )}
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
                  {saveMutation.isPending ? "Saving..." : isEdit ? "Update Bill" : "Add Bill"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default PendingBillFormModal;
