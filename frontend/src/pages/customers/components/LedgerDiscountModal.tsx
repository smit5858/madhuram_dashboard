import { Field, Form, Formik } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";
import { XCircle } from "lucide-react";
import customerLedgerService, { type LedgerEntry } from "@/services/customerLedger.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import { createDiscountSchema, editDiscountSchema, type DiscountFormValues } from "@/validation/customerLedger.validation";

interface LedgerDiscountModalProps {
  customerId: number;
  customerName: string;
  /** Customer's current pending amount (positive) — the most a discount can be. */
  pendingAmount: number;
  /** When set, the modal edits this existing DISCOUNT entry — only its note can change. */
  entry?: LedgerEntry | null;
  onClose: () => void;
}

/** Ledger page "Add Discount" — records a DISCOUNT ledger entry that lowers the customer's
 *  pending amount. Not money received, so (unlike LedgerPaymentModal) it has no payment method
 *  and never creates an Income entry. In edit mode the amount is read-only: a discount's amount
 *  can't be changed (delete and re-apply instead), only its note. */
const LedgerDiscountModal = ({ customerId, customerName, pendingAmount, entry, onClose }: LedgerDiscountModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!entry;
  const schema = isEdit ? editDiscountSchema : createDiscountSchema(pendingAmount);

  const discountMutation = useMutation({
    mutationFn: (values: DiscountFormValues) => {
      const note = values.note?.trim() ?? "";
      return isEdit
        ? customerLedgerService.updateLedgerEntry(customerId, entry!.id, { note })
        : customerLedgerService.recordDiscount(customerId, { amount: Number(values.amount), note: note || undefined });
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Discount updated successfully" : "Discount applied successfully"));
      queryClient.invalidateQueries({ queryKey: ["customer-ledger", customerId] });
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-receivable-totals"] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      toast.error(err.response?.data?.message || err.message || (isEdit ? "Failed to update discount" : "Failed to apply discount"));
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
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Discount" : "Add Discount"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik<DiscountFormValues>
          initialValues={{ amount: entry ? String(Math.abs(entry.amount)) : "", note: entry?.note || "" }}
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
              {isEdit ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discount Amount</label>
                  <input
                    readOnly
                    disabled
                    value={`₹${Math.abs(entry!.amount).toLocaleString("en-IN")}`}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-amber-600"
                  />
                </div>
              ) : (
                <>
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
                </>
              )}
              <Field name="note" label="Note" placeholder="Optional note (e.g. reason for discount)" multiline component={FormikInput} />
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
                {isEdit
                  ? discountMutation.isPending ? "Saving..." : "Save Note"
                  : discountMutation.isPending ? "Applying..." : "Apply Discount"}
              </button>
            </div>
          </Form>
        </Formik>
      </div>
    </div>
  );
};

export default LedgerDiscountModal;
