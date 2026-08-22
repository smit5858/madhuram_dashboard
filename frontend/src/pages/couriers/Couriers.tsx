import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { type RootState } from "../../store/store";
import courierService, { type CourierData } from "../../services/courier.service";
import permissionService, { type PagePermissions } from "../../services/permission.service";

const Couriers = () => {
    const queryClient = useQueryClient();
    const { role } = useSelector((state: RootState) => state.auth);

    // Page-level permissions state
    const [permissions, setPermissions] = useState<PagePermissions>({
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false
    });

    // Fetch page permissions on mount
    useEffect(() => {
        permissionService.getPagePermissionsService(undefined, "/couriers")
            .then((res) => {
                setPermissions(res.data);
            })
            .catch((err) => {
                console.error("Failed to load page permissions", err);
                toast.error("Could not verify permissions for this resource.");
            });
    }, []);

    // Load Couriers list
    const { data: response, isLoading: listLoading, error: listError } = useQuery({
        queryKey: ["couriers"],
        queryFn: () => courierService.getCouriers(),
        enabled: permissions.canRead // Only query if permission is verified
    });

    // Modal state for Create / Edit
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCourier, setSelectedCourier] = useState<CourierData | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [assignedUserId, setAssignedUserId] = useState(""); // Only used/visible for Admin

    // Mutation: Create
    const createMutation = useMutation({
        mutationFn: (newCourier: Partial<CourierData>) => courierService.createCourier(newCourier),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier created successfully");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            closeModal();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to create courier");
        }
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
        }
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
        }
    });

    const openCreateModal = () => {
        setSelectedCourier(null);
        setName("");
        setEmail("");
        setPhone("");
        setAssignedUserId("");
        setIsModalOpen(true);
    };

    const openEditModal = (courier: CourierData) => {
        setSelectedCourier(courier);
        setName(courier.name);
        setEmail(courier.email || "");
        setPhone(courier.phone || "");
        setAssignedUserId(courier.userId ? courier.userId.toString() : "");
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedCourier(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Courier name is required");
            return;
        }

        const data: Partial<CourierData> = {
            name,
            email: email || undefined,
            phone: phone || undefined,
        };

        if (role === "Admin" && assignedUserId) {
            data.userId = parseInt(assignedUserId);
        }

        if (selectedCourier && selectedCourier.id) {
            updateMutation.mutate({ id: selectedCourier.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleDelete = (id: number) => {
        if (window.confirm("Are you sure you want to delete this courier?")) {
            deleteMutation.mutate(id);
        }
    };

    const couriersList = response?.data?.data || [];

    return (
        <div className="mx-auto px-4 py-8 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                        Courier Directories
                    </h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {role === "Admin" 
                            ? "View, track, and manage all courier records and account permissions."
                            : "Manage your assigned courier contacts, status updates, and tracking parameters."
                        }
                    </p>
                </div>

                {/* Add button - dynamic display */}
                {permissions.canCreate && (
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

            {/* List Table */}
            <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                ) : couriersList.length === 0 ? (
                    <div className="flex min-h-75 flex-col items-center justify-center p-6 text-center">
                        <div className="rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-850">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">No Couriers Registered</h3>
                        <p className="mt-1 text-xs text-slate-500">Click the button above to add your first courier contact.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm text-slate-500 dark:text-slate-400">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <tr>
                                    <th scope="col" className="px-6 py-4">ID</th>
                                    <th scope="col" className="px-6 py-4">Name</th>
                                    <th scope="col" className="px-6 py-4">Email</th>
                                    <th scope="col" className="px-6 py-4">Phone</th>
                                    <th scope="col" className="px-6 py-4">Assigned To</th>
                                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {couriersList.map((courier) => (
                                    <tr key={courier.id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-850/30">
                                        <td className="px-6 py-4 font-mono text-xs">{courier.id}</td>
                                        <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{courier.name}</td>
                                        <td className="px-6 py-4">{courier.email || <span className="text-slate-400">-</span>}</td>
                                        <td className="px-6 py-4">{courier.phone || <span className="text-slate-400">-</span>}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                                    {courier.User?.name || "Unassigned"}
                                                </span>
                                                {courier.User && (
                                                    <span className="text-[10px] text-slate-400">
                                                        ({courier.User.email})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {/* Edit Button - Dynamic Permission */}
                                                {permissions.canUpdate && (
                                                    <button
                                                        onClick={() => openEditModal(courier)}
                                                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white"
                                                        title="Edit"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4.5 w-4.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                        </svg>
                                                    </button>
                                                )}

                                                {/* Delete Button - Dynamic Permission */}
                                                {permissions.canDelete && (
                                                    <button
                                                        onClick={() => courier.id && handleDelete(courier.id)}
                                                        className="rounded p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
                                                        title="Delete"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4.5 w-4.5">
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

            {/* Modal for Create/Update */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                {selectedCourier ? "Modify Courier" : "New Courier Contact"}
                            </h3>
                            <button
                                onClick={closeModal}
                                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                            {/* Courier Name */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide dark:text-slate-300">
                                    Courier Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter courier name"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                    required
                                />
                            </div>

                            {/* Courier Email */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide dark:text-slate-300">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="courier@example.com"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                />
                            </div>

                            {/* Courier Phone */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide dark:text-slate-300">
                                    Phone Number
                                </label>
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+91 99999 99999"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                />
                            </div>

                            {/* Assign User ID (Only visible/editable for Admin) */}
                            {role === "Admin" && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide dark:text-slate-300">
                                        Assign Owner (User ID)
                                    </label>
                                    <input
                                        type="number"
                                        value={assignedUserId}
                                        onChange={(e) => setAssignedUserId(e.target.value)}
                                        placeholder="Enter user id (e.g. 2)"
                                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                    />
                                    <p className="mt-1 text-[10px] text-slate-400">
                                        Provide the numeric ID of the user who owns this courier record.
                                    </p>
                                </div>
                            )}

                            {/* Submit & Cancel */}
                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                    className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]"
                                >
                                    {createMutation.isPending || updateMutation.isPending
                                        ? "Saving..."
                                        : selectedCourier
                                        ? "Save Changes"
                                        : "Create Courier"}
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
