import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik } from "formik";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import pendingBillService, { type PendingBillData } from "@/services/pendingBill.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import { pendingBillEntrySchema, type PendingBillEntryFormValues } from "@/validation/pendingBill.validation";
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

const PendingBillFormModal = ({ bill, onClose }: PendingBillFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!bill?.id;

  const initialValues: PendingBillEntryFormValues = {
    name: bill?.name || "",
    dealerName: bill?.dealerName || "",
    amount: bill?.amount !== undefined && bill?.amount !== null ? String(bill.amount) : "",
    billDate: bill?.billDate || getTodayISODate(),
    description: bill?.description || "",
  };

  const saveMutation = useMutation({
    mutationFn: (data: PendingBillData) =>
      isEdit ? pendingBillService.updatePendingBill(bill!.id!, data) : pendingBillService.createPendingBill(data),
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

  const validate = (values: PendingBillEntryFormValues) => {
    const result = pendingBillEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof PendingBillEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PendingBillEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  const handleSubmit = (values: PendingBillEntryFormValues) => {
    saveMutation.mutate({
      name: values.name.trim(),
      dealerName: values.dealerName?.trim() || undefined,
      amount: values.amount,
      billDate: values.billDate,
      description: values.description || undefined,
    });
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

        <Formik initialValues={initialValues} validate={validate} onSubmit={handleSubmit} enableReinitialize>
          <Form className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field name="name" label="Name" placeholder="e.g. Office rent" component={FormikInput} />
              <Field name="dealerName" label="Dealer Name (optional)" placeholder="e.g. Vendor / dealer name" component={FormikInput} />
              <Field name="amount" label="Amount" type="number" placeholder="0.00" component={FormikInput} />
              <Field name="billDate" label="Date" component={FormikDate} />
              <div className="sm:col-span-2">
                <Field name="description" label="Description" placeholder="Optional description" multiline component={FormikInput} />
              </div>
            </div>

            {!isEdit && (
              <p className="px-6 pb-1 text-[11px] text-slate-400">
                New bills are created as Pending and only affect the Total Out balance once an Admin approves them.
              </p>
            )}

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
        </Formik>
      </div>
    </div>
  );
};

export default PendingBillFormModal;
