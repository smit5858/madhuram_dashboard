import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { AlertTriangle, Ban, CreditCard, Edit2, Eye, Package, Plus, Receipt, RotateCcw, Search as SearchIcon, Trash2 } from "lucide-react";
import type { RootState } from "@/store/store";
import pendingBillService, { type PendingBillData, type PendingBillFilters } from "@/services/pendingBill.service";
import { pendingBillFilterSchema, type PendingBillFilterValues } from "@/validation/pendingBill.validation";
import { useDebounce } from "@/hook/useDebounce";
import { initSocket } from "@/services/socket.service";
import PendingBillStatusBadge from "./components/PendingBillStatusBadge";
import PendingBillViewModal from "./components/PendingBillViewModal";
import PendingBillFormModal from "./components/PendingBillFormModal";
import PendingBillPaymentFormModal from "./components/PendingBillPaymentFormModal";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "PENDING", label: "Pending" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PENDING_VERIFICATION", label: "Pending Verification" },
  { value: "APPROVED", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const BILL_TYPE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "GENERAL", label: "General" },
  { value: "RESTOCK", label: "Product Restock" },
];

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<PendingBillFilters>>;
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
      status: (values.status || undefined) as PendingBillFilters["status"],
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.status]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      billType: (values.billType || undefined) as PendingBillFilters["billType"],
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.billType]);

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

const PendingBill = () => {
  const queryClient = useQueryClient();
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

  const [appliedFilters, setAppliedFilters] = useState<PendingBillFilters>({});
  const filterFormRef = useRef<FormikProps<PendingBillFilterValues>>(null);

  const [viewBillId, setViewBillId] = useState<number | null>(null);
  const [editBill, setEditBill] = useState<PendingBillData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteBill, setDeleteBill] = useState<PendingBillData | null>(null);
  const [payBill, setPayBill] = useState<PendingBillData | null>(null);
  const [cancelBill, setCancelBill] = useState<PendingBillData | null>(null);

  const queryFilters = useMemo<PendingBillFilters>(
    () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: PAGE_SIZE }),
    [appliedFilters]
  );

  const {
    data: billResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["pending-bill", queryFilters],
    queryFn: ({ signal }) => pendingBillService.getPendingBills(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const billList = billResponse?.data?.data || [];
  const meta = billResponse?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => pendingBillService.deletePendingBill(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Pending bill deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
      queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
      setDeleteBill(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete pending bill");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => pendingBillService.cancelPendingBill(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Pending bill cancelled");
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
      setCancelBill(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to cancel pending bill");
    },
  });

  const hasActiveFilters = Boolean(
    appliedFilters.search || appliedFilters.status || appliedFilters.billType || appliedFilters.startDate || appliedFilters.endDate
  );

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
          <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <FilterSync setAppliedFilters={setAppliedFilters} />

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative flex-1 min-w-64 max-w-xs">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Field
                  name="search"
                  type="text"
                  placeholder="Search name, dealer, bill no..."
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

              <Field
                as="select"
                name="billType"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                {BILL_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Field>

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
                title="Clear filters"
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${
                  hasActiveFilters
                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear
              </button>
            </div>

            {pagePermission.canCreate && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" /> Add Bill
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
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load pending bills"}
            </p>
          </div>
        ) : billList.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <Receipt className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">No pending bills found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Sr No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Dealer Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 whitespace-nowrap">Paid</th>
                  <th className="px-4 py-3 whitespace-nowrap">Remaining</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {billList.map((bill, idx) => (
                  <tr key={bill.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {(meta.page - 1) * meta.limit + idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {bill.billType === "RESTOCK" && (
                          <span title="Product restock">
                            <Package className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                          </span>
                        )}
                        {bill.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{bill.dealerName || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(bill.amount)}</td>
                    <td className="px-4 py-3 text-emerald-600 whitespace-nowrap">{formatCurrency(bill.paidAmount)}</td>
                    <td className="px-4 py-3 text-rose-600 whitespace-nowrap">{formatCurrency(bill.remainingAmount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{bill.billDate}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PendingBillStatusBadge status={bill.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => bill.id && setViewBillId(bill.id)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {pagePermission.canUpdate && !["APPROVED", "CANCELLED"].includes(bill.status || "") && (
                          <button
                            type="button"
                            onClick={() => setEditBill(bill)}
                            className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {pagePermission.canCreate && !["APPROVED", "CANCELLED", "REJECTED"].includes(bill.status || "") && (
                          <button
                            type="button"
                            onClick={() => setPayBill(bill)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                            title="Record Payment"
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteBill(bill)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && Number(bill.paidAmount || 0) === 0 && bill.status !== "CANCELLED" && (
                          <button
                            type="button"
                            onClick={() => setCancelBill(bill)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                            title="Cancel"
                          >
                            <Ban className="h-4 w-4" />
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

        {!isLoading && !isError && billList.length > 0 && (
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

      {viewBillId !== null && <PendingBillViewModal billId={viewBillId} onClose={() => setViewBillId(null)} />}
      {(showAddModal || editBill) && (
        <PendingBillFormModal
          bill={editBill}
          onClose={() => {
            setShowAddModal(false);
            setEditBill(null);
          }}
        />
      )}
      {payBill && <PendingBillPaymentFormModal bill={payBill} onClose={() => setPayBill(null)} />}

      {deleteBill && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteBill(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Delete Pending Bill</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to delete this bill? This action cannot be undone.
              {deleteBill.status === "APPROVED" && " Its approved amount will also be removed from the Total Out balance."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteBill(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteBill.id && deleteMutation.mutate(deleteBill.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelBill && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setCancelBill(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Cancel Pending Bill</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to cancel "{cancelBill.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelBill(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelBill.id && cancelMutation.mutate(cancelBill.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? "Cancelling..." : "Cancel Bill"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingBill;
