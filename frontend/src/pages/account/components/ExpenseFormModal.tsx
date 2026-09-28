import { useEffect, useRef, useState } from "react";
import { Field, Form, Formik, useFormikContext } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import expenseService, { type ExpenseEntryData, type EmployeeSuggestion } from "@/services/expense.service";
import bankAccountService from "@/services/bankAccount.service";
import { useDebounce } from "@/hook/useDebounce";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import CustomerAutocompleteField from "@/shared/components/CustomerAutocompleteField";
import { expenseEntrySchema, type ExpenseEntryFormValues } from "@/validation/expense.validation";
import { PAYMENT_METHOD_OPTIONS } from "@/shared/constants/paymentMethod";
import { getTodayISODate } from "@/shared/utils/date";
import { normalizePhoneDigits, formatPhoneDisplay } from "@/shared/utils/phone";

const needsBankAccount = (paymentMethod?: string) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";

interface ExpenseFormModalProps {
  /** null = creating a new record */
  entry: ExpenseEntryData | null;
  onClose: () => void;
}

/** Expense-only: suggests matching active Users (employees) while typing in the Name field, so an
 *  expense paid to a team member doesn't need the name re-typed. Matches name/phone via
 *  GET /expense/employee-suggestions (authorized by Expense read, unlike GET /users which Accounts
 *  staff usually can't access); picking an employee with a phone also fills Mobile. Opens only
 *  while typing (not on focus) so clicking a suggestion doesn't immediately reopen the list. */
const UserNameSuggestions = ({ onSelectUser }: { onSelectUser: () => void }) => {
  const { values, setFieldValue } = useFormikContext<ExpenseEntryFormValues>();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debouncedName = useDebounce(values.name.trim(), 350);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showList = isOpen && debouncedName.length >= 2;

  const { data } = useQuery({
    queryKey: ["expense-employee-suggestions", debouncedName],
    queryFn: ({ signal }) => expenseService.getEmployeeSuggestions(debouncedName, { signal }),
    enabled: showList,
    retry: false,
  });
  const users = data?.data?.data || [];

  const handleSelect = (user: EmployeeSuggestion) => {
    setFieldValue("name", user.name);
    if (user.phone) setFieldValue("mobile", normalizePhoneDigits(user.phone));
    setIsOpen(false);
    onSelectUser();
  };

  return (
    <div ref={wrapperRef} onChangeCapture={() => setIsOpen(true)} className="relative">
      <Field name="name" label="Name" placeholder="Name" component={FormikInput} />
      {showList && users.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            Matching Employees ({users.length})
          </div>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
            >
              <div>
                <p className="font-semibold text-slate-900">{user.name}</p>
                {user.phone && <p className="text-[11px] text-blue-600 font-mono">{formatPhoneDisplay(user.phone)}</p>}
              </div>
              {user.Role?.name && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{user.Role.name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ExpenseFormModal = ({ entry, onClose }: ExpenseFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!entry?.id;
  const [customerId, setCustomerId] = useState<number | null>(entry?.customerId ?? null);

  const { data: bankAccountsResponse } = useQuery({
    queryKey: ["bank-accounts-active"],
    queryFn: () => bankAccountService.getActiveBankAccounts(),
  });
  const bankAccountsList = bankAccountsResponse?.data?.data || [];

  const initialValues: ExpenseEntryFormValues = {
    name: entry?.name || "",
    mobile: normalizePhoneDigits(entry?.mobile) || "",
    product: entry?.product || "",
    amount: entry?.amount !== undefined && entry?.amount !== null ? String(entry.amount) : "",
    entryDate: entry?.entryDate || getTodayISODate(),
    paymentMethod: entry?.paymentMethod || "",
    bankAccountId: entry?.bankAccountId ? String(entry.bankAccountId) : "",
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
      bankAccountId: needsBankAccount(values.paymentMethod) && values.bankAccountId ? Number(values.bankAccountId) : undefined,
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
          {({ values, errors, touched, setFieldValue }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Same customer phone search as Debited (DebitedFormModal). Picking a suggestion fills
                    the name and links the customer; re-typing the number unlinks it, since the typed
                    number may no longer belong to that customer. */}
                <CustomerAutocompleteField
                  label="Mobile"
                  value={values.mobile || ""}
                  onPhoneChange={(phone) => {
                    setFieldValue("mobile", phone);
                    setCustomerId(null);
                  }}
                  onSelectCustomer={(customer) => {
                    setFieldValue("mobile", normalizePhoneDigits(customer.phone));
                    setFieldValue("name", customer.name);
                    setCustomerId(customer.id ?? null);
                  }}
                  error={touched.mobile ? errors.mobile : undefined}
                />
                <UserNameSuggestions onSelectUser={() => setCustomerId(null)} />
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
