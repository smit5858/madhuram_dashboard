import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { AlertTriangle, CreditCard, Plus, Receipt, RotateCcw, Search as SearchIcon, Wallet } from "lucide-react";
import type { RootState } from "@/store/store";
import pendingBillService, {
  type PendingBillAccountFilters,
  type PendingBillAccountSummary,
} from "@/services/pendingBill.service";
import { pendingBillFilterSchema, type PendingBillFilterValues } from "@/validation/pendingBill.validation";
import { useDebounce } from "@/hook/useDebounce";
import { initSocket } from "@/services/socket.service";
import { formatDisplayDate } from "@/shared/utils/date";
import { pendingBillAccountPath } from "@/routes/routing";
import PendingBillFormModal from "./components/PendingBillFormModal";
import PendingBillAccountPaymentModal from "./components/PendingBillAccountPaymentModal";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE = 10;

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

// Auto-applies filters as they change — no separate "Apply" button, same convention as Debited
// (search debounced, dates immediate).
const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<PendingBillAccountFilters>>;
}) => {
  const { values } = useFormikContext<PendingBillFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      startDate: values.startDate || undefined,
      endDate: values.endDate || undefined,
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.startDate, values.endDate]);

  return null;
};

// Account → Pending Bill: one row per Seller/Dealer/Company we owe money to (bills for the same
// seller are grouped into one account), highest outstanding first. Fully paid accounts move to the
// Settled / History tab but stay reachable — same layout as Account → Debited. Click an account
// for its Account Details page (bills, payments and the running balance).
const PendingBill = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { permissions, role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  useEffect(() => {
    const socket = initSocket("account", userId);
    if (isAdmin) initSocket("admin", userId);
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
    };
    const events = [
      "pending_bill_created",
      "pending_bill_approved",
      "pending_bill_payment_submitted",
      "pending_bill_payment_verified",
      "pending_bill_payment_rejected",
      "pending_bill_partially_paid",
    ];
    events.forEach((event) => socket.on(event, refresh));
    return () => {
      events.forEach((event) => socket.off(event, refresh));
    };
  }, [queryClient, userId, isAdmin]);

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    if (!permissions) return fallback;
    return (
      permissions.find(
        (p) => p.routePath.toLowerCase() === "/account/pending-bill" || p.routeName.toLowerCase() === "pending bill"
      ) ?? fallback
    );
  }, [permissions]);

  const [statusTab, setStatusTab] = useState<"PENDING" | "SETTLED">("PENDING");
  const [appliedFilters, setAppliedFilters] = useState<PendingBillAccountFilters>({});
  const filterFormRef = useRef<FormikProps<PendingBillFilterValues>>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [payAccount, setPayAccount] = useState<PendingBillAccountSummary | null>(null);

  const queryFilters = useMemo<PendingBillAccountFilters>(
    () => ({ ...appliedFilters, status: statusTab, page: appliedFilters.page ?? 1, limit: PAGE_SIZE }),
    [appliedFilters, statusTab]
  );

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["pending-bill", "accounts", queryFilters],
    queryFn: ({ signal }) => pendingBillService.getPendingBillAccounts(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const accounts = data?.data?.data || [];
  const meta = data?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const hasActiveFilters = Boolean(appliedFilters.search || appliedFilters.startDate || appliedFilters.endDate);

  const handleReset = () => {
    filterFormRef.current?.resetForm();
    setAppliedFilters({});
  };

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          You do not have permission to view pending bills.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pending Bill</h1>
          <p className="mt-1 text-xs text-slate-500">
            {statusTab === "PENDING"
              ? "Sellers, dealers and companies we currently owe money to, highest first."
              : "Fully paid accounts, most recent activity first — open one for its complete history."}
          </p>
        </div>
        {pagePermission.canCreate && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#3d6fe0] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#3162d2] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> Add Bill
          </button>
        )}
      </div>

      <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1">
        {(["PENDING", "SETTLED"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setStatusTab(tab);
              setAppliedFilters((prev) => ({ ...prev, page: 1 }));
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              statusTab === tab ? "bg-white text-[#3d6fe0] shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "PENDING" ? "Active" : "Settled / History"}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          innerRef={filterFormRef}
          initialValues={{ search: "", status: "", billType: "", startDate: "", endDate: "" } as PendingBillFilterValues}
          validate={(values) => {
            const result = pendingBillFilterSchema.safeParse(values);
            return result.success ? {} : { search: result.error.issues[0]?.message };
          }}
          onSubmit={() => {}}
        >
          <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <FilterSync setAppliedFilters={setAppliedFilters} />

            <div className="relative flex-1 min-w-64 max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Field
                name="search"
                type="text"
                placeholder="Search seller, product, bill no..."
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
              />
            </div>

            <Field
              name="startDate"
              type="date"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
            />
            <Field
              name="endDate"
              type="date"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
            />

            <button
              type="button"
              onClick={handleReset}
              title="Reset filters"
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${
                hasActiveFilters
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </Form>
        </Formik>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-48 flex-col items-center justify-center text-red-500 gap-1 text-center px-4">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm font-semibold">
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load pending bills"}
            </p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <Receipt className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">
              {statusTab === "PENDING" ? "No accounts with an outstanding balance." : "No settled accounts yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Sr No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Seller / Dealer / Company</th>
                  <th className="px-4 py-3 whitespace-nowrap">Bills</th>
                  <th className="px-4 py-3 whitespace-nowrap">Total Billed</th>
                  <th className="px-4 py-3 whitespace-nowrap">Total Paid</th>
                  <th className="px-4 py-3 whitespace-nowrap">Outstanding</th>
                  <th className="px-4 py-3 whitespace-nowrap">Last Transaction</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((account, idx) => (
                  <tr key={account.accountKey} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{(meta.page - 1) * meta.limit + idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigate(pendingBillAccountPath(account.accountKey))}
                        className="text-left hover:text-[#3d6fe0] hover:underline"
                      >
                        {account.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{account.billCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatCurrency(account.totalBilled)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-emerald-600">{formatCurrency(account.totalPaid)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap font-semibold ${account.outstanding > 0 ? "text-rose-600" : "text-slate-500"}`}>
                      {formatCurrency(account.outstanding)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {account.lastTransactionDate ? formatDisplayDate(account.lastTransactionDate) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(pendingBillAccountPath(account.accountKey))}
                          className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"
                          title="View Account"
                        >
                          <Wallet className="h-4 w-4" />
                        </button>
                        {pagePermission.canCreate && account.outstanding > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayAccount(account)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                            title="Pay"
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && accounts.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
            <span>
              Page {meta.page} of {meta.totalPages} · {meta.total} account{meta.total === 1 ? "" : "s"}{" "}
              {statusTab === "PENDING" ? "pending" : "settled"}
              {isFetching && <span className="ml-2 text-gray-400">(refreshing…)</span>}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => setAppliedFilters((prev) => ({ ...prev, page: Math.max(1, meta.page - 1) }))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setAppliedFilters((prev) => ({ ...prev, page: Math.min(meta.totalPages, meta.page + 1) }))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && <PendingBillFormModal bill={null} onClose={() => setShowAddModal(false)} />}
      {payAccount && (
        <PendingBillAccountPaymentModal
          accountKey={payAccount.accountKey}
          accountName={payAccount.name}
          outstanding={payAccount.outstanding}
          onClose={() => setPayAccount(null)}
        />
      )}
    </div>
  );
};

export default PendingBill;
