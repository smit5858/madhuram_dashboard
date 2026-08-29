import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, PackageCheck, Search, Truck } from "lucide-react";
import { type RootState } from "../../store/store";
import courierService, { type CourierData } from "../../services/courier.service";
import { normalizePhoneForWhatsApp, openCourierWhatsApp } from "../../shared/utils/whatsapp";
import { initSocket } from "../../services/socket.service";
import { STATUS_LABEL, STATUS_BADGE_CLASS, type CourierStatus } from "../../shared/constants/courierStatus";
import CourierEditModal from "./components/CourierEditModal";
import CourierViewModal from "./components/CourierViewModal";
import CourierStatusModal from "./components/CourierStatusModal";
import DeleteCourierModal from "./components/DeleteCourierModal";

type PagePermission = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };

const CourierStatusBadge = ({ status }: { status?: CourierStatus | string | null }) => {
    const key = (status && status in STATUS_LABEL ? status : "PENDING") as CourierStatus;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[key]}`}>
            {STATUS_LABEL[key]}
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
    emptyMessage,
    pagePermission,
    highlightedSaleIds,
    onView,
    onStatus,
    onEdit,
    onDelete,
    onWhatsApp,
}: {
    title: string;
    badgeClassName: string;
    couriers: CourierData[];
    totalCount: number;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    emptyMessage: string;
    pagePermission: PagePermission;
    highlightedSaleIds: Set<number>;
    onView: (courier: CourierData) => void;
    onStatus: (courier: CourierData) => void;
    onEdit: (courier: CourierData) => void;
    onDelete: (courier: CourierData) => void;
    onWhatsApp: (courier: CourierData) => void;
}) => (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">
                {title}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold align-middle ${badgeClassName}`}>
                    {totalCount}
                </span>
            </h3>
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
        </div>

        {couriers.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500">{emptyMessage}</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-500">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
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
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {couriers.map((courier, index) => {
                            const isHighlighted = !!courier.saleId && highlightedSaleIds.has(courier.saleId);
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
                                        <div className="flex items-center gap-1">
                                            <CourierStatusBadge status={courier.status} />
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
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            {normalizePhoneForWhatsApp(courier.mobileNo || courier.phone || "") && (
                                                <button
                                                    onClick={() => onWhatsApp(courier)}
                                                    className="rounded p-1.5 text-green-600 hover:bg-green-50 hover:text-green-700"
                                                    title="Send WhatsApp message"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 004.74 1.21h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0012.04 2zm0 18.14h-.003a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.26-4.37c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.83c0 4.55-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.18-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.48-1.39-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.54.12.17 1.74 2.65 4.21 3.72.59.25 1.05.4 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29z" />
                                                    </svg>
                                                </button>
                                            )}
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

    // Fetch couriers — backend applies city scope + direction filter automatically. Every
    // sale line item gets an OUT courier row the moment the sale is created, so the Outgoing
    // list is the single source of truth for both "what's pending" and "what's delivered";
    // Incoming rows are always manually created.
    const { data: response, isLoading: listLoading, error: listError } = useQuery({
        queryKey: ["couriers", direction],
        queryFn: () => courierService.getCouriers({ direction }),
        enabled: pagePermission.canRead,
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
            setStatusCourier(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to update status");
        },
    });

    const handleWhatsAppShare = (courier: CourierData) => {
        const sent = openCourierWhatsApp(courier.mobileNo || courier.phone, {
            customerName: courier.customerName || courier.name,
            productName: courier.productName,
            quantity: courier.quantity,
            courierName: courier.courierName,
            trackId: courier.trackId,
            amount: courier.charge,
        });
        if (!sent) {
            toast.error("This courier record has no usable phone number");
        }
    };

    const couriersList: CourierData[] = response?.data?.data || [];

    // "Pending" (Pending / Waiting for Stock / In Progress / Out for Delivery) and "Completed"
    // (Done) — each independently filterable by its own search box.
    const [pendingSearch, setPendingSearch] = useState("");
    const [completedSearch, setCompletedSearch] = useState("");

    const matchesSearch = (courier: CourierData, term: string) => {
        const q = term.trim().toLowerCase();
        if (!q) return true;
        return [
            courier.customerName,
            courier.name,
            courier.address,
            courier.city,
            courier.mobileNo,
            courier.phone,
            courier.productName,
            courier.courierName,
            courier.trackId,
            courier.note,
        ].some((value) => (value || "").toString().toLowerCase().includes(q));
    };

    const pendingCouriers = couriersList.filter((c) => c.pending);
    const completedCouriers = couriersList.filter((c) => !c.pending);
    const filteredPendingCouriers = pendingCouriers.filter((c) => matchesSearch(c, pendingSearch));
    const filteredCompletedCouriers = completedCouriers.filter((c) => matchesSearch(c, completedSearch));
    // Incoming has no Pending/Completed split — one flat, searchable list (reuses pendingSearch).
    const filteredIncomingCouriers = couriersList.filter((c) => matchesSearch(c, pendingSearch));

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">
                    {direction === "OUT" ? "Outgoing Couriers" : "Incoming Couriers"}
                </h2>
                {pagePermission.canCreate && (
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-[#3162d2] active:scale-[0.98]"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Courier
                    </button>
                )}
            </div>

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
                    <h3 className="mt-4 text-sm font-semibold text-slate-900">No Couriers Found</h3>
                    <p className="mt-1 text-xs text-slate-500">
                        Click the button above to add your first courier record.
                    </p>
                </div>
            ) : direction === "OUT" ? (
                <div className="mt-6 flex flex-col gap-6">
                    <CourierTable
                        title="Pending"
                        badgeClassName="bg-amber-50 text-amber-700"
                        couriers={filteredPendingCouriers}
                        totalCount={pendingCouriers.length}
                        searchTerm={pendingSearch}
                        onSearchChange={setPendingSearch}
                        emptyMessage={
                            pendingCouriers.length === 0
                                ? "No pending shipments."
                                : "No pending shipments match this filter."
                        }
                        pagePermission={pagePermission}
                        highlightedSaleIds={highlightedSaleIds}
                        onView={setViewingCourier}
                        onStatus={setStatusCourier}
                        onEdit={openEditModal}
                        onDelete={setDeletingCourier}
                        onWhatsApp={handleWhatsAppShare}
                    />
                    <CourierTable
                        title="Completed"
                        badgeClassName="bg-green-50 text-green-700"
                        couriers={filteredCompletedCouriers}
                        totalCount={completedCouriers.length}
                        searchTerm={completedSearch}
                        onSearchChange={setCompletedSearch}
                        emptyMessage={
                            completedCouriers.length === 0
                                ? "No completed couriers."
                                : "No completed couriers match this filter."
                        }
                        pagePermission={pagePermission}
                        highlightedSaleIds={highlightedSaleIds}
                        onView={setViewingCourier}
                        onStatus={setStatusCourier}
                        onEdit={openEditModal}
                        onDelete={setDeletingCourier}
                        onWhatsApp={handleWhatsAppShare}
                    />
                </div>
            ) : (
                <div className="mt-6">
                    <CourierTable
                        title="Incoming"
                        badgeClassName="bg-blue-50 text-blue-700"
                        couriers={filteredIncomingCouriers}
                        totalCount={couriersList.length}
                        searchTerm={pendingSearch}
                        onSearchChange={setPendingSearch}
                        emptyMessage={
                            couriersList.length === 0
                                ? "No incoming courier records."
                                : "Nothing matches this filter."
                        }
                        pagePermission={pagePermission}
                        highlightedSaleIds={highlightedSaleIds}
                        onView={setViewingCourier}
                        onStatus={setStatusCourier}
                        onEdit={openEditModal}
                        onDelete={setDeletingCourier}
                        onWhatsApp={handleWhatsAppShare}
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
