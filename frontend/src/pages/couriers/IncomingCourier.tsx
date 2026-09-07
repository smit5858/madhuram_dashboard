import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Formik, Form, Field, useFormikContext, type FormikProps } from "formik";
import { CheckCircle2, Eye, PackageCheck, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { type RootState } from "../../store/store";
import courierService, { type CourierData, type CourierFilters } from "../../services/courier.service";
import { useDebounce } from "../../hook/useDebounce";
import { incomingCourierFilterSchema, type IncomingCourierFilterValues } from "../../validation/courier.validation";
import FormikInput from "../../shared/components/formik-fields/FormikInput";
import CourierEditModal from "./components/CourierEditModal";
import CourierViewModal from "./components/CourierViewModal";
import DeleteCourierModal from "./components/DeleteCourierModal";
import IncomingCourierDoneModal from "./components/IncomingCourierDoneModal";

const PAGE_SIZE = 10;

// Pushes the filter bar's debounced search value into the applied-filter state that actually
// drives the courier query. Mirrors Couriers.tsx's FilterSync.
const IncomingFilterSync = ({ onSearchChange }: { onSearchChange: (value: string) => void }) => {
    const { values } = useFormikContext<IncomingCourierFilterValues>();
    const debouncedSearch = useDebounce(values.search || "", 400);

    useEffect(() => {
        onSearchChange(debouncedSearch.trim());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch]);

    return null;
};

/** Dedicated Incoming Courier module: paginated table (Sr No / Customer / Address / Product /
 *  Quantity / Actions), an auto-updating search filter (no Apply button), and the View / Edit /
 *  Delete (Admin-only) / Done actions. Only PENDING entries ever show here — once one is marked
 *  Done it moves on: the backend creates the mirrored Outgoing Courier + Accounts entries (see
 *  courier.controller.js#completeIncomingCourier) and this list stops returning it, so it's
 *  visible in Outgoing Courier from then on instead of lingering here as "completed". */
const IncomingCourier = () => {
    const queryClient = useQueryClient();
    const { role, permissions } = useSelector((state: RootState) => state.auth);

    const pagePermission = useMemo(() => {
        if (!permissions) return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
        const p = permissions.find((p) => p.routePath.toLowerCase() === "/couriers/incoming");
        return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }, [permissions]);

    // Filters — search is debounced and updates the table without an Apply button (see
    // IncomingFilterSync). Status is not user-filterable: this list always shows PENDING entries
    // only, since a Done entry is meant to disappear from here and appear in Outgoing Courier.
    const [appliedSearch, setAppliedSearch] = useState("");
    const [page, setPage] = useState(1);
    const hasActiveFilters = !!appliedSearch;
    const filterFormRef = useRef<FormikProps<IncomingCourierFilterValues>>(null);

    const handleSearchChange = (value: string) => {
        setAppliedSearch(value);
        setPage(1);
    };

    const activeFilters = useMemo<CourierFilters & { direction: "IN" }>(
        () => ({
            direction: "IN",
            status: "PENDING",
            page,
            limit: PAGE_SIZE,
            search: appliedSearch || undefined,
        }),
        [appliedSearch, page]
    );

    const { data: response, isLoading, isFetching, isError, error } = useQuery({
        queryKey: ["couriers", "IN", activeFilters],
        // Forwarding react-query's AbortSignal means a request superseded by a newer
        // search/page/filter change is actually cancelled, not left to resolve and get ignored.
        queryFn: ({ signal }) => courierService.getCouriers(activeFilters, { signal }),
        enabled: pagePermission.canRead,
    });

    const couriersList: CourierData[] = response?.data?.data || [];
    const meta = response?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

    const handleResetFilters = () => {
        filterFormRef.current?.resetForm();
        setAppliedSearch("");
        setPage(1);
    };

    // Action-column modal state
    const [editingCourier, setEditingCourier] = useState<CourierData | null>(null);
    const [isCreatingCourier, setIsCreatingCourier] = useState(false);
    const [viewingCourier, setViewingCourier] = useState<CourierData | null>(null);
    const [deletingCourier, setDeletingCourier] = useState<CourierData | null>(null);
    const [completingCourier, setCompletingCourier] = useState<CourierData | null>(null);

    const openCreateModal = () => {
        setEditingCourier(null);
        setIsCreatingCourier(true);
    };
    const openEditModal = (courier: CourierData) => {
        setEditingCourier(courier);
        setIsCreatingCourier(false);
    };
    const closeEditModal = () => {
        setEditingCourier(null);
        setIsCreatingCourier(false);
    };
    const isEditModalOpen = isCreatingCourier || !!editingCourier;

    const deleteMutation = useMutation({
        mutationFn: (id: number) => courierService.deleteCourier(id),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier deleted successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers", "IN"] });
            setDeletingCourier(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to delete courier");
        },
    });

    const doneMutation = useMutation({
        mutationFn: (id: number) => courierService.completeIncomingCourier(id),
        onSuccess: (res) => {
            toast.success(
                res.data?.message || "Incoming courier completed — Outgoing Courier and Accounts entries created"
            );
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            // Marking Done auto-creates an Outgoing courier carrying over the charge — refresh
            // the header's Courier Charge pill too.
            queryClient.invalidateQueries({ queryKey: ["courier-charge"] });
            setCompletingCourier(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to complete incoming courier");
        },
    });

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-bold text-slate-900">Incoming Couriers</h2>
                {pagePermission.canCreate && (
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-[#3162d2] active:scale-[0.98] sm:self-start"
                    >
                        <Plus className="h-4 w-4" />
                        Add New Incoming Courier
                    </button>
                )}
            </div>

            {/* Filters — auto-apply, no Apply button */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Formik
                    innerRef={filterFormRef}
                    initialValues={{ search: "" } as IncomingCourierFilterValues}
                    validate={(values) => {
                        const result = incomingCourierFilterSchema.safeParse(values);
                        return result.success ? {} : { search: result.error.issues[0]?.message };
                    }}
                    onSubmit={() => { }}
                >
                    <Form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,320px)_auto_1fr]">
                        <IncomingFilterSync onSearchChange={handleSearchChange} />

                        <Field
                            name="search"
                            label="Search"
                            placeholder="Customer, phone, or product"
                            component={FormikInput}
                        />

                        <button
                            type="button"
                            onClick={handleResetFilters}
                            title="Reset filters"
                            className={`inline-flex h-11.75 items-center justify-center gap-1.5 rounded-full border px-4 text-xs font-semibold ${hasActiveFilters
                                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reset
                        </button>

                        <div className="flex h-11.75 items-center gap-2 sm:justify-end">
                            {hasActiveFilters && <span className="text-[11px] font-semibold text-blue-600">Filters active</span>}
                            {isFetching && !isLoading && <span className="text-[11px] text-slate-400">Refreshing…</span>}
                        </div>
                    </Form>
                </Formik>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="mt-2 flex min-h-75 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
                        <span className="text-sm text-slate-500">Retrieving incoming courier records...</span>
                    </div>
                </div>
            ) : isError ? (
                <div className="mt-2 flex min-h-75 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm font-medium text-red-500">Failed to load incoming courier list</p>
                    <p className="text-xs text-slate-400">{(error as any)?.response?.data?.message || (error as any)?.message || "An unexpected error occurred"}</p>
                </div>
            ) : !pagePermission.canRead ? (
                <div className="mt-2 flex min-h-75 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm font-medium text-slate-500">You do not have permission to view couriers.</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    {couriersList.length === 0 ? (
                        <div className="flex min-h-60 flex-col items-center justify-center p-6 text-center">
                            <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                                <PackageCheck className="h-6 w-6" />
                            </div>
                            {hasActiveFilters ? (
                                <>
                                    <h3 className="mt-4 text-sm font-semibold text-slate-900">No Incoming Couriers Match Your Search</h3>
                                    <p className="mt-1 text-xs text-slate-500">Try adjusting the search term.</p>
                                    <button
                                        type="button"
                                        onClick={handleResetFilters}
                                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        Reset Filters
                                    </button>
                                </>
                            ) : (
                                <>
                                    <h3 className="mt-4 text-sm font-semibold text-slate-900">No Incoming Courier Records</h3>
                                    <p className="mt-1 text-xs text-slate-500">Click "Add New Incoming Courier" to create the first record.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm text-slate-500">
                                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
                                    <tr>
                                        <th className="px-4 py-3 whitespace-nowrap">Sr. No.</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Customer Name</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Address</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Product Name</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Quantity</th>
                                        <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {couriersList.map((courier, index) => {
                                        return (
                                            <tr key={courier.id} className="transition-colors hover:bg-slate-50/60">
                                                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                                                    {(meta.page - 1) * meta.limit + index + 1}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                                                    {courier.customerName || courier.name || <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 max-w-[220px] truncate" title={courier.address || ""}>
                                                    {courier.address || <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {courier.productName || <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-700">
                                                    {courier.quantity ?? <span className="text-slate-300 font-normal">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => setViewingCourier(courier)}
                                                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                                                            title="View"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </button>
                                                        {pagePermission.canUpdate && (
                                                            <button
                                                                onClick={() => openEditModal(courier)}
                                                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                                                                title="Edit"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {pagePermission.canUpdate && (
                                                            <button
                                                                onClick={() => setCompletingCourier(courier)}
                                                                className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                                                title="Mark Done — sends to Outgoing Courier + Accounts"
                                                            >
                                                                <CheckCircle2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {pagePermission.canDelete && (
                                                            <button
                                                                onClick={() => setDeletingCourier(courier)}
                                                                className="rounded p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {couriersList.length > 0 && (
                        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                            <span>
                                Page {meta.page} of {meta.totalPages} · {meta.total} total incoming couriers
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={meta.page <= 1}
                                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    disabled={meta.page >= meta.totalPages}
                                    onClick={() => setPage((prev) => Math.min(meta.totalPages, prev + 1))}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Create / Edit Modal */}
            {isEditModalOpen && (
                <CourierEditModal courier={editingCourier} direction="IN" role={role} onClose={closeEditModal} />
            )}

            {/* View Modal */}
            {viewingCourier && <CourierViewModal courier={viewingCourier} onClose={() => setViewingCourier(null)} />}

            {/* Delete Modal — Admin-only action, gated by pagePermission.canDelete above */}
            {deletingCourier && (
                <DeleteCourierModal
                    courier={deletingCourier}
                    onClose={() => setDeletingCourier(null)}
                    isSubmitting={deleteMutation.isPending}
                    onConfirm={() => deletingCourier.id && deleteMutation.mutate(deletingCourier.id)}
                />
            )}

            {/* Done Modal — creates Outgoing Courier + Accounts entries */}
            {completingCourier && (
                <IncomingCourierDoneModal
                    courier={completingCourier}
                    onClose={() => setCompletingCourier(null)}
                    isSubmitting={doneMutation.isPending}
                    onConfirm={() => completingCourier.id && doneMutation.mutate(completingCourier.id)}
                />
            )}
        </div>
    );
};

export default IncomingCourier;
