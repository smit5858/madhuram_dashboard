import { Field, Form, Formik } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import incomeService from "@/services/income.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import { updateBalanceSchema, type UpdateBalanceFormValues } from "@/validation/income.validation";
import { getTodayISODate } from "@/shared/utils/date";

interface UpdateBalanceModalProps {
  onClose: () => void;
}

/** Password-gated manual correction of today's closing balance — never touches the balance
 *  directly; the backend books the difference as a single Income/Expense adjustment entry so
 *  closingBalance = openingBalance + totalIn - totalOut always holds (see
 *  income.controller.js#updateBalance). Kept as its own action, separate from the plain
 *  filter-Reset button, so clearing a search box never requires a password. */
const UpdateBalanceModal = ({ onClose }: UpdateBalanceModalProps) => {
  const queryClient = useQueryClient();

  const initialValues: UpdateBalanceFormValues = { closingBalance: "", password: "" };

  const mutation = useMutation({
    mutationFn: (values: UpdateBalanceFormValues) =>
      incomeService.updateBalance({
        password: values.password,
        date: getTodayISODate(),
        closingBalance: Number(values.closingBalance),
      }),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Balance updated successfully");
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      queryClient.invalidateQueries({ queryKey: ["income-totals"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to update balance");
    },
  });

  const validate = (values: UpdateBalanceFormValues) => {
    const result = updateBalanceSchema.safeParse(values);
    const errors: Partial<Record<keyof UpdateBalanceFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof UpdateBalanceFormValues;
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
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-sm font-bold text-slate-900">Update Today's Balance</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Corrects today's closing balance to the amount you enter. The difference is recorded as an adjustment entry.
        </p>

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => mutation.mutate(values)}>
          <Form className="flex flex-col gap-3">
            <Field name="closingBalance" label="New Closing Balance" type="number" placeholder="0.00" component={FormikInput} />
            <Field name="password" label="Your Password" type="password" placeholder="Confirm with your password" showPasswordToggle component={FormikInput} />

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3560c4] disabled:opacity-50"
              >
                {mutation.isPending ? "Updating..." : "Update Balance"}
              </button>
            </div>
          </Form>
        </Formik>
      </div>
    </div>
  );
};

export default UpdateBalanceModal;
