import { Field, Form, Formik } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import bankAccountService, { type BankAccountData } from "@/services/bankAccount.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikCheckbox from "@/shared/components/formik-fields/FormikCheckbox";
import { bankAccountSchema, type BankAccountFormValues } from "@/validation/bankAccount.validation";

interface BankAccountFormModalProps {
  /** null = creating a new record */
  account: BankAccountData | null;
  onClose: () => void;
}

const BankAccountFormModal = ({ account, onClose }: BankAccountFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!account?.id;

  const initialValues: BankAccountFormValues & { isActive: boolean } = {
    bankName: account?.bankName || "",
    accountHolderName: account?.accountHolderName || "",
    accountNumber: account?.accountNumber || "",
    ifscCode: account?.ifscCode || "",
    branchName: account?.branchName || "",
    upiId: account?.upiId || "",
    notes: account?.notes || "",
    isActive: account?.isActive ?? true,
  };

  const saveMutation = useMutation({
    mutationFn: (data: Partial<BankAccountData>) =>
      isEdit ? bankAccountService.updateBankAccount(account!.id!, data) : bankAccountService.createBankAccount(data),
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Bank account updated successfully" : "Bank account created successfully"));
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save bank account");
    },
  });

  const validate = (values: BankAccountFormValues) => {
    const result = bankAccountSchema.safeParse(values);
    const errors: Partial<Record<keyof BankAccountFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof BankAccountFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  const handleSubmit = (values: BankAccountFormValues & { isActive: boolean }) => {
    saveMutation.mutate({
      bankName: values.bankName.trim(),
      accountHolderName: values.accountHolderName?.trim() || undefined,
      accountNumber: values.accountNumber?.trim() || undefined,
      ifscCode: values.ifscCode || undefined,
      branchName: values.branchName || undefined,
      upiId: values.upiId || undefined,
      notes: values.notes || undefined,
      isActive: values.isActive,
    });
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Bank Account" : "Add Bank Account"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={handleSubmit} enableReinitialize>
          <Form className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field name="bankName" label="Bank Name" placeholder="e.g. HDFC Bank" component={FormikInput} />
              <Field name="accountHolderName" label="Account Holder Name" placeholder="Account holder name" component={FormikInput} />
              <Field name="accountNumber" label="Account Number" placeholder="Account number" component={FormikInput} />
              <Field name="ifscCode" label="IFSC Code" placeholder="e.g. HDFC0001234" component={FormikInput} />
              <Field name="branchName" label="Branch Name" placeholder="Branch name" component={FormikInput} />
              <Field name="upiId" label="UPI ID" placeholder="e.g. business@upi" component={FormikInput} />
              <div className="sm:col-span-2">
                <Field name="notes" label="Notes" placeholder="Optional notes" multiline component={FormikInput} />
              </div>
              <div className="sm:col-span-2">
                <Field name="isActive" label="Active" component={FormikCheckbox} />
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
                {saveMutation.isPending ? "Saving..." : isEdit ? "Update Account" : "Add Account"}
              </button>
            </div>
          </Form>
        </Formik>
      </div>
    </div>
  );
};

export default BankAccountFormModal;
