import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { Edit2, Trash2, Plus, RotateCcw, Search as SearchIcon } from "lucide-react";
import type { RootState } from "@/store/store";
import bankAccountService, { type BankAccountData, type BankAccountFilters } from "@/services/bankAccount.service";
import { bankAccountFilterSchema, type BankAccountFilterValues } from "@/validation/bankAccount.validation";
import { useDebounce } from "@/hook/useDebounce";
import BankAccountFormModal from "./components/BankAccountFormModal";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<BankAccountFilters>>;
}) => {
  const { values } = useFormikContext<BankAccountFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, isActive: values.isActive || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.isActive]);

  return null;
};

const BankAccounts = () => {
  const queryClient = useQueryClient();
  const { permissions } = useSelector((state: RootState) => state.auth);
  // const { role } = useSelector((state: RootState) => state.auth);

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    if (!permissions) return fallback;
    return (
      permissions.find(
        (p) => p.routePath.toLowerCase() === "/account/bank-accounts" || p.routeName.toLowerCase() === "bank accounts"
      ) ?? fallback
    );
  }, [permissions]);

  const [appliedFilters, setAppliedFilters] = useState<BankAccountFilters>({});
  const [pageSize, setPageSize] = useState(10);
  const filterFormRef = useRef<FormikProps<BankAccountFilterValues>>(null);

  const [editAccount, setEditAccount] = useState<BankAccountData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState<BankAccountData | null>(null);

  const queryFilters = useMemo<BankAccountFilters>(
    () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: pageSize }),
    [appliedFilters, pageSize]
  );

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["bank-accounts", queryFilters],
    queryFn: ({ signal }) => bankAccountService.getBankAccounts(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const accounts = response?.data?.data || [];
  const meta = response?.data?.meta || { page: 1, limit: pageSize, total: 0, totalPages: 1 };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => bankAccountService.deleteBankAccount(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Bank account deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      setDeleteAccount(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete bank account");
    },
  });

  const hasActiveFilters = Boolean(appliedFilters.search || appliedFilters.isActive);

  const handleReset = () => {
    filterFormRef.current?.resetForm();
    setAppliedFilters({});
  };

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          You do not have permission to view bank accounts.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">Manage Bank Account Details</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          These accounts are available for selection in Sells whenever Payment Method is Bank Transfer.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between text-xs">
        <Formik
          innerRef={filterFormRef}
          initialValues={{ search: "", isActive: "" } as BankAccountFilterValues}
          validate={(values) => {
            const result = bankAccountFilterSchema.safeParse(values);
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
                placeholder="Search bank, holder, account no, IFSC..."
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
              />
            </div>

            <Field
              as="select"
              name="isActive"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
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
              <Plus className="h-4 w-4" /> Add Bank Account
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-48 flex-col items-center justify-center text-red-500 gap-1 text-center px-4">
            <p className="text-sm font-semibold">
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load bank accounts"}
            </p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500">No bank accounts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Sr No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Bank Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Account Holder</th>
                  <th className="px-4 py-3 whitespace-nowrap">Account Number</th>
                  <th className="px-4 py-3 whitespace-nowrap">IFSC / Branch</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((acc, idx) => (
                  <tr key={acc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {(meta.page - 1) * meta.limit + idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{acc.bankName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{acc.accountHolderName || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-700">{acc.accountNumber || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      <div>{acc.ifscCode || "—"}</div>
                      {acc.branchName && <div className="text-xs text-gray-400">{acc.branchName}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${acc.isActive ? "bg-green-50 text-green-700 border border-green-100" : "bg-slate-100 text-slate-500"
                          }`}
                      >
                        {acc.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {/* {role === "admin" && (
                          <button></button>
                        )} */}
                        
                        {pagePermission.canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditAccount(acc)}
                            className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {pagePermission.canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleteAccount(acc)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {(showAddModal || editAccount) && (
        <BankAccountFormModal
          account={editAccount}
          onClose={() => {
            setShowAddModal(false);
            setEditAccount(null);
          }}
        />
      )}
      {deleteAccount && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteAccount(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Delete Bank Account</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to delete <span className="font-semibold text-slate-700">{deleteAccount.bankName}</span>
              {deleteAccount.accountNumber ? ` (${deleteAccount.accountNumber})` : ""}? Existing sales that already used this account are unaffected. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteAccount(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteAccount.id && deleteMutation.mutate(deleteAccount.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAccounts;
