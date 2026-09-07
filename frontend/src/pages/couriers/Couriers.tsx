import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Formik, Form, Field, useFormikContext, type FormikProps } from "formik";
import { Download, ChevronDown, ExternalLink, Eye, PackageCheck, RotateCcw, Search, Truck } from "lucide-react";
import { type RootState } from "../../store/store";
import courierService, { type CourierData, type CourierFilters } from "../../services/courier.service";
import courierCompanyService, { buildTrackingLink } from "../../services/courierCompany.service";
import { initSocket } from "../../services/socket.service";
import { STATUS_LABEL, STATUS_BADGE_CLASS, type CourierStatus } from "../../shared/constants/courierStatus";
import { DELIVERY_MODE_LABEL, DELIVERY_MODE_BADGE_CLASS, DELIVERY_MODE_OPTIONS } from "../../shared/constants/deliveryMode";
import { STOCK_STATUS_LABEL, STOCK_STATUS_BADGE_CLASS } from "../../shared/constants/productStockStatus";
import { courierFilterSchema, type CourierFilterValues } from "../../validation/courier.validation";
import { useDebounce } from "../../hook/useDebounce";
import CourierEditModal from "./components/CourierEditModal";
import CourierViewModal from "./components/CourierViewModal";
import CourierStatusModal from "./components/CourierStatusModal";
import DeleteCourierModal from "./components/DeleteCourierModal";
import IncomingCourier from "./IncomingCourier";

type PagePermission = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };

const CourierStatusBadge = ({ status }: { status?: CourierStatus | string | null }) => {
    const key = (status && status in STATUS_LABEL ? status : "PENDING") as CourierStatus;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[key]}`}>
            {STATUS_LABEL[key]}
        </span>
    );
};

// Snapshot taken at courier-creation time (see backend orderService.createOrder) — never
// recomputed from current inventory, so it stays "—" (not applicable) for manually-created
// entries that have no product/stock linkage to check against.
const StockStatusBadge = ({ status }: { status?: CourierData["productStockStatus"] }) => {
    if (!status) return <span className="text-slate-300">—</span>;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STOCK_STATUS_BADGE_CLASS[status]}`}>
            {status === "IN_STOCK" ? "✓" : "⚠"} {STOCK_STATUS_LABEL[status]}
        </span>
    );
};

// Renders one courier table with its own search filter — used to show
// Pending and Completed couriers as two independently filterable lists.
const CourierTable = ({
    title,
    badgeClassName,
    couriers,
    totalCount,
    searchTerm,
    onSearchChange,
    showSearch = true,
    emptyMessage,
    pagePermission,
    highlightedSaleIds,
    onView,
    onStatus,
    onEdit,
    onDelete,
    columnsVariant = "full",
}: {
    title: string;
    badgeClassName: string;
    couriers: CourierData[];
    totalCount: number;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    /** Set false when a page-level filter bar already covers search (e.g. Outgoing) — avoids
     *  stacking two overlapping, inconsistent search controls on one page. */
    showSearch?: boolean;
    emptyMessage: string;
    pagePermission: PagePermission;
    highlightedSaleIds: Set<number>;
    onView: (courier: CourierData) => void;
    onStatus: (courier: CourierData) => void;
    onEdit: (courier: CourierData) => void;
    onDelete: (courier: CourierData) => void;
    /** "outgoing" trims the table to Sr No/Customer/Mobile/Product/Courier Company/Tracking ID/
     *  Action only — the Incoming table keeps the full column set. */
    columnsVariant?: "full" | "outgoing";
}) => {
    // Only needed to resolve a courier's tracking link (matched by company name) — same lookup
    // and queryKey CourierViewModal already uses, so react-query dedupes it to one request.
    const { data: companiesResponse } = useQuery({
        queryKey: ["courier-companies-picker"],
        queryFn: () => courierCompanyService.getCourierCompanies(),
        enabled: columnsVariant === "outgoing",
    });
    const courierCompanies = companiesResponse?.data?.data || [];

    return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">
                {title}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold align-middle ${badgeClassName}`}>
                    {totalCount}
                </span>
            </h3>
            {showSearch && (
                <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Filter by name, city, mobile, courier, track ID..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                </div>
            )}
        </div>

        {couriers.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500">{emptyMessage}</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-500">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
                        {columnsVariant === "outgoing" ? (
                            <tr>
                                <th className="px-4 py-3 whitespace-nowrap">Sr No.</th>
                                <th className="px-4 py-3 whitespace-nowrap">Customer Name</th>
                                <th className="px-4 py-3 whitespace-nowrap">Mobile</th>
                                <th className="px-4 py-3 whitespace-nowrap">Product</th>
                                <th className="px-4 py-3 whitespace-nowrap">Stock Status</th>
                                <th className="px-4 py-3 whitespace-nowrap">Courier Company Name</th>
                                <th className="px-4 py-3 whitespace-nowrap">Tracking ID</th>
                                <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                            </tr>
                        ) : (
                            <tr>
                                <th className="px-4 py-3 whitespace-nowrap">Sr No.</th>
                                <th className="px-4 py-3 whitespace-nowrap">Customer Name</th>
                                <th className="px-4 py-3 whitespace-nowrap">Address</th>
                                <th className="px-4 py-3 whitespace-nowrap">City</th>
                                <th className="px-4 py-3 whitespace-nowrap">Mobile No.</th>
                                <th className="px-4 py-3 whitespace-nowrap">Product Name</th>
                                <th className="px-4 py-3 whitespace-nowrap">Charge</th>
                                <th className="px-4 py-3 whitespace-nowrap">Free Pickup</th>
                                <th className="px-4 py-3 whitespace-nowrap">Courier Name</th>
                                <th className="px-4 py-3 whitespace-nowrap">Track ID</th>
                                <th className="px-4 py-3 whitespace-nowrap">KG</th>
                                <th className="px-4 py-3 whitespace-nowrap">Qty</th>
                                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                                <th className="px-4 py-3 whitespace-nowrap">Note</th>
                                <th className="px-4 py-3 whitespace-nowrap">Delivered Date</th>
                                <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                            </tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {couriers.map((courier, index) => {
                            const isHighlighted = !!courier.saleId && highlightedSaleIds.has(courier.saleId);
                            const matchedCompany = courierCompanies.find((c) => c.name === courier.courierName);
                            const trackingLink = buildTrackingLink(matchedCompany?.trackingLinkTemplate, courier.trackId);
                            return (
                                <tr
                                    key={courier.id}
                                    className={`transition-colors ${isHighlighted
                                        ? "bg-emerald-50 hover:bg-emerald-100/70 border-l-4 border-emerald-500"
                                        : "hover:bg-slate-50/60"
                                        }`}
                                >
                                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{index + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                                        {courier.customerName || courier.name || <span className="text-slate-300">—</span>}
                                    </td>
                                    {columnsVariant === "outgoing" ? (
                                        <>
                                            <td className="px-4 py-3 whitespace-nowrap">{courier.mobileNo || courier.phone || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">{courier.productName || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <StockStatusBadge status={courier.productStockStatus} />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">{courier.courierName || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 font-mono text-xs">
                                                {courier.trackId ? (
                                                    trackingLink ? (
                                                        <a
                                                            href={trackingLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                                                        >
                                                            {courier.trackId} <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    ) : (
                                                        courier.trackId
                                                    )
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-3 max-w-[150px] truncate" title={courier.address || ""}>
                                                {courier.address || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {courier.city
                                                    ? <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">{courier.city}</span>
                                                    : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">{courier.mobileNo || courier.phone || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">{courier.productName || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {courier.charge !== undefined && courier.charge !== null
                                                    ? <span className="font-medium text-slate-700">₹{Number(courier.charge).toFixed(2)}</span>
                                                    : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${courier.freePickup ? "bg-green-50 text-green-700 border border-green-100" : "bg-slate-100 text-slate-500"}`}>
                                                    {courier.freePickup ? "Yes" : "No"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">{courier.courierName || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{courier.trackId || <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">{courier.kg !== undefined && courier.kg !== null ? `${courier.kg} kg` : <span className="text-slate-300">—</span>}</td>
                                            <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-700">{courier.quantity ?? <span className="text-slate-300 font-normal">—</span>}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex flex-wrap items-center gap-1">
                                                    <CourierStatusBadge status={courier.status} />
                                                    {courier.deliveryMode && (
                                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${DELIVERY_MODE_BADGE_CLASS[courier.deliveryMode]}`}>
                                                            {DELIVERY_MODE_LABEL[courier.deliveryMode]}
                                                        </span>
                                                    )}
                                                    {isHighlighted && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                                            <PackageCheck className="h-3 w-3" /> Stock Arrived
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 max-w-[120px] truncate text-xs" title={courier.note || ""}>
                                                {courier.note || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-xs">
                                                {courier.completedDate || <span className="text-slate-300">—</span>}
                                            </td>
                                        </>
                                    )}
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => onView(courier)}
                                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                                                title="View"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            {pagePermission.canUpdate && (
                                                <button
                                                    onClick={() => onStatus(courier)}
                                                    className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                                                    title="Update Status"
                                                >
                                                    <Truck className="h-4 w-4" />
                                                </button>
                                            )}
                                            {pagePermission.canUpdate && (
                                                <button
                                                    onClick={() => onEdit(courier)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                                                    title="Edit"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                    </svg>
                                                </button>
                                            )}
                                            {pagePermission.canDelete && (
                                                <button
                                                    onClick={() => onDelete(courier)}
                                                    className="rounded p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                                                    title="Delete"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                    </svg>
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
    </div>
    );
};

// Pushes the Outgoing filter bar's Formik values into the applied-filters state that
// actually drives the courier query — debounced for search, immediate for the rest.
const FilterSync = ({
    setAppliedFilters,
}: {
    setAppliedFilters: React.Dispatch<React.SetStateAction<CourierFilters>>;
}) => {
    const { values } = useFormikContext<CourierFilterValues>();
    const debouncedSearch = useDebounce(values.search, 400);

    useEffect(() => {
        setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch]);

    useEffect(() => {
        setAppliedFilters((prev) => ({
            ...prev,
            startDate: values.startDate || undefined,
            endDate: values.endDate || undefined,
            deliveryMode: values.deliveryMode || undefined,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values.startDate, values.endDate, values.deliveryMode]);

    return null;
};

const Couriers = () => {
    const queryClient = useQueryClient();
    const { role, permissions } = useSelector((state: RootState) => state.auth);

    /**
     * Read permissions from the globally stored state — NO API call here.
     * Permissions are loaded once at login and stored in Redux + sessionStorage.
     */
    const pagePermission = useMemo(() => {
        if (!permissions) return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
        const p = permissions.find((p) => p.routePath.toLowerCase() === "/couriers");
        return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }, [permissions]);

    // Direction: OUT = we ship to the customer, IN = customer/vendor ships to us.
    // Driven by the ?direction= query param set by the sidebar's Outgoing/Incoming links.
    const [searchParams] = useSearchParams();
    const direction: "IN" | "OUT" = searchParams.get("direction") === "IN" ? "IN" : "OUT";

    // Outgoing-only filter bar (date range / search / delivery mode) — stays {} on the
    // Incoming tab since its FilterSync never mounts there, so Incoming's query is
    // unaffected. Export always reuses this same object so the two can never diverge.
    const [appliedFilters, setAppliedFilters] = useState<CourierFilters>({});
    const hasActiveFilters = Object.values(appliedFilters).some(Boolean);
    const filterFormRef = useRef<FormikProps<CourierFilterValues>>(null);
    const [isExportOpen, setIsExportOpen] = useState(false);

    const handleClearFilters = () => {
        filterFormRef.current?.resetForm();
        setAppliedFilters({});
    };

    const handleExport = async (format: "pdf" | "excel") => {
        try {
            const res = await courierService.exportCouriers(format, { ...appliedFilters, direction: "OUT" });
            const blob = new Blob([res.data], {
                type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `outgoing-couriers-${Date.now()}.${format === "pdf" ? "pdf" : "xlsx"}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            let message = "Export failed";
            if (err.response?.data instanceof Blob) {
                try {
                    const parsed = JSON.parse(await err.response.data.text());
                    message = parsed?.message || message;
                } catch {
                    // response wasn't JSON — fall back to the generic message
                }
            } else {
                message = err.response?.data?.message || err.message || message;
            }
            toast.error(message);
        }
    };

    // Fetch couriers — backend applies city scope + direction filter automatically. Every
    // sale line item gets an OUT courier row the moment the sale is created, so the Outgoing
    // list is the single source of truth for both "what's pending" and "what's delivered";
    // Incoming rows are always manually created.
    const { data: response, isLoading: listLoading, error: listError } = useQuery({
        queryKey: ["couriers", direction, appliedFilters],
        // Forwarding react-query's AbortSignal means a request superseded by a newer
        // search/date/delivery-mode change is actually cancelled, not left to resolve and get
        // ignored — only the response for the latest filters can ever reach the table.
        queryFn: ({ signal }) => courierService.getCouriers({ direction, ...appliedFilters }, { signal }),
        // Incoming Couriers has its own dedicated page/query (see IncomingCourier.tsx) — this
        // fetch is only needed for the Outgoing Pending/Completed tables below.
        enabled: pagePermission.canRead && direction === "OUT",
    });

    // Sales whose backordered items just got allocated by a stock receipt (live push via
    // socket — see backend inventory.controller.js#notifyBackorderAllocations). Any courier
    // row linked to that sale gets pinned/highlighted until the user notices it.
    const [highlightedSaleIds, setHighlightedSaleIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!pagePermission.canRead || direction !== "OUT") return;

        const socket = initSocket("couriers");
        const handleBackorderAllocated = (payload: {
            saleId?: number;
            invoiceNumber?: string;
            productName?: string;
            allocatedQty?: number;
        }) => {
            if (!payload?.saleId) return;
            const { saleId } = payload;

            setHighlightedSaleIds((prev) => {
                const next = new Set(prev);
                next.add(saleId);
                return next;
            });
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            toast.success(
                `${payload.productName || "Item"} restocked — ${payload.invoiceNumber || `Sale #${saleId}`} is ready to fulfill`
            );

            // Highlight fades on its own after a while so it doesn't linger forever if unseen.
            setTimeout(() => {
                setHighlightedSaleIds((prev) => {
                    const next = new Set(prev);
                    next.delete(saleId);
                    return next;
                });
            }, 20000);
        };

        socket.on("backorder_allocated", handleBackorderAllocated);
        return () => {
            socket.off("backorder_allocated", handleBackorderAllocated);
        };
    }, [pagePermission.canRead, direction, queryClient]);

    // Action-column modal state — which courier is being created/edited/viewed/
    // status-changed/deleted. Edit/Create/View/Status/Delete each have their own
    // focused component (see ./components) rather than one big inline modal.
    const [editingCourier, setEditingCourier] = useState<CourierData | null>(null);
    const [isCreatingCourier, setIsCreatingCourier] = useState(false);
    const [viewingCourier, setViewingCourier] = useState<CourierData | null>(null);
    const [statusCourier, setStatusCourier] = useState<CourierData | null>(null);
    const [deletingCourier, setDeletingCourier] = useState<CourierData | null>(null);

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

    // Mutation: Delete
    const deleteMutation = useMutation({
        mutationFn: (id: number) => courierService.deleteCourier(id),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier deleted successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            queryClient.invalidateQueries({ queryKey: ["courier-charge"] });
            setDeletingCourier(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to delete courier");
        },
    });

    const handleConfirmDelete = () => {
        if (deletingCourier?.id) {
            deleteMutation.mutate(deletingCourier.id);
        }
    };

    // Mutation: Status change
    const statusMutation = useMutation({
        mutationFn: ({ id, status }: { id: number; status: string }) =>
            courierService.updateCourier(id, { status: status as CourierData["status"] }),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Status updated successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            queryClient.invalidateQueries({ queryKey: ["courier-charge"] });
            setStatusCourier(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to update status");
        },
    });

    const couriersList: CourierData[] = response?.data?.data || [];

    // Incoming keeps its own simple client-side search box (out of scope for this feature —
    // Outgoing's search/date/delivery-mode filtering happens server-side via appliedFilters,
    // so couriersList is already the filtered set there).
    const [pendingSearch, setPendingSearch] = useState("");
    const [completedSearch, setCompletedSearch] = useState("");

    const pendingCouriers = couriersList.filter((c) => c.pending);
    const completedCouriers = couriersList.filter((c) => !c.pending);

    // Incoming Couriers has its own dedicated page (own table, filters, pagination, and Done
    // workflow) — see IncomingCourier.tsx. Everything below this point is Outgoing-only.
    if (direction === "IN") {
        return <IncomingCourier />;
    }

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <h2 className="text-lg font-bold text-slate-900">Outgoing Couriers</h2>
                <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-start sm:justify-end">
                    {pagePermission.canCreate && (
                        <button
                            onClick={openCreateModal}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-[#3162d2] active:scale-[0.98] sm:self-start"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Add Courier
                        </button>
                    )}
                </div>
            </div>

            {pagePermission.canRead && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <Formik
                        innerRef={filterFormRef}
                        initialValues={{ search: "", startDate: "", endDate: "", deliveryMode: "" } as CourierFilterValues}
                        validate={(values) => {
                            const result = courierFilterSchema.safeParse(values);
                            return result.success ? {} : { search: result.error.issues[0]?.message };
                        }}
                        onSubmit={() => { }}
                    >
                        <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                            <FilterSync setAppliedFilters={setAppliedFilters} />

                            <div className="relative flex-1 min-w-50 max-w-xs">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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
                                name="deliveryMode"
                                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
                            >
                                <option value="">All Types</option>
                                {DELIVERY_MODE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </Field>

                            <button
                                type="button"
                                onClick={handleClearFilters}
                                title={hasActiveFilters ? "Clear filters" : "Reset filters"}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${hasActiveFilters
                                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    }`}
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                {hasActiveFilters ? "Clear Filters" : "Reset"}
                            </button>

                            {hasActiveFilters && (
                                <span className="text-[11px] font-semibold text-blue-600">Filters active</span>
                            )}

                            <div className="relative sm:ml-auto">
                                <button
                                    type="button"
                                    onClick={() => setIsExportOpen((o) => !o)}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Export
                                    <ChevronDown className="h-3 w-3" />
                                </button>
                                {isExportOpen && (
                                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleExport("pdf");
                                                setIsExportOpen(false);
                                            }}
                                            className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                        >
                                            Export as PDF
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleExport("excel");
                                                setIsExportOpen(false);
                                            }}
                                            className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                        >
                                            Export as Excel
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Form>
                    </Formik>
                    {!hasActiveFilters && (
                        <p className="mt-2 text-[11px] text-slate-400">
                            No filters applied — Export will use the current month's records.
                        </p>
                    )}
                </div>
            )}

            {/* Table(s) */}
            {listLoading ? (
                <div className="mt-6 flex min-h-75 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
                        <span className="text-sm text-slate-500">Retrieving courier records...</span>
                    </div>
                </div>
            ) : listError ? (
                <div className="mt-6 flex min-h-75 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm font-medium text-red-500">Failed to load courier list</p>
                    <p className="text-xs text-slate-400">{(listError as any).message || "An unexpected error occurred"}</p>
                </div>
            ) : !pagePermission.canRead ? (
                <div className="mt-6 flex min-h-75 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm font-medium text-slate-500">You do not have permission to view couriers.</p>
                </div>
            ) : couriersList.length === 0 ? (
                <div className="mt-6 flex min-h-75 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                    </div>
                    {hasActiveFilters ? (
                        <>
                            <h3 className="mt-4 text-sm font-semibold text-slate-900">No Couriers Match Your Filters</h3>
                            <p className="mt-1 text-xs text-slate-500">
                                Try adjusting the date range, search term, or delivery mode.
                            </p>
                            <button
                                type="button"
                                onClick={handleClearFilters}
                                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Clear Filters
                            </button>
                        </>
                    ) : (
                        <>
                            <h3 className="mt-4 text-sm font-semibold text-slate-900">No Couriers Found</h3>
                            <p className="mt-1 text-xs text-slate-500">
                                Click the button above to add your first courier record.
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <div className="mt-6 flex flex-col gap-6">
                    <CourierTable
                        title="Pending"
                        badgeClassName="bg-amber-50 text-amber-700"
                        couriers={pendingCouriers}
                        totalCount={pendingCouriers.length}
                        searchTerm={pendingSearch}
                        onSearchChange={setPendingSearch}
                        showSearch={false}
                        emptyMessage={
                            hasActiveFilters
                                ? "No pending shipments match your filters."
                                : "No pending shipments."
                        }
                        pagePermission={pagePermission}
                        highlightedSaleIds={highlightedSaleIds}
                        onView={setViewingCourier}
                        onStatus={setStatusCourier}
                        onEdit={openEditModal}
                        onDelete={setDeletingCourier}
                        columnsVariant="outgoing"
                    />
                    <CourierTable
                        title="Completed"
                        badgeClassName="bg-green-50 text-green-700"
                        couriers={completedCouriers}
                        totalCount={completedCouriers.length}
                        searchTerm={completedSearch}
                        onSearchChange={setCompletedSearch}
                        showSearch={false}
                        emptyMessage={
                            hasActiveFilters
                                ? "No completed couriers match your filters."
                                : "No completed couriers."
                        }
                        pagePermission={pagePermission}
                        highlightedSaleIds={highlightedSaleIds}
                        onView={setViewingCourier}
                        onStatus={setStatusCourier}
                        onEdit={openEditModal}
                        onDelete={setDeletingCourier}
                        columnsVariant="outgoing"
                    />
                </div>
            )}

            {/* Create / Edit Modal */}
            {isEditModalOpen && (
                <CourierEditModal
                    courier={editingCourier}
                    direction={direction}
                    role={role}
                    onClose={closeEditModal}
                />
            )}

            {/* View Modal */}
            {viewingCourier && (
                <CourierViewModal courier={viewingCourier} onClose={() => setViewingCourier(null)} />
            )}

            {/* Status Modal */}
            {statusCourier && (
                <CourierStatusModal
                    courier={statusCourier}
                    onClose={() => setStatusCourier(null)}
                    isSubmitting={statusMutation.isPending}
                    onConfirm={(status) => statusCourier.id && statusMutation.mutate({ id: statusCourier.id, status })}
                />
            )}

            {/* Delete Modal */}
            {deletingCourier && (
                <DeleteCourierModal
                    courier={deletingCourier}
                    onClose={() => setDeletingCourier(null)}
                    isSubmitting={deleteMutation.isPending}
                    onConfirm={handleConfirmDelete}
                />
            )}

        </div>
    );
};

export default Couriers;
