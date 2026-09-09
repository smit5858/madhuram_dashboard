import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { Eye, Edit2, Trash2, Plus, RotateCcw, Loader2, Search as SearchIcon, CheckCircle2 } from "lucide-react";
import type { RootState } from "@/store/store";
import incomeService, { type IncomeEntryData, type IncomeFilters } from "@/services/income.service";
import { incomeFilterSchema, type IncomeFilterValues } from "@/validation/income.validation";
import { useDebounce } from "@/hook/useDebounce";
import { PAYMENT_METHOD_OPTIONS } from "@/shared/constants/paymentMethod";
import { formatDisplayDate } from "@/shared/utils/date";
import IncomeViewModal from "./components/IncomeViewModal";
import IncomeFormModal from "./components/IncomeFormModal";
import IncomeStatusBadge from "./components/IncomeStatusBadge";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<IncomeFilters>>;
}) => {
  const { values } = useFormikContext<IncomeFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      paymentMethod: (values.paymentMethod || undefined) as IncomeFilters["paymentMethod"],
      startDate: values.startDate || undefined,
      endDate: values.endDate || undefined,
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.paymentMethod, values.startDate, values.endDate]);

  return null;
};

const Income = () => {
  const queryClient = useQueryClient();
  const { permissions, role } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    if (!permissions) return fallback;
    return (
      permissions.find(
        (p) => p.routePath.toLowerCase() === "/account/income" || p.routeName.toLowerCase() === "account income"
      ) ?? fallback
    );
  }, [permissions]);

  const [appliedFilters, setAppliedFilters] = useState<IncomeFilters>({});
  const [pageSize, setPageSize] = useState(10);
  const filterFormRef = useRef<FormikProps<IncomeFilterValues>>(null);

  const [viewEntry, setViewEntry] = useState<IncomeEntryData | null>(null);
  const [editEntry, setEditEntry] = useState<IncomeEntryData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [approveEntry, setApproveEntry] = useState<IncomeEntryData | null>(null);

  const queryFilters = useMemo<IncomeFilters>(
    () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: pageSize }),
    [appliedFilters, pageSize]
  );

  const {
    data: incomeResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["income", queryFilters],
    queryFn: ({ signal }) => incomeService.getIncomeEntries(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const incomeList = incomeResponse?.data?.data || [];
  const meta = incomeResponse?.data?.meta || { page: 1, limit: pageSize, total: 0, totalPages: 1 };

  const [dailyPage, setDailyPage] = useState(1);
  const {
    data: dailyResponse,
    isLoading: isDailyLoading,
    isError: isDailyError,
  } = useQuery({
    queryKey: ["daily-balances", dailyPage],
    queryFn: ({ signal }) => incomeService.getDailyBalances({ page: dailyPage, limit: 10 }, { signal }),
    enabled: pagePermission.canRead,
  });
  const dailyList = dailyResponse?.data?.data || [];
  const dailyMeta = dailyResponse?.data?.meta || { page: 1, limit: 10, total: 0, totalPages: 1 };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => incomeService.deleteIncomeEntry(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Income record deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["income-totals"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      setDeleteId(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete income record");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => incomeService.approveIncomeEntry(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Selling entry approved successfully.");
      queryClient.invalidateQueries({ queryKey: ["income"] });
      queryClient.invalidateQueries({ queryKey: ["income-totals"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      setApproveEntry(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to approve selling entry");
    },
  });

  const hasActiveFilters = Boolean(
    appliedFilters.search || appliedFilters.paymentMethod || appliedFilters.startDate || appliedFilters.endDate
  );

  const handleReset = () => {
    filterFormRef.current?.resetForm();
    setAppliedFilters({});
  };

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          You do not have permission to view income records.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      {pagePermission.canRead && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between text-xs">
          <Formik
            innerRef={filterFormRef}
            initialValues={{ search: "", paymentMethod: "", startDate: "", endDate: "" } as IncomeFilterValues}
            validate={(values) => {
              const result = incomeFilterSchema.safeParse(values);
              return result.success ? {} : { search: result.error.issues[0]?.message };
            }}
            onSubmit={() => { }}
          >
            <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <FilterSync setAppliedFilters={setAppliedFilters} />

              <div className="relative flex-1 min-w-50 max-w-xs">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Field
                  name="search"
                  type="text"
                  placeholder="Search customer, phone, product, serial..."
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
              </div>

              <Field
                name="startDate"
                type="date"
                aria-label="From date"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
              />
              <Field
                name="endDate"
                type="date"
                aria-label="To date"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
              />

              <Field
                as="select"
                name="paymentMethod"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="">All Types</option>
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Field>

              <button
                type="button"
                onClick={handleReset}
                title="Reset filters"
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${hasActiveFilters
                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </Form>
          </Formik>
          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            {pagePermission.canCreate && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" /> Add Record
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-48 flex-col items-center justify-center text-red-500 gap-1 text-center px-4">
            <p className="text-sm font-semibold">
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load income records"}
            </p>
          </div>
        ) : incomeList.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500">No income records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Sr No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Customer Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Product / Serial No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Amount</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {incomeList.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {(meta.page - 1) * meta.limit + idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{entry.customerName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-gray-800">{entry.productName || "—"}</div>
                      {entry.serialNumber && <div className="text-xs text-gray-400">SN: {entry.serialNumber}</div>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(entry.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{formatDisplayDate(entry.entryDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <IncomeStatusBadge status={entry.status} />
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
                        {pagePermission.canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditEntry(entry)}
                            className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {pagePermission.canDelete && (
                          <button
                            type="button"
                            onClick={() => entry.id && setDeleteId(entry.id)}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && incomeList.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {meta.page} of {meta.totalPages} · {meta.total} records
              {isFetching && <span className="ml-2 text-gray-400">(refreshing…)</span>}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-gray-500">
                Rows:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setAppliedFilters((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
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
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-slate-900">Daily Account Balance</h2>
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {isDailyLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : isDailyError ? (
            <div className="flex h-32 items-center justify-center text-sm text-red-500">Failed to load daily balances</div>
          ) : dailyList.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-500">No daily balance records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Sr No</th>
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 whitespace-nowrap">Opening Balance</th>
                    <th className="px-4 py-3 whitespace-nowrap">Total In</th>
                    <th className="px-4 py-3 whitespace-nowrap">Total Out</th>
                    <th className="px-4 py-3 whitespace-nowrap">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dailyList.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{(dailyMeta.page - 1) * dailyMeta.limit + idx + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.date}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatCurrency(row.openingBalance)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-emerald-700 font-medium">{formatCurrency(row.totalIn)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-rose-700 font-medium">{formatCurrency(row.totalOut)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-900">{formatCurrency(row.closingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isDailyLoading && !isDailyError && dailyList.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
              <span>
                Page {dailyMeta.page} of {dailyMeta.totalPages} · {dailyMeta.total} days
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={dailyMeta.page <= 1}
                  onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={dailyMeta.page >= dailyMeta.totalPages}
                  onClick={() => setDailyPage((p) => Math.min(dailyMeta.totalPages, p + 1))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewEntry && <IncomeViewModal entry={viewEntry} onClose={() => setViewEntry(null)} />}
      {(showAddModal || editEntry) && (
        <IncomeFormModal
          entry={editEntry}
          onClose={() => {
            setShowAddModal(false);
            setEditEntry(null);
          }}
        />
      )}
      {deleteId !== null && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteId(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Delete Income Record</h3>
            <p className="text-xs text-slate-500 mb-4">
              This will permanently delete this income record and adjust the daily balance accordingly. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
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
            <h3 className="text-sm font-bold text-slate-900 mb-2">Approve Selling Entry?</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to approve this selling entry for{" "}
              <span className="font-semibold text-slate-800">{formatCurrency(approveEntry.amount)}</span>? Once
              approved, this amount will be added to Total Income and Total In.
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
    </div>
  );
};

export default Income;
