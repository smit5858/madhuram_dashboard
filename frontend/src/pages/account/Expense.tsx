import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { AlertTriangle, CheckCircle2, Edit2, Eye, Plus, Receipt, RotateCcw, Search as SearchIcon, Trash2, XCircle } from "lucide-react";
import type { RootState } from "@/store/store";
import expenseService, { type ExpenseEntryData, type ExpenseFilters } from "@/services/expense.service";
import { expenseFilterSchema, type ExpenseFilterValues } from "@/validation/expense.validation";
import { useDebounce } from "@/hook/useDebounce";
import { initSocket } from "@/services/socket.service";
import ExpenseStatusBadge from "./components/ExpenseStatusBadge";
import ExpenseViewModal from "./components/ExpenseViewModal";
import ExpenseFormModal from "./components/ExpenseFormModal";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<ExpenseFilters>>;
}) => {
  const { values } = useFormikContext<ExpenseFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      status: (values.status || undefined) as ExpenseFilters["status"],
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.status]);

  return null;
};

const Expense = () => {
  const queryClient = useQueryClient();
  const { permissions, role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";
  // Lets the Accounts dashboard's "Total Expense" KPI land here pre-filtered (e.g. ?status=APPROVED).
  const [searchParams] = useSearchParams();
  const initialStatus = (searchParams.get("status") || "") as ExpenseFilters["status"];

  // Approving/rejecting an expense happens from whoever's own click triggered it — its local
  // mutation already invalidates the query. For everyone else with this page open (e.g. the
  // submitter, in a different session), listen for the same live events so the table/status
  // updates immediately instead of waiting for a manual refresh.
  useEffect(() => {
    const socket = initSocket("account", userId);
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["expense"] });
      queryClient.invalidateQueries({ queryKey: ["expense-totals"] });
    };
    const events = ["expense_pending_approval", "expense_approved", "expense_rejected"];
    events.forEach((event) => socket.on(event, refresh));
    return () => {
      events.forEach((event) => socket.off(event, refresh));
    };
  }, [queryClient, userId]);

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    if (!permissions) return fallback;
    return (
      permissions.find(
        (p) => p.routePath.toLowerCase() === "/account/expense" || p.routeName.toLowerCase() === "expense"
      ) ?? fallback
    );
  }, [permissions]);

  const [appliedFilters, setAppliedFilters] = useState<ExpenseFilters>(initialStatus ? { status: initialStatus } : {});
  const filterFormRef = useRef<FormikProps<ExpenseFilterValues>>(null);

  const [viewEntry, setViewEntry] = useState<ExpenseEntryData | null>(null);
  const [editEntry, setEditEntry] = useState<ExpenseEntryData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<ExpenseEntryData | null>(null);
  const [approveEntry, setApproveEntry] = useState<ExpenseEntryData | null>(null);
  const [rejectEntry, setRejectEntry] = useState<ExpenseEntryData | null>(null);

  const queryFilters = useMemo<ExpenseFilters>(
    () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: PAGE_SIZE }),
    [appliedFilters]
  );

  const {
    data: expenseResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["expense", queryFilters],
    queryFn: ({ signal }) => expenseService.getExpenseEntries(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const expenseList = expenseResponse?.data?.data || [];
  const meta = expenseResponse?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => expenseService.deleteExpenseEntry(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Expense deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["expense"] });
      queryClient.invalidateQueries({ queryKey: ["expense-totals"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      setDeleteEntry(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete expense");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => expenseService.approveExpenseEntry(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Expense approved successfully");
      queryClient.invalidateQueries({ queryKey: ["expense"] });
      queryClient.invalidateQueries({ queryKey: ["expense-totals"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      setApproveEntry(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to approve expense");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => expenseService.rejectExpenseEntry(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Expense rejected successfully");
      queryClient.invalidateQueries({ queryKey: ["expense"] });
      queryClient.invalidateQueries({ queryKey: ["expense-totals"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      setRejectEntry(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to reject expense");
    },
  });

  const hasActiveFilters = Boolean(appliedFilters.search || appliedFilters.status);

  const handleReset = () => {
    filterFormRef.current?.resetForm();
    setAppliedFilters({});
  };

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          You do not have permission to view expenses.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          innerRef={filterFormRef}
          initialValues={{ search: "", status: initialStatus } as ExpenseFilterValues}
          validate={(values) => {
            const result = expenseFilterSchema.safeParse(values);
            return result.success ? {} : { search: result.error.issues[0]?.message };
          }}
          onSubmit={() => {}}
        >
          <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <FilterSync setAppliedFilters={setAppliedFilters} />

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative flex-1 min-w-64 max-w-xs">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Field
                  name="search"
                  type="text"
                  placeholder="Search name, mobile, product..."
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
              </div>

              <Field
                as="select"
                name="status"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Field>

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
            </div>

            {pagePermission.canCreate && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" /> Add Expense
              </button>
            )}
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
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load expenses"}
            </p>
          </div>
        ) : expenseList.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <Receipt className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">No expense records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Sr No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Product</th>
                  <th className="px-4 py-3 whitespace-nowrap">Amount</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenseList.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {(meta.page - 1) * meta.limit + idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{entry.name}</td>
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{entry.product || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(entry.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{entry.entryDate}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ExpenseStatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewEntry(entry)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setEditEntry(entry)}
                            className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteEntry(entry)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && entry.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => setApproveEntry(entry)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                            title="Approve"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && entry.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => setRejectEntry(entry)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4" />
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

        {!isLoading && !isError && expenseList.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
            <span>
              Page {meta.page} of {meta.totalPages} · {meta.total} total entries
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

      {viewEntry && <ExpenseViewModal entry={viewEntry} onClose={() => setViewEntry(null)} />}
      {(showAddModal || editEntry) && (
        <ExpenseFormModal
          entry={editEntry}
          onClose={() => {
            setShowAddModal(false);
            setEditEntry(null);
          }}
        />
      )}

      {deleteEntry && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteEntry(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Delete Expense</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to delete this expense? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteEntry(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteEntry.id && deleteMutation.mutate(deleteEntry.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {approveEntry && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setApproveEntry(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Approve Expense</h3>
            <p className="text-xs text-slate-500 mb-1">
              Are you sure you want to approve this expense of{" "}
              <span className="font-semibold text-slate-800">{formatCurrency(approveEntry.amount)}</span>?
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Once approved, it will be included in the Total Out Balance and cannot be reverted from this action.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApproveEntry(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => approveEntry.id && approveMutation.mutate(approveEntry.id)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectEntry && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectEntry(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Reject Expense</h3>
            <p className="text-xs text-slate-500 mb-1">
              Are you sure you want to reject this expense of{" "}
              <span className="font-semibold text-slate-800">{formatCurrency(rejectEntry.amount)}</span>?
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Rejected expenses are excluded from the Total Out balance and cannot be reverted from this action.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectEntry(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectMutation.isPending}
                onClick={() => rejectEntry.id && rejectMutation.mutate(rejectEntry.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expense;
