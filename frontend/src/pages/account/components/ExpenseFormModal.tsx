import { useEffect, useState } from "react";
import { Field, Form, Formik, useFormikContext } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import expenseService, { type ExpenseEntryData } from "@/services/expense.service";
import customerService, { type CustomerData } from "@/services/customer.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import FormikPhoneInput from "@/shared/components/formik-fields/FormikPhoneInput";
import { expenseEntrySchema, type ExpenseEntryFormValues } from "@/validation/expense.validation";
import { PAYMENT_METHOD_OPTIONS } from "@/shared/constants/paymentMethod";
import { getTodayISODate } from "@/shared/utils/date";
import { useDebounce } from "@/hook/useDebounce";

interface ExpenseFormModalProps {
  /** null = creating a new record */
  entry: ExpenseEntryData | null;
  onClose: () => void;
}

/** Debounced phone lookup + suggestions dropdown for the Mobile field, mirroring the customer
 *  autocomplete in pages/sells/Sells.tsx — lets Add Expense pull Name/Mobile from an existing
 *  customer instead of the user re-typing it every time. Lives inside <Formik> and reads/writes
 *  form state via context, same shape as Expense.tsx's FilterSync. Disabled while editing an
 *  existing entry, same as Sells.tsx skips its own lookup when editing a sale. */
const CustomerAutofill = ({ enabled, onSelectCustomer }: { enabled: boolean; onSelectCustomer: (id: number | null) => void }) => {
  const { values, setFieldValue } = useFormikContext<ExpenseEntryFormValues>();
  const [suggestions, setSuggestions] = useState<CustomerData[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "not_found">("idle");
  const debouncedMobile = useDebounce(values.mobile, 350);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    const cleanPhone = (debouncedMobile || "").trim();

    // Deferred (not called synchronously in the effect body) so this satisfies
    // react-hooks/set-state-in-effect — these run on the next tick either way.
    const resetTimer = setTimeout(() => {
      if (!isMounted) return;
      if (cleanPhone.length < 3) {
        setSuggestions([]);
        setStatus("idle");
        onSelectCustomer(null);
      } else if (cleanPhone.length >= 10) {
        setStatus("loading");
      }
    }, 0);

    if (cleanPhone.length < 3) {
      return () => {
        isMounted = false;
        clearTimeout(resetTimer);
      };
    }

    customerService
      .getCustomers({ search: cleanPhone, limit: 6 })
      .then((res) => {
        if (!isMounted) return;
        const matches = res.data?.data || [];
        setSuggestions(matches);

        const exactMatch = matches.find((c) => c.phone === cleanPhone);
        if (exactMatch) {
          setStatus("found");
          onSelectCustomer(exactMatch.id || null);
        } else if (cleanPhone.length >= 10) {
          setStatus("not_found");
          onSelectCustomer(null);
        } else {
          setStatus("idle");
        }
      })
      .catch(() => {
        if (isMounted) setSuggestions([]);
      });

    return () => {
      isMounted = false;
      clearTimeout(resetTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedMobile, enabled]);

  if (!enabled) return null;

  const handleSelect = (cust: CustomerData) => {
    setFieldValue("mobile", cust.phone);
    setFieldValue("name", cust.name);
    setStatus("found");
    setSuggestions([]);
    onSelectCustomer(cust.id || null);
  };

  return (
    <>
      {status !== "found" && suggestions.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            Matching Customers ({suggestions.length})
          </div>
          {suggestions.map((cust) => (
            <button
              key={cust.id}
              type="button"
              onClick={() => handleSelect(cust)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
            >
              <div>
                <p className="font-semibold text-slate-900">{cust.name}</p>
                <p className="text-[11px] text-blue-600 font-mono">{cust.phone}</p>
              </div>
              {cust.city && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{cust.city}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {status === "found" && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Existing customer — details auto-filled
        </p>
      )}
      {status === "loading" && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 font-medium">
          <Loader2 className="h-3 w-3 animate-spin" /> Searching...
        </p>
      )}
    </>
  );
};

const ExpenseFormModal = ({ entry, onClose }: ExpenseFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!entry?.id;
  const [customerId, setCustomerId] = useState<number | null>(entry?.customerId ?? null);

  const initialValues: ExpenseEntryFormValues = {
    name: entry?.name || "",
    mobile: entry?.mobile || "",
    product: entry?.product || "",
    amount: entry?.amount !== undefined && entry?.amount !== null ? String(entry.amount) : "",
    entryDate: entry?.entryDate || getTodayISODate(),
    paymentMethod: entry?.paymentMethod || "",
    bankName: entry?.bankName || "",
    description: entry?.description || "",
  };

  const saveMutation = useMutation({
    mutationFn: (data: ExpenseEntryData) =>
      isEdit ? expenseService.updateExpenseEntry(entry!.id!, data) : expenseService.createExpenseEntry(data),
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Expense updated successfully" : "Expense created successfully"));
      queryClient.invalidateQueries({ queryKey: ["expense"] });
      queryClient.invalidateQueries({ queryKey: ["expense-totals"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save expense");
    },
  });

  const validate = (values: ExpenseEntryFormValues) => {
    const result = expenseEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof ExpenseEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ExpenseEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  const handleSubmit = (values: ExpenseEntryFormValues) => {
    saveMutation.mutate({
      name: values.name.trim(),
      mobile: values.mobile || undefined,
      product: values.product || undefined,
      amount: values.amount,
      entryDate: values.entryDate,
      paymentMethod: (values.paymentMethod || undefined) as ExpenseEntryData["paymentMethod"],
      bankName: values.paymentMethod === "BankTransfer" ? values.bankName || undefined : undefined,
      description: values.description || undefined,
      customerId: customerId ?? undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Expense" : "Add Expense"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={handleSubmit} enableReinitialize>
          {({ values }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field name="name" label="Name" placeholder="Name" component={FormikInput} />
                <div className="relative">
                  <Field name="mobile" label="Mobile" placeholder="9876543210" component={FormikPhoneInput} />
                  <CustomerAutofill enabled={!isEdit} onSelectCustomer={setCustomerId} />
                </div>
                <Field name="product" label="Product" placeholder="Product name" component={FormikInput} />
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
                  <Field name="description" label="Description" placeholder="Optional description" multiline component={FormikInput} />
                </div>
              </div>

              {!isEdit && (
                <p className="px-6 pb-1 text-[11px] text-slate-400">
                  New expenses are created as Pending and only affect the account balance once an Admin approves them.
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
                  {saveMutation.isPending ? "Saving..." : isEdit ? "Update Expense" : "Add Expense"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default ExpenseFormModal;
