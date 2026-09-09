import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, RotateCcw, Search as SearchIcon, Users, Wallet } from "lucide-react";
import { Field, Form, Formik, useFormikContext } from "formik";
import type { RootState } from "@/store/store";
import customerLedgerService, { type DebtorFilters } from "@/services/customerLedger.service";
import BalanceBadge from "@/shared/components/BalanceBadge";
import ShareStatementMenu from "@/pages/customers/components/ShareStatementMenu";
import { useDebounce } from "@/hook/useDebounce";
import { formatDisplayDate } from "@/shared/utils/date";

const PAGE_SIZE = 10;

interface DebitedFilterValues {
  search: string;
  startDate: string;
  endDate: string;
}

// Auto-applies filters as they change — no separate "Apply" button, same convention as the
// Sells and Expense pages (search debounced, dates immediate).
const FilterSync = ({ setAppliedFilters }: { setAppliedFilters: React.Dispatch<React.SetStateAction<DebtorFilters>> }) => {
  const { values } = useFormikContext<DebitedFilterValues>();
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

// Account → Debited: every customer currently carrying a Pending balance (spec's Customer
// Account / Ledger system), highest-pending first — reuses the same central balance calc as the
// Sells table and the Customer Ledger page (see customerLedger.service.js#getDebtors).
const Debited = () => {
  const { permissions } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  // Lets the Accounts dashboard's "Receivable" KPI land here on the matching tab (e.g. ?status=PENDING).
  const [searchParams] = useSearchParams();
  const initialStatusTab = searchParams.get("status") === "SETTLED" ? "SETTLED" : "PENDING";

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false };
    if (!permissions) return fallback;
    return permissions.find((p) => p.routePath.toLowerCase() === "/account/debited" || p.routeName.toLowerCase() === "debited") ?? fallback;
  }, [permissions]);

  const [statusTab, setStatusTab] = useState<"PENDING" | "SETTLED">(initialStatusTab);
  const [appliedFilters, setAppliedFilters] = useState<DebtorFilters>({});
  const queryFilters = useMemo<DebtorFilters>(
    () => ({ ...appliedFilters, status: statusTab, page: appliedFilters.page ?? 1, limit: PAGE_SIZE }),
    [appliedFilters, statusTab]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["debtors", queryFilters],
    queryFn: ({ signal }) => customerLedgerService.getDebtors(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const debtors = data?.data?.data || [];
  const meta = data?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const hasActiveFilters = Boolean(appliedFilters.search || appliedFilters.startDate || appliedFilters.endDate);

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          You do not have permission to view debited customers.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Debited</h1>
        <p className="mt-1 text-xs text-slate-500">
          {statusTab === "PENDING"
            ? "Customers currently carrying a pending balance, highest first."
            : "Customers with no current outstanding balance — settled or advance, most recent activity first."}
        </p>
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
        <Formik<DebitedFilterValues> initialValues={{ search: "", startDate: "", endDate: "" }} onSubmit={() => {}}>
          {({ resetForm }) => (
            <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <FilterSync setAppliedFilters={setAppliedFilters} />

              <div className="relative flex-1 min-w-64 max-w-xs">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Field
                  name="search"
                  type="text"
                  placeholder="Search customer name or mobile..."
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
                onClick={() => {
                  resetForm();
                  setAppliedFilters({});
                }}
                title="Reset filters"
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${
                  hasActiveFilters ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </Form>
          )}
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
            <p className="text-sm font-semibold">{(error as any)?.response?.data?.message || (error as any)?.message || "Failed to load debited customers"}</p>
          </div>
        ) : debtors.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">
              {statusTab === "PENDING" ? "No customers with a pending balance." : "No settled customers yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Sr No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Customer Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Mobile No</th>
                  <th className="px-4 py-3 whitespace-nowrap">City</th>
                  <th className="px-4 py-3 whitespace-nowrap">Total Purchase</th>
                  <th className="px-4 py-3 whitespace-nowrap">Total Paid</th>
                  <th className="px-4 py-3 whitespace-nowrap">Outstanding</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Last Transaction</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {debtors.map((debtor, idx) => (
                  <tr key={debtor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{(meta.page - 1) * meta.limit + idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{debtor.name}</td>
                    <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{debtor.phone}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{debtor.city || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">₹{debtor.totalPurchase.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">₹{debtor.totalPaid.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <BalanceBadge balance={debtor.balance} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{debtor.balance.label}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {debtor.lastTransactionDate ? formatDisplayDate(debtor.lastTransactionDate) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/customers/${debtor.id}/ledger`)}
                          className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"
                          title="View Customer Account"
                        >
                          <Wallet className="h-4 w-4" />
                        </button>
                        <ShareStatementMenu customerId={debtor.id} customerName={debtor.name} customerPhone={debtor.phone} balance={debtor.balance} compact />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && debtors.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
            <span>
              Page {meta.page} of {meta.totalPages} · {meta.total} customer{meta.total === 1 ? "" : "s"}{" "}
              {statusTab === "PENDING" ? "pending" : "settled"}
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
    </div>
  );
};

export default Debited;
