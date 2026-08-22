import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { type RootState } from "../../store/store";
import courierService, { type CourierData } from "../../services/courier.service";

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

    // Product Name filter state (applied server-side)
    const [productNameFilter, setProductNameFilter] = useState("");
    const [appliedProductName, setAppliedProductName] = useState("");

    // Fetch couriers — backend applies city scope + productName filter automatically
    const { data: response, isLoading: listLoading, error: listError } = useQuery({
        queryKey: ["couriers", appliedProductName],
        queryFn: () => courierService.getCouriers(
            appliedProductName ? { productName: appliedProductName } : undefined
        ),
        enabled: pagePermission.canRead,
    });

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
    const [pending, setPending] = useState(true);
    const [note, setNote] = useState("");
    const [completedDate, setCompletedDate] = useState("");
    const [assignedUserId, setAssignedUserId] = useState("");

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
        setPending(true);
        setNote("");
        setCompletedDate("");
        setAssignedUserId("");
    };

    const openCreateModal = () => {
        setSelectedCourier(null);
        resetForm();
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
        setPending(courier.pending ?? true);
        setNote(courier.note || "");
        setCompletedDate(courier.completedDate || "");
        setAssignedUserId(courier.userId ? courier.userId.toString() : "");
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
            pending,
            note: note || undefined,
            completedDate: completedDate || undefined,
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

    const handleApplyFilter = () => {
        setAppliedProductName(productNameFilter.trim());
    };

    const handleClearFilter = () => {
        setProductNameFilter("");
        setAppliedProductName("");
    };

    const couriersList: CourierData[] = response?.data?.data || [];

    return (
        <div className="mx-auto px-4 py-8 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                        Courier Directories
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {role === "Admin"
                            ? "View, track, and manage all courier records and account permissions."
                            : "Manage your assigned courier contacts, status updates, and tracking parameters."}
                    </p>
                </div>

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

            {/* Product Name Filter */}
            <div className="mt-6 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Filter by Product Name
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={productNameFilter}
                            onChange={(e) => setProductNameFilter(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
                            placeholder="e.g. Engine Oil"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-[#3d6fe0] focus:outline-none"
                        />
                        <button
                            onClick={handleApplyFilter}
                            className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]"
                        >
                            Apply
                        </button>
                        {appliedProductName && (
                            <button
                                onClick={handleClearFilter}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
                {appliedProductName && (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-200">
                        Filtering: "{appliedProductName}"
                    </span>
                )}
            </div>

            {/* Table */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {listLoading ? (
                    <div className="flex min-h-75 items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
                            <span className="text-sm text-slate-500">Retrieving courier records...</span>
                        </div>
                    </div>
                ) : listError ? (
                    <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
                        <p className="text-sm font-medium text-red-500">Failed to load courier list</p>
                        <p className="text-xs text-slate-400">{(listError as any).message || "An unexpected error occurred"}</p>
                    </div>
                ) : !pagePermission.canRead ? (
                    <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
                        <p className="text-sm font-medium text-slate-500">You do not have permission to view couriers.</p>
                    </div>
                ) : couriersList.length === 0 ? (
                    <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
                        <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-slate-900">No Couriers Found</h3>
                        <p className="mt-1 text-xs text-slate-500">
                            {appliedProductName
                                ? `No couriers match the product filter "${appliedProductName}".`
                                : "Click the button above to add your first courier record."}
                        </p>
                    </div>
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
                )}
            </div>

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
        </div>
    );
};

export default Couriers;
