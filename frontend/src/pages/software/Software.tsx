import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Field, Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import { AppWindow, Search as SearchIcon, Plus, Edit2, Trash2, XCircle, RotateCcw, AlertTriangle, Lock } from "lucide-react";
import { useDebounce } from "@/hook/useDebounce";
import { type RootState } from "../../store/store";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import type { ProductData } from "../../services/product.service";
import softwareService, { type SoftwareFilters, type UpdateSoftwarePayload } from "../../services/software.service";
import { softwareFormSchema } from "@/validation/product.validation";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface SoftwareFormValues {
  name: string;
  description: string;
  isActive: boolean;
  purchasePrice: number | "";
  sellingPrice: number | "";
}

interface FilterValues {
  search: string;
  status: string;
}

const EMPTY_FORM_VALUES: SoftwareFormValues = {
  name: "",
  description: "",
  isActive: true,
  purchasePrice: "",
  sellingPrice: "",
};

const DEFAULT_FILTERS: SoftwareFilters = { status: "active" };
const PAGE_SIZE_OPTIONS = [10, 25, 50];

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `₹${Number(value).toLocaleString("en-IN")}`;

const toAmount = (v: number | "") => (v === "" ? null : Number(v));

/** Applies filter form values to the fetched list — search is debounced, status applies immediately. */
const FilterSync = ({ setAppliedFilters }: { setAppliedFilters: React.Dispatch<React.SetStateAction<SoftwareFilters>> }) => {
  const { values } = useFormikContext<FilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
  }, [debouncedSearch, setAppliedFilters]);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, status: (values.status || undefined) as SoftwareFilters["status"], page: 1 }));
  }, [values.status, setAppliedFilters]);

  return null;
};

const Software = () => {
  const queryClient = useQueryClient();
  const { permissions } = useSelector((state: RootState) => state.auth);

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    return permissions?.find((p) => p.routePath.toLowerCase() === "/software") ?? fallback;
  }, [permissions]);

  const [appliedFilters, setAppliedFilters] = useState<SoftwareFilters>(DEFAULT_FILTERS);
  const [pageSize, setPageSize] = useState(10);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selected, setSelected] = useState<ProductData | null>(null);

  const queryFilters = useMemo<SoftwareFilters>(
    // Leaves out "Other"/quick-add rows created from the Sells form — not real catalog items.
    () => ({ ...appliedFilters, masterOnly: true, page: appliedFilters.page ?? 1, limit: pageSize }),
    [appliedFilters, pageSize]
  );

  const { data: listResponse, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["software", queryFilters],
    queryFn: ({ signal }) => softwareService.getSoftware(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const softwareList: ProductData[] = listResponse?.data?.data || [];
  const paginationMeta = listResponse?.data?.meta || { page: 1, limit: pageSize, total: 0, totalPages: 1 };
  const hasNonDefaultFilters = Boolean(appliedFilters.search || (appliedFilters.status && appliedFilters.status !== "active"));

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setSelected(null);
  };

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ["software"] });
    // Software is still sold through the Sells product picker, which reads /products.
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const onMutationError = (fallback: string) => (err: ApiErrorLike) => {
    toast.error(err.response?.data?.message || err.message || fallback);
  };

  const createMutation = useMutation({
    mutationFn: softwareService.createSoftware,
    onSuccess: (res) => {
      toast.success(res.data?.message || "Software created successfully");
      invalidateLists();
      closeFormModal();
    },
    onError: onMutationError("Failed to create software"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSoftwarePayload }) => softwareService.updateSoftware(id, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Software updated successfully");
      invalidateLists();
      closeFormModal();
    },
    onError: onMutationError("Failed to update software"),
  });

  const deleteMutation = useMutation({
    mutationFn: softwareService.deleteSoftware,
    onSuccess: (res) => {
      toast.success(res.data?.message || "Software deactivated successfully");
      invalidateLists();
    },
    onError: onMutationError("Failed to deactivate software"),
  });

  const openCreateModal = () => {
    setSelected(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (item: ProductData) => {
    setSelected(item);
    setIsFormModalOpen(true);
  };

  const handleDelete = (item: ProductData) => {
    if (window.confirm(`Are you sure you want to deactivate "${item.name}"? It will no longer be sellable.`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const validateForm = (values: SoftwareFormValues) => {
    const result = softwareFormSchema.safeParse(values);
    if (result.success) return {};
    return result.error.issues.reduce<Record<string, string>>((errors, issue) => {
      const field = issue.path.join(".");
      if (!errors[field]) errors[field] = issue.message;
      return errors;
    }, {});
  };

  const handleSubmit = (values: SoftwareFormValues, helpers: FormikHelpers<SoftwareFormValues>) => {
    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      purchasePrice: toAmount(values.purchasePrice),
      sellingPrice: toAmount(values.sellingPrice),
    };
    const onSettled = () => helpers.setSubmitting(false);

    if (selected) {
      updateMutation.mutate({ id: selected.id, data: { ...payload, isActive: values.isActive } }, { onSettled });
    } else {
      createMutation.mutate(payload, { onSettled });
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      {/* Filters */}
      <div className="rounded-2xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-slate-200 bg-white p-4 shadow-sm">
        <Formik<FilterValues> initialValues={{ search: "", status: "active" }} onSubmit={() => undefined}>
          {({ resetForm }) => (
            <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <FilterSync setAppliedFilters={setAppliedFilters} />

              <div className="relative flex-1 min-w-50 max-w-md">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Field name="search" type="text" placeholder="Search by name or description..." className="w-full form-input pl-9" component={FormikInput} />
              </div>

              <Field
                as="select"
                name="status"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Field>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setAppliedFilters(DEFAULT_FILTERS);
                }}
                title="Reset filters"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </Form>
          )}
        </Formik>

        {pagePermission.canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3d6fe0] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#3162d2] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Add Software</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {!pagePermission.canRead ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
            <Lock className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">You do not have permission to view software.</p>
            <p className="text-xs text-slate-400">Contact an administrator if you believe this is a mistake.</p>
          </div>
        ) : isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center text-rose-500 gap-2 px-6 text-center">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm font-semibold">
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load software"}
            </p>
          </div>
        ) : softwareList.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
            <AppWindow className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">{hasNonDefaultFilters ? "No software matches your filters." : "No software found."}</p>
            {hasNonDefaultFilters ? (
              <button
                type="button"
                onClick={() => setAppliedFilters(DEFAULT_FILTERS)}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Filters
              </button>
            ) : (
              pagePermission.canCreate && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3162d2]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Software
                </button>
              )
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Sr.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Purchase Price</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Selling Price</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {softwareList.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-slate-400 font-medium whitespace-nowrap">
                      {(paginationMeta.page - 1) * paginationMeta.limit + index + 1}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 whitespace-nowrap">{item.name}</div>
                      {item.description && <div className="text-[11px] text-slate-400 max-w-xs truncate">{item.description}</div>}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{formatCurrency(item.purchasePrice)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{formatCurrency(item.sellingPrice)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {pagePermission.canUpdate && (
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            title="Edit Software"
                            className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {pagePermission.canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={!item.isActive}
                            title={item.isActive ? "Deactivate Software" : "Software is already inactive"}
                            className="rounded p-1 text-rose-500 hover:bg-rose-50 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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

        {pagePermission.canRead && !isLoading && !isError && softwareList.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {paginationMeta.page} of {paginationMeta.totalPages} · {paginationMeta.total} total software
              {isFetching && <span className="ml-2 text-slate-400">(refreshing…)</span>}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-slate-500">
                Rows:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setAppliedFilters((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#3d6fe0] focus:outline-none"
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
                  disabled={paginationMeta.page <= 1}
                  onClick={() => setAppliedFilters((prev) => ({ ...prev, page: Math.max(1, paginationMeta.page - 1) }))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={paginationMeta.page >= paginationMeta.totalPages}
                  onClick={() => setAppliedFilters((prev) => ({ ...prev, page: Math.min(paginationMeta.totalPages, paginationMeta.page + 1) }))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFormModal();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">{selected ? "Edit Software" : "Add New Software"}</h3>
              <button
                type="button"
                onClick={closeFormModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <Formik<SoftwareFormValues>
              initialValues={
                selected
                  ? {
                      name: selected.name || "",
                      description: selected.description || "",
                      isActive: selected.isActive ?? true,
                      purchasePrice: selected.purchasePrice ?? "",
                      sellingPrice: selected.sellingPrice ?? "",
                    }
                  : EMPTY_FORM_VALUES
              }
              enableReinitialize
              validate={validateForm}
              onSubmit={handleSubmit}
            >
              {({ values, setFieldValue, isSubmitting }) => (
                <Form className="mt-5 space-y-4">
                  <Field name="name" label="Software Name *" placeholder="e.g. Diagnostic Software License" component={FormikInput} />
                  <Field name="description" label="Description" placeholder="Optional details" multiline component={FormikInput} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field name="purchasePrice" type="number" label="Purchase Price" placeholder="0.00" component={FormikInput} />
                    <Field name="sellingPrice" type="number" label="Selling Price" placeholder="0.00" component={FormikInput} />
                  </div>

                  {selected && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={values.isActive}
                        onChange={(e) => setFieldValue("isActive", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#3d6fe0] focus:ring-[#3d6fe0]"
                      />
                      Active (available for sale)
                    </label>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={closeFormModal}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || isMutating}
                      className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#3162d2] disabled:opacity-50 transition"
                    >
                      {isSubmitting || isMutating ? "Saving..." : selected ? "Update Software" : "Create Software"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}
    </div>
  );
};

export default Software;
