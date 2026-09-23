import { Field, Form, Formik } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { XCircle } from "lucide-react";
import customerLedgerService from "@/services/customerLedger.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import { createDiscountSchema, type DiscountFormValues } from "@/validation/customerLedger.validation";

interface LedgerDiscountModalProps {
  customerId: number;
  customerName: string;
  /** Customer's current pending amount (positive) — the most a discount can be. */
  pendingAmount: number;
  onClose: () => void;
}

/** Ledger page "Add Discount" — records a DISCOUNT ledger entry that lowers the customer's
 *  pending amount. Not money received, so (unlike LedgerPaymentModal) it has no payment method
 *  and never creates an Income entry. */
const LedgerDiscountModal = ({ customerId, customerName, pendingAmount, onClose }: LedgerDiscountModalProps) => {
  const queryClient = useQueryClient();
  const schema = createDiscountSchema(pendingAmount);

  const discountMutation = useMutation({
    mutationFn: (values: DiscountFormValues) =>
      customerLedgerService.recordDiscount(customerId, { amount: Number(values.amount) }),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Discount applied successfully");
      queryClient.invalidateQueries({ queryKey: ["customer-ledger", customerId] });
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-receivable-totals"] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      toast.error(err.response?.data?.message || err.message || "Failed to apply discount");
    },
  });

  const validate = (values: DiscountFormValues) => {
    const result = schema.safeParse(values);
    const errors: Partial<Record<keyof DiscountFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof DiscountFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !discountMutation.isPending) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">Add Discount</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik<DiscountFormValues>
          initialValues={{ amount: "" }}
          validate={validate}
          onSubmit={(values) => {
            // Guard against a double click firing a second request before isPending re-renders.
            if (discountMutation.isPending) return;
            discountMutation.mutate(values);
          }}
        >
          <Form className="flex flex-col">
            <div className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
                <input
                  readOnly
                  disabled
                  value={customerName}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Pending Amount</label>
                <input
                  readOnly
                  disabled
                  value={`₹${pendingAmount.toLocaleString("en-IN")}`}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-rose-600"
                />
              </div>
              <Field name="amount" label="Discount Amount" type="number" placeholder="0.00" component={FormikInput} />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={discountMutation.isPending}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={discountMutation.isPending}
                className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3560c4] disabled:opacity-50"
              >
                {discountMutation.isPending ? "Applying..." : "Apply Discount"}
              </button>
            </div>
          </Form>
        </Formik>
      </div>
    </div>
  );
};

export default LedgerDiscountModal;
