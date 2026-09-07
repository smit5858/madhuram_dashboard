import { Field, Form, Formik } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import incomeService, { type IncomeEntryData } from "@/services/income.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import { incomeEntrySchema, type IncomeEntryFormValues } from "@/validation/income.validation";
import { PAYMENT_METHOD_OPTIONS } from "@/shared/constants/paymentMethod";
import { getTodayISODate } from "@/shared/utils/date";

interface IncomeFormModalProps {
  /** null = creating a new record */
  entry: IncomeEntryData | null;
  onClose: () => void;
}

const IncomeFormModal = ({ entry, onClose }: IncomeFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!entry?.id;

  const initialValues: IncomeEntryFormValues = {
    customerName: entry?.customerName || "",
    customerPhone: entry?.customerPhone || "",
    productName: entry?.productName || "",
    serialNumber: entry?.serialNumber || "",
    amount: entry?.amount !== undefined && entry?.amount !== null ? String(entry.amount) : "",
    entryDate: entry?.entryDate || getTodayISODate(),
    paymentMethod: entry?.paymentMethod || "",
    bankName: entry?.bankName || "",
    description: entry?.description || "",
  };

  const saveMutation = useMutation({
    mutationFn: (data: IncomeEntryData) =>
      isEdit ? incomeService.updateIncomeEntry(entry!.id!, data) : incomeService.createIncomeEntry(data),
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Income record updated successfully" : "Income record created successfully"));
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["income-totals"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save income record");
    },
  });

  const validate = (values: IncomeEntryFormValues) => {
    const result = incomeEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof IncomeEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof IncomeEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  const handleSubmit = (values: IncomeEntryFormValues) => {
    saveMutation.mutate({
      customerName: values.customerName.trim(),
      customerPhone: values.customerPhone || undefined,
      productName: values.productName || undefined,
      serialNumber: values.serialNumber || undefined,
      amount: values.amount,
      entryDate: values.entryDate,
      paymentMethod: (values.paymentMethod || undefined) as IncomeEntryData["paymentMethod"],
      bankName: values.paymentMethod === "BankTransfer" ? values.bankName || undefined : undefined,
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
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Income Record" : "Add Income Record"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={handleSubmit} enableReinitialize>
          {({ values }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field name="customerName" label="Customer Name" placeholder="Customer name" component={FormikInput} />
                <Field name="customerPhone" label="Customer Phone" placeholder="10-digit phone" component={FormikInput} />
                <Field name="productName" label="Product Name" placeholder="Product name" component={FormikInput} />
                <Field name="serialNumber" label="Serial Number" placeholder="Serial number (if any)" component={FormikInput} />
                <Field name="amount" label="Amount" type="number" placeholder="0.00" component={FormikInput} />
                <Field name="entryDate" label="Date" component={FormikDate} />
                <Field
                  name="paymentMethod"
                  label="Payment Method"
                  placeholder="Select payment method"
                  options={PAYMENT_METHOD_OPTIONS}
                  component={FormikSelect}
                />
                {values.paymentMethod === "BankTransfer" && (
                  <Field name="bankName" label="Bank Name" placeholder="Bank name" component={FormikInput} />
                )}
                <div className="sm:col-span-2">
                  <Field name="description" label="Notes" placeholder="Optional notes" multiline component={FormikInput} />
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
                  {saveMutation.isPending ? "Saving..." : isEdit ? "Update Record" : "Add Record"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default IncomeFormModal;
