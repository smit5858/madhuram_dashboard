import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { type RootState } from "../../store/store";
import courierService, { type CourierData } from "../../services/courier.service";
import saleService, { type SaleData, type SaleItemData } from "../../services/sells.service";
import { normalizePhoneForWhatsApp, openCourierWhatsApp } from "../../shared/utils/whatsapp";

type PagePermission = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };

// Renders one courier table with its own search filter — used to show
// Pending and Completed outgoing couriers as two independently filterable lists.
const CourierTable = ({
    title,
    badgeClassName,
    couriers,
    totalCount,
    searchTerm,
    onSearchChange,
    emptyMessage,
    pagePermission,
    onEdit,
    onDelete,
    onWhatsApp,
    onViewSale,
}: {
    title: string;
    badgeClassName: string;
    couriers: CourierData[];
    totalCount: number;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    emptyMessage: string;
    pagePermission: PagePermission;
    onEdit: (courier: CourierData) => void;
    onDelete: (id: number) => void;
    onWhatsApp: (courier: CourierData) => void;
    onViewSale: (saleId: number) => void;
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
                            <th className="px-4 py-3 whitespace-nowrap">Pending</th>
                            <th className="px-4 py-3 whitespace-nowrap">Note</th>
                            <th className="px-4 py-3 whitespace-nowrap">Completed Date</th>
                            <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {couriers.map((courier, index) => (
                            <tr key={courier.id} className="hover:bg-slate-50/60 transition-colors">
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
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${courier.pending ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-green-50 text-green-700 border border-green-100"}`}>
                                        {courier.pending ? "Pending" : "Done"}
                                    </span>
                                </td>
                                <td className="px-4 py-3 max-w-[120px] truncate text-xs" title={courier.note || ""}>
                                    {courier.note || <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs">
                                    {courier.completedDate || <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-2">
                                        {!!courier.saleId && (
                                            <button
                                                onClick={() => onViewSale(courier.saleId!)}
                                                className="rounded p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                                title="View Line Items, Fulfillment & Courier History"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                            </button>
                                        )}
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
                                                onClick={() => courier.id && onDelete(courier.id)}
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
                        ))}
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

    // Fetch couriers — backend applies city scope + direction filter automatically
    const { data: response, isLoading: listLoading, error: listError } = useQuery({
        queryKey: ["couriers", direction],
        queryFn: () => courierService.getCouriers({ direction }),
        enabled: pagePermission.canRead,
    });

    // Sale fulfillment detail panel — only opened by explicit user action: either
    // the "Manage Fulfillment" button in the Pending Fulfillment list below, or a
    // courier row's "View Sale" action. Never opens automatically.
    const [saleDetailId, setSaleDetailId] = useState<number | null>(null);
    const [shipQuantities, setShipQuantities] = useState<Record<number, string>>({});
    const [shipTrackIds, setShipTrackIds] = useState<Record<number, string>>({});
    const [shipCourierNames, setShipCourierNames] = useState<Record<number, string>>({});

    const { data: saleDetailResponse, isFetching: isSaleDetailLoading } = useQuery({
        queryKey: ["sale-detail-fulfillment", saleDetailId],
        queryFn: () => saleService.getSaleById(saleDetailId!),
        enabled: !!saleDetailId,
    });
    const saleDetail: SaleData | null = saleDetailResponse?.data?.data || null;

    const closeSaleDetail = () => {
        setSaleDetailId(null);
        setShipQuantities({});
        setShipTrackIds({});
        setShipCourierNames({});
    };

    // Permission check for Sales — the Pending Fulfillment list pulls sale
    // entries from the /sells module, so its edit/delete actions need that
    // module's own grants, not the couriers page's.
    const sellsPermission: PagePermission = useMemo(() => {
        if (!permissions) return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
        const p = permissions.find(
            (p) => p.routePath.toLowerCase() === "/sells" || p.routeName.toLowerCase() === "sells"
        );
        return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }, [permissions]);
    const canReadSells = sellsPermission.canRead;

    // Sales awaiting fulfillment — newly created sales land here instead of
    // popping a modal; the user picks the entry and fulfills it explicitly.
    const { data: pendingSalesResponse, isLoading: pendingSalesLoading } = useQuery({
        queryKey: ["pending-fulfillment-sales"],
        queryFn: () => saleService.getSales({}),
        enabled: pagePermission.canRead && canReadSells && direction === "OUT",
    });
    const pendingFulfillmentSales: SaleData[] = (pendingSalesResponse?.data?.data || []).filter(
        (s) => s.fulfillmentStatus && !["FULFILLED", "CANCELLED"].includes(s.fulfillmentStatus)
    );

    const fulfillItemMutation = useMutation({
        mutationFn: ({
            saleId,
            itemId,
            quantity,
            courierName,
            trackId,
        }: {
            saleId: number;
            itemId: number;
            quantity: number;
            courierName?: string;
            trackId?: string;
        }) => saleService.fulfillOrderItem(saleId, itemId, { quantity, courierName, trackId }),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Item shipped successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            queryClient.invalidateQueries({ queryKey: ["sells"] });
            queryClient.invalidateQueries({ queryKey: ["sale-detail-fulfillment", saleDetailId] });

            const courier = res.data?.data?.courier;
            if (courier) {
                const sent = openCourierWhatsApp(courier.mobileNo || saleDetail?.customerNumber, {
                    customerName: courier.customerName || saleDetail?.customerName,
                    productName: courier.productName,
                    quantity: courier.quantity,
                    courierName: courier.courierName,
                    trackId: courier.trackId,
                });
                if (!sent) {
                    toast.error("Shipped, but no usable phone number to send a WhatsApp update");
                }
            }
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to ship item");
        },
    });

    // Edit/Delete for a pending-fulfillment sale entry — lets a courier-desk
    // user fix shipping details or cancel a sale without leaving this page.
    const [isEditSaleModalOpen, setIsEditSaleModalOpen] = useState(false);
    const [editingSale, setEditingSale] = useState<SaleData | null>(null);
    const [editSaleCustomerName, setEditSaleCustomerName] = useState("");
    const [editSaleCustomerNumber, setEditSaleCustomerNumber] = useState("");
    const [editSaleCity, setEditSaleCity] = useState("");
    const [editSaleAddress, setEditSaleAddress] = useState("");
    const [editSalePincode, setEditSalePincode] = useState("");
    const [editSaleNotes, setEditSaleNotes] = useState("");

    const openEditSaleModal = (sale: SaleData) => {
        setEditingSale(sale);
        setEditSaleCustomerName(sale.customerName || "");
        setEditSaleCustomerNumber(sale.customerNumber || "");
        setEditSaleCity(sale.city || "");
        setEditSaleAddress(sale.fromAddress || "");
        setEditSalePincode(sale.pincode || "");
        setEditSaleNotes(sale.notes || "");
        setIsEditSaleModalOpen(true);
    };

    const closeEditSaleModal = () => {
        setIsEditSaleModalOpen(false);
        setEditingSale(null);
    };

    const updateSaleMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<SaleData> }) => saleService.updateSale(id, data),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Sale updated successfully");
            queryClient.invalidateQueries({ queryKey: ["pending-fulfillment-sales"] });
            queryClient.invalidateQueries({ queryKey: ["sells"] });
            closeEditSaleModal();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to update sale");
        },
    });

    const deleteSaleMutation = useMutation({
        mutationFn: (id: number) => saleService.deleteSale(id),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Sale cancelled successfully");
            queryClient.invalidateQueries({ queryKey: ["pending-fulfillment-sales"] });
            queryClient.invalidateQueries({ queryKey: ["sells"] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to cancel sale");
        },
    });

    const handleEditSaleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editSaleCustomerName.trim()) {
            toast.error("Customer name is required");
            return;
        }
        if (!editingSale?.id) return;
        updateSaleMutation.mutate({
            id: editingSale.id,
            data: {
                customerName: editSaleCustomerName.trim(),
                customerNumber: editSaleCustomerNumber || undefined,
                city: editSaleCity || undefined,
                fromAddress: editSaleAddress || undefined,
                pincode: editSalePincode || undefined,
                notes: editSaleNotes || undefined,
            },
        });
    };

    const handleDeleteSale = (id: number) => {
        if (window.confirm("Are you sure you want to cancel this sale? This action will mark it as CANCELLED.")) {
            deleteSaleMutation.mutate(id);
        }
    };

    // Helper: Fulfillment / Stock indicator badge for a sale line item
    const renderItemStockIndicator = (item: SaleItemData) => {
        const status = item.fulfillmentStatus;
        const backordered = item.backorderedQuantity || 0;

        if (status === "CANCELLED") {
            return (
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    <XCircle className="h-3 w-3" /> Cancelled
                </span>
            );
        }
        if (status === "FULFILLED") {
            return (
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Fulfilled
                </span>
            );
        }
        if (status === "PARTIALLY_FULFILLED") {
            return (
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                    <AlertTriangle className="h-3 w-3" /> Shipped {item.fulfilledQuantity || 0}/{item.quantity}
                </span>
            );
        }
        if (backordered > 0) {
            return (
                <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                    <AlertTriangle className="h-3 w-3 text-red-600" /> Backordered: {backordered}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                <CheckCircle2 className="h-2.5 w-2.5" /> In Stock
            </span>
        );
    };

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCourier, setSelectedCourier] = useState<CourierData | null>(null);

    // Form fields
    const [customerName, setCustomerName] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [mobileNo, setMobileNo] = useState("");
    const [productName, setProductName] = useState("");
    const [charge, setCharge] = useState("");
    const [freePickup, setFreePickup] = useState(false);
    const [courierName, setCourierName] = useState("");
    const [trackId, setTrackId] = useState("");
    const [kg, setKg] = useState("");
    const [quantity, setQuantity] = useState("");
    const [pending, setPending] = useState(true);
    const [note, setNote] = useState("");
    const [completedDate, setCompletedDate] = useState("");
    const [assignedUserId, setAssignedUserId] = useState("");
    const [formDirection, setFormDirection] = useState<"IN" | "OUT">("OUT");

    // Mutation: Create
    const createMutation = useMutation({
        mutationFn: (data: Partial<CourierData>) => courierService.createCourier(data),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier created successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            closeModal();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to create courier");
        },
    });

    // Mutation: Update
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<CourierData> }) =>
            courierService.updateCourier(id, data),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier updated successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            closeModal();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to update courier");
        },
    });

    // Mutation: Delete
    const deleteMutation = useMutation({
        mutationFn: (id: number) => courierService.deleteCourier(id),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier deleted successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to delete courier");
        },
    });

    const resetForm = () => {
        setCustomerName("");
        setAddress("");
        setCity("");
        setMobileNo("");
        setProductName("");
        setCharge("");
        setFreePickup(false);
        setCourierName("");
        setTrackId("");
        setKg("");
        setQuantity("");
        setPending(true);
        setNote("");
        setCompletedDate("");
        setAssignedUserId("");
        setFormDirection("OUT");
    };

    const openCreateModal = () => {
        setSelectedCourier(null);
        resetForm();
        setFormDirection(direction);
        setIsModalOpen(true);
    };

    const openEditModal = (courier: CourierData) => {
        setSelectedCourier(courier);
        setCustomerName(courier.customerName || courier.name || "");
        setAddress(courier.address || "");
        setCity(courier.city || "");
        setMobileNo(courier.mobileNo || courier.phone || "");
        setProductName(courier.productName || "");
        setCharge(courier.charge !== undefined && courier.charge !== null ? String(courier.charge) : "");
        setFreePickup(courier.freePickup ?? false);
        setCourierName(courier.courierName || "");
        setTrackId(courier.trackId || "");
        setKg(courier.kg !== undefined && courier.kg !== null ? String(courier.kg) : "");
        setQuantity(courier.quantity !== undefined && courier.quantity !== null ? String(courier.quantity) : "");
        setPending(courier.pending ?? true);
        setNote(courier.note || "");
        setCompletedDate(courier.completedDate || "");
        setAssignedUserId(courier.userId ? courier.userId.toString() : "");
        setFormDirection(courier.direction || "OUT");
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedCourier(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!customerName.trim()) {
            toast.error("Customer name is required");
            return;
        }

        const data: Partial<CourierData> = {
            customerName: customerName.trim(),
            name: customerName.trim(), // keep legacy field in sync
            address: address || undefined,
            city: city || undefined,
            mobileNo: mobileNo || undefined,
            phone: mobileNo || undefined,
            productName: productName || undefined,
            charge: charge !== "" ? parseFloat(charge) : undefined,
            freePickup,
            courierName: courierName || undefined,
            trackId: trackId || undefined,
            kg: kg !== "" ? parseFloat(kg) : undefined,
            quantity: quantity !== "" ? parseInt(quantity, 10) : undefined,
            pending,
            note: note || undefined,
            completedDate: completedDate || undefined,
            direction: formDirection,
        };

        if (role === "Admin" && assignedUserId) {
            data.userId = parseInt(assignedUserId);
        }

        if (selectedCourier?.id) {
            updateMutation.mutate({ id: selectedCourier.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = (id: number) => {
        if (window.confirm("Are you sure you want to delete this courier record?")) {
            deleteMutation.mutate(id);
        }
    };

    const handleWhatsAppShare = (courier: CourierData) => {
        const sent = openCourierWhatsApp(courier.mobileNo || courier.phone, {
            customerName: courier.customerName || courier.name,
            productName: courier.productName,
            quantity: courier.quantity,
            courierName: courier.courierName,
            trackId: courier.trackId,
        });
        if (!sent) {
            toast.error("This courier record has no usable phone number");
        }
    };

    const couriersList: CourierData[] = response?.data?.data || [];

    // Outgoing couriers are split into two independently-filterable tables:
    // Pending (not yet delivered) and Completed. Incoming keeps a single table.
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

            {/* Pending Fulfillment — sale entries awaiting shipment. New sales land
                here (no auto-opened modal); pick one to fill Line Items, Fulfillment
                & Courier History. */}
            {direction === "OUT" && canReadSells && (
                <div className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50/40">
                    <h3 className="px-4 pt-4 pb-3 text-sm font-bold text-slate-900">
                        Pending Fulfillment
                        {pendingFulfillmentSales.length > 0 && (
                            <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white align-middle">
                                {pendingFulfillmentSales.length}
                            </span>
                        )}
                    </h3>
                    {pendingSalesLoading ? (
                        <p className="px-4 pb-4 text-xs text-slate-500">Loading sale entries...</p>
                    ) : pendingFulfillmentSales.length === 0 ? (
                        <p className="px-4 pb-4 text-xs text-slate-500">No sale entries are awaiting fulfillment.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm text-slate-600">
                                <thead className="bg-white/60 text-xs font-semibold uppercase tracking-wider text-slate-700 border-y border-blue-100">
                                    <tr>
                                        <th className="px-4 py-2.5 whitespace-nowrap">Invoice #</th>
                                        <th className="px-4 py-2.5 whitespace-nowrap">Customer</th>
                                        <th className="px-4 py-2.5 whitespace-nowrap">City</th>
                                        <th className="px-4 py-2.5 whitespace-nowrap">Items</th>
                                        <th className="px-4 py-2.5 text-right whitespace-nowrap">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-blue-100 bg-white">
                                    {pendingFulfillmentSales.map((sale) => (
                                        <tr key={sale.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs font-bold text-blue-600 whitespace-nowrap">
                                                {sale.invoiceNumber || `SELL-#${sale.id}`}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                                                {sale.customerName}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {sale.city || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">{sale.items?.length || 0}</td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => sale.id && setSaleDetailId(sale.id)}
                                                        className="rounded p-1.5 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                                                        title="Accept — open Line Items, Fulfillment & Courier History"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                    </button>
                                                    {sellsPermission.canUpdate && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditSaleModal(sale)}
                                                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                                                            title="Edit"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    {sellsPermission.canDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => sale.id && handleDeleteSale(sale.id)}
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
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Edit Sale Modal — quick edit for shipping/contact details on a
                pending-fulfillment sale, without leaving the couriers page. */}
            {isEditSaleModalOpen && editingSale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-lg font-bold text-slate-900">
                                Edit Sale — {editingSale.invoiceNumber || `SELL-#${editingSale.id}`}
                            </h3>
                            <button onClick={closeEditSaleModal} className="text-slate-400 hover:text-slate-600">
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleEditSaleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Customer Name *</label>
                                <input type="text" value={editSaleCustomerName} onChange={(e) => setEditSaleCustomerName(e.target.value)} required
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Mobile No.</label>
                                <input type="text" value={editSaleCustomerNumber} onChange={(e) => setEditSaleCustomerNumber(e.target.value)}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">City</label>
                                <input type="text" value={editSaleCity} onChange={(e) => setEditSaleCity(e.target.value)}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Address</label>
                                <textarea value={editSaleAddress} onChange={(e) => setEditSaleAddress(e.target.value)} rows={2}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none resize-none" />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Pincode</label>
                                <input type="text" value={editSalePincode} onChange={(e) => setEditSalePincode(e.target.value)}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Notes</label>
                                <textarea value={editSaleNotes} onChange={(e) => setEditSaleNotes(e.target.value)} rows={2}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none resize-none" />
                            </div>

                            <div className="sm:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <button type="button" onClick={closeEditSaleModal}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                    Cancel
                                </button>
                                <button type="submit"
                                    disabled={updateSaleMutation.isPending}
                                    className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]">
                                    {updateSaleMutation.isPending ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
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
                                ? "No pending outgoing couriers."
                                : "No pending couriers match this filter."
                        }
                        pagePermission={pagePermission}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onWhatsApp={handleWhatsAppShare}
                        onViewSale={setSaleDetailId}
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
                                ? "No completed outgoing couriers."
                                : "No completed couriers match this filter."
                        }
                        pagePermission={pagePermission}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        onWhatsApp={handleWhatsAppShare}
                        onViewSale={setSaleDetailId}
                    />
                </div>
            ) : (
                <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                                    <th className="px-4 py-3 whitespace-nowrap">Pending</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Note</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Completed Date</th>
                                    <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {couriersList.map((courier, index) => (
                                    <tr key={courier.id} className="hover:bg-slate-50/60 transition-colors">
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
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${courier.pending ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-green-50 text-green-700 border border-green-100"}`}>
                                                {courier.pending ? "Pending" : "Done"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 max-w-[120px] truncate text-xs" title={courier.note || ""}>
                                            {courier.note || <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                                            {courier.completedDate || <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                {!!courier.saleId && (
                                                    <button
                                                        onClick={() => setSaleDetailId(courier.saleId!)}
                                                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                                        title="View Line Items, Fulfillment & Courier History"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                {normalizePhoneForWhatsApp(courier.mobileNo || courier.phone || "") && (
                                                    <button
                                                        onClick={() => handleWhatsAppShare(courier)}
                                                        className="rounded p-1.5 text-green-600 hover:bg-green-50 hover:text-green-700"
                                                        title="Send WhatsApp message"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                                            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 004.74 1.21h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0012.04 2zm0 18.14h-.003a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.26-4.37c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.83c0 4.55-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.18-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.48-1.39-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.54.12.17 1.74 2.65 4.21 3.72.59.25 1.05.4 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                {pagePermission.canUpdate && (
                                                    <button
                                                        onClick={() => openEditModal(courier)}
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
                                                        onClick={() => courier.id && handleDelete(courier.id)}
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create / Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-lg font-bold text-slate-900">
                                {selectedCourier ? "Edit Courier Record" : "New Courier Record"}
                            </h3>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">

                            {/* Customer Name */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Customer Name *</label>
                                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer Name" required
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Direction — locked to Outgoing for records auto-created from a sale */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Direction *</label>
                                <select
                                    value={formDirection}
                                    onChange={(e) => setFormDirection(e.target.value as "IN" | "OUT")}
                                    disabled={!!selectedCourier?.saleId}
                                    className={`mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3d6fe0] focus:outline-none ${selectedCourier?.saleId ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-50 text-slate-900 focus:bg-white"}`}
                                >
                                    <option value="OUT">Outgoing — we ship to the customer</option>
                                    <option value="IN">Incoming — customer/vendor ships to us</option>
                                </select>
                                {!!selectedCourier?.saleId && (
                                    <p className="mt-0.5 text-[10px] text-slate-400">This record was auto-created from a sale fulfillment and is always Outgoing.</p>
                                )}
                            </div>

                            {/* Address */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Address</label>
                                <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address" rows={2}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none resize-none" />
                            </div>

                            {/* City — Admin can change; non-admin sees their locked city */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">City</label>
                                <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                                    placeholder="e.g. Rajkot"
                                    readOnly={role !== "Admin"}
                                    className={`mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3d6fe0] focus:outline-none ${role !== "Admin" ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-50 text-slate-900 focus:bg-white"}`} />
                                {role !== "Admin" && (
                                    <p className="mt-0.5 text-[10px] text-slate-400">City is locked to your allowed scope.</p>
                                )}
                            </div>

                            {/* Mobile No */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Mobile No.</label>
                                <input type="text" value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} placeholder="+91 99999 99999"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Product Name */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Product Name</label>
                                <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Engine Oil"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Charge */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Charge (₹)</label>
                                <input type="number" min="0" step="0.01" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="0.00"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Courier Name */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Courier Name</label>
                                <input type="text" value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="e.g. Blue Dart"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Track ID */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Track ID</label>
                                <input type="text" value={trackId} onChange={(e) => setTrackId(e.target.value)} placeholder="Tracking number"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* KG */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Weight (KG)</label>
                                <input type="number" min="0" step="0.001" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0.000"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Quantity */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Quantity</label>
                                <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Units shipped"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Completed Date */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Completed Date</label>
                                <input type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                            </div>

                            {/* Free Pickup toggle */}
                            <div className="flex items-center gap-3 pt-2">
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Free Pickup</label>
                                <button
                                    type="button"
                                    onClick={() => setFreePickup(!freePickup)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${freePickup ? "bg-[#3d6fe0]" : "bg-slate-300"}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${freePickup ? "translate-x-6" : "translate-x-1"}`} />
                                </button>
                                <span className="text-xs text-slate-500">{freePickup ? "Yes" : "No"}</span>
                            </div>

                            {/* Pending toggle */}
                            <div className="flex items-center gap-3 pt-2">
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Pending</label>
                                <button
                                    type="button"
                                    onClick={() => setPending(!pending)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pending ? "bg-amber-500" : "bg-green-500"}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${pending ? "translate-x-1" : "translate-x-6"}`} />
                                </button>
                                <span className="text-xs text-slate-500">{pending ? "Pending" : "Completed"}</span>
                            </div>

                            {/* Note */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Note</label>
                                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any additional notes..." rows={2}
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none resize-none" />
                            </div>

                            {/* Admin-only: Assign Owner */}
                            {role === "Admin" && (
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Assign Owner (User ID)</label>
                                    <input type="number" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} placeholder="Enter user id (e.g. 2)"
                                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none" />
                                    <p className="mt-0.5 text-[10px] text-slate-400">Provide the numeric ID of the user who owns this courier record.</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="sm:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <button type="button" onClick={closeModal}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                    Cancel
                                </button>
                                <button type="submit"
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                    className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]">
                                    {createMutation.isPending || updateMutation.isPending
                                        ? "Saving..."
                                        : selectedCourier ? "Save Changes" : "Create Courier"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Sale Fulfillment Detail Modal — Line Items, Fulfillment & Courier History */}
            {saleDetailId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <span className="text-xs font-mono font-bold text-blue-600 uppercase">
                                    {saleDetail?.invoiceNumber}
                                </span>
                                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                                    Line Items, Fulfillment & Courier History
                                    {saleDetail?.customerName ? ` — ${saleDetail.customerName}` : ""}
                                    {isSaleDetailLoading && (
                                        <Loader2 className="inline-block h-3.5 w-3.5 ml-2 animate-spin text-slate-400" />
                                    )}
                                </h3>
                            </div>
                            <button onClick={closeSaleDetail} className="text-slate-400 hover:text-slate-600">
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="mt-4 space-y-2.5 text-xs text-slate-700">
                            {!saleDetail && !isSaleDetailLoading ? (
                                <p className="p-3 text-slate-400">Sale not found.</p>
                            ) : (
                                saleDetail?.items?.map((item, idx) => {
                                    const ordered = item.quantity;
                                    const delivered = item.fulfilledQuantity || 0;
                                    const pendingQty = Math.max(0, ordered - delivered);
                                    const allocated = item.allocatedQuantity || 0;
                                    const shipKey = item.id ?? idx;
                                    const shipValue = shipQuantities[shipKey] ?? String(allocated || "");

                                    return (
                                        <div key={item.id ?? idx} className="rounded-xl border border-slate-200 p-3">
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="font-semibold text-slate-900">
                                                    {item.Product?.name || item.productName || `Product #${item.productId}`}
                                                </div>
                                                {renderItemStockIndicator(item)}
                                            </div>

                                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                                <div>
                                                    <span className="text-slate-400 block uppercase font-bold text-[10px]">Ordered</span>
                                                    <span className="font-bold text-slate-800">{ordered}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 block uppercase font-bold text-[10px]">Delivered</span>
                                                    <span className="font-bold text-emerald-600">{delivered}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 block uppercase font-bold text-[10px]">Pending</span>
                                                    <span className={`font-bold ${pendingQty > 0 ? "text-rose-600" : "text-slate-400"}`}>{pendingQty}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 block uppercase font-bold text-[10px]">Price</span>
                                                    <span className="font-bold text-slate-800">₹{Number(item.sellingPrice).toLocaleString("en-IN")}</span>
                                                </div>
                                            </div>

                                            {pagePermission.canUpdate && allocated > 0 && (
                                                <div className="mt-2.5 flex flex-col gap-2 rounded-lg bg-blue-50/60 border border-blue-100 p-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-semibold text-blue-800">Ship</span>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={allocated}
                                                            value={shipValue}
                                                            onChange={(e) =>
                                                                setShipQuantities((prev) => ({ ...prev, [shipKey]: e.target.value }))
                                                            }
                                                            className="w-16 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                                                        />
                                                        <span className="text-[11px] text-slate-500">of {allocated} allocated</span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Courier name (optional)"
                                                            value={shipCourierNames[shipKey] ?? ""}
                                                            onChange={(e) =>
                                                                setShipCourierNames((prev) => ({ ...prev, [shipKey]: e.target.value }))
                                                            }
                                                            className="w-40 rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Tracking number"
                                                            value={shipTrackIds[shipKey] ?? ""}
                                                            onChange={(e) =>
                                                                setShipTrackIds((prev) => ({ ...prev, [shipKey]: e.target.value }))
                                                            }
                                                            className="w-40 rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={fulfillItemMutation.isPending || !item.id}
                                                            onClick={() => {
                                                                const qty = Math.min(allocated, Math.max(1, Number(shipValue) || 0));
                                                                if (!item.id || !saleDetail?.id || qty <= 0) return;
                                                                fulfillItemMutation.mutate({
                                                                    saleId: saleDetail.id,
                                                                    itemId: item.id,
                                                                    quantity: qty,
                                                                    courierName: shipCourierNames[shipKey]?.trim() || undefined,
                                                                    trackId: shipTrackIds[shipKey]?.trim() || undefined,
                                                                });
                                                            }}
                                                            className="ml-auto rounded-md bg-[#3d6fe0] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#3162d2] disabled:opacity-50"
                                                        >
                                                            {fulfillItemMutation.isPending ? "Shipping..." : "Accept & Ship"}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {item.Couriers && item.Couriers.length > 0 && (
                                                <div className="mt-2.5">
                                                    <span className="text-slate-400 block uppercase font-bold text-[10px] mb-1">
                                                        Courier History ({item.Couriers.reduce((s, c) => s + (c.quantity || 0), 0)} of {ordered} shipped)
                                                    </span>
                                                    <ul className="space-y-1">
                                                        {item.Couriers.map((c) => (
                                                            <li key={c.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[11px]">
                                                                <span className="font-semibold text-slate-700">
                                                                    ×{c.quantity ?? "—"} {c.courierName ? `via ${c.courierName}` : ""}
                                                                    {c.trackId ? ` — ${c.trackId}` : ""}
                                                                </span>
                                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.pending ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                                                                    {c.pending ? "Pending" : "Done"}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="mt-5 flex justify-end">
                            <button
                                onClick={closeSaleDetail}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Couriers;
