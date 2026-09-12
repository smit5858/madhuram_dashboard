import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik } from "formik";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import customerLedgerService, { type DebtorRow } from "@/services/customerLedger.service";
import CustomerAutocompleteField from "@/pages/leads/components/CustomerAutocompleteField";
import type { CustomerData } from "@/services/customer.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import BalanceBadge from "@/shared/components/BalanceBadge";
import { manualDebitSchema, type ManualDebitFormValues } from "@/validation/customerLedger.validation";
import { getTodayISODate } from "@/shared/utils/date";
import type { LedgerBalance } from "@/shared/utils/ledgerBalance";

interface DebitedFormModalProps {
  /** null = adding a new manual debited record for a picked customer. Set = editing the
   *  customer's existing manual entry (Debited.tsx only offers Edit once one exists — see
   *  customerLedger.service.js#getDebtors's manualDebitEntry). */
  debtor?: DebtorRow | null;
  onClose: () => void;
}

interface FormValues extends ManualDebitFormValues {
  phone: string;
  customerName: string;
}

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

// Account → Debited's own Add/Edit form (spec: manually record a debit for a customer outside
// the Sales flow). Deliberately separate from LedgerPaymentModal — that one is the inside/detail
// table's Collect Payment + edit flow and must keep working unchanged; this one only ever writes
// MANUAL_DEBIT entries via a dedicated endpoint (see customerLedger.controller.js#recordManualDebit).
const DebitedFormModal = ({ debtor, onClose }: DebitedFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!debtor?.manualDebitEntry;
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(
    debtor ? { id: debtor.id, name: debtor.name, phone: debtor.phone } : null
  );
  // Same synchronous re-entrancy guard as LedgerPaymentModal — see its comment for why
  // isPending alone isn't enough to stop a fast double-click from double-submitting.
  const isSubmittingRef = useRef(false);

  const manualDebitEntry = debtor?.manualDebitEntry;

  // The customer's total purchase across every debit (sales + manual debits) minus this specific
  // entry's own amount, so the live totals below can swap in the amount being typed and stay
  // correct as the user edits it — see customerLedger.service.js#getDebtors for the same
  // Total Purchase / Total Paid definitions this mirrors.
  const otherPurchase = (debtor?.totalPurchase ?? 0) - (manualDebitEntry?.amount ?? 0);
  const totalPaid = debtor?.totalPaid ?? 0;

  const initialValues: FormValues = {
    customerId: debtor?.id || 0,
    phone: debtor?.phone || "",
    customerName: debtor?.name || "",
    amount: manualDebitEntry ? String(manualDebitEntry.amount) : "",
    transactionDate: manualDebitEntry?.transactionDate || getTodayISODate(),
    reference: manualDebitEntry?.reference || "",
    note: manualDebitEntry?.note || "",
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["debtors"] });
    queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        amount: Number(values.amount),
        transactionDate: values.transactionDate,
        reference: values.reference || undefined,
        note: values.note || undefined,
      };
      return isEdit
        ? customerLedgerService.updateLedgerEntry(values.customerId, manualDebitEntry!.id, payload)
        : customerLedgerService.recordManualDebit(values.customerId, payload);
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Debited record updated successfully" : "Debited record added successfully"));
      invalidateAll();
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save debited record");
    },
    onSettled: () => {
      isSubmittingRef.current = false;
    },
  });

  const validate = (values: FormValues) => {
    const result = manualDebitSchema.safeParse(values);
    const errors: Partial<Record<keyof FormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormValues;
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
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Debited Record" : "Add Debited Record"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik
          initialValues={initialValues}
          validate={validate}
          onSubmit={(values) => {
            if (isSubmittingRef.current) return;
            isSubmittingRef.current = true;
            saveMutation.mutate(values);
          }}
          enableReinitialize
        >
          {({ values, errors, touched, setFieldValue }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isEdit ? (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
                    <input
                      readOnly
                      disabled
                      value={`${debtor!.name} — ${debtor!.phone}`}
                      className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500"
                    />
                  </div>
                ) : selectedCustomer ? (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-100 px-3 py-2">
                      <span className="text-xs text-slate-700">{selectedCustomer.name} — {selectedCustomer.phone}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setFieldValue("customerId", 0);
                          setFieldValue("phone", "");
                          setFieldValue("customerName", "");
                        }}
                        className="text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <CustomerAutocompleteField
                      label="Customer Phone Number"
                      value={values.phone}
                      onPhoneChange={(phone) => setFieldValue("phone", phone)}
                      onSelectCustomer={(customer) => {
                        setSelectedCustomer(customer);
                        setFieldValue("customerId", customer.id);
                        setFieldValue("phone", customer.phone);
                        setFieldValue("customerName", customer.name);
                      }}
                      error={touched.customerId ? (errors as Record<string, string>).customerId : undefined}
                    />
                  </div>
                )}

                <Field name="amount" label="Total Purchase Amount" type="number" placeholder="0.00" component={FormikInput} />
                <Field name="transactionDate" label="Date" component={FormikDate} />
                <Field name="reference" label="Reference (optional)" placeholder="e.g. Bill / invoice no." component={FormikInput} />
                <div className="sm:col-span-2">
                  <Field name="note" label="Note (optional)" placeholder="Optional note" multiline component={FormikInput} />
                </div>

                {(() => {
                  const purchaseAmount = Number(values.amount) || 0;
                  const liveTotalPurchase = otherPurchase + purchaseAmount;
                  const remainingBalance: LedgerBalance = {
                    amount: totalPaid - liveTotalPurchase,
                    status: totalPaid > liveTotalPurchase ? "ADVANCE" : totalPaid < liveTotalPurchase ? "PENDING" : "SETTLED",
                    label: "",
                  };
                  return (
                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Purchase</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">₹{liveTotalPurchase.toLocaleString("en-IN")}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Paid</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">₹{totalPaid.toLocaleString("en-IN")}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Remaining</p>
                        <div className="mt-1">
                          <BalanceBadge balance={remainingBalance} />
                        </div>
                      </div>
                    </div>
                  );
                })()}
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

export default DebitedFormModal;
