import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  XCircle,
  Phone,
  FileText,
  UserCheck,
  Building2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { type RootState } from "../../store/store";
import customerService, {
  type CustomerData,
  type CreateCustomerPayload,
  type CustomerFilters,
} from "../../services/customer.service";
import { useDebounce } from "@/hook/useDebounce";

const CITIES = ["Rajkot", "Ahmedabad", "Surat", "Vadodara", "Morbi", "Jamnagar", "Bhavnagar", "Other"];

const Customers = () => {
  const queryClient = useQueryClient();
  const { permissions } = useSelector((state: RootState) => state.auth);

  // Derive permissions for "/customers" from Redux
  const pagePermission = useMemo(() => {
    if (!permissions) {
      return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }
    const p = permissions.find(
      (perm) =>
        perm.routePath.toLowerCase() === "/customers" ||
        perm.routeName.toLowerCase() === "customers"
    );
    return (
      p ?? {
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      }
    );
  }, [permissions]);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [selectedCity, setSelectedCity] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Active filters query object
  const activeFilters = useMemo<CustomerFilters>(() => {
    const f: CustomerFilters = { page, limit: pageSize };
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    if (selectedCity) f.city = selectedCity;
    return f;
  }, [debouncedSearch, selectedCity, page]);

  // Query: Fetch Customers List
  const {
    data: customerResponse,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["customers", activeFilters],
    queryFn: ({ signal }) => customerService.getCustomers(activeFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const customerList: CustomerData[] = customerResponse?.data?.data || [];
  const paginationMeta = customerResponse?.data?.meta || {
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  };

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);

  // Form input state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formPincode, setFormPincode] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Mutation: Create Customer
  const createCustomerMutation = useMutation({
    mutationFn: (payload: CreateCustomerPayload) => customerService.createCustomer(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Customer created successfully");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      closeFormModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to create customer");
    },
  });

  // Mutation: Update Customer
  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCustomerPayload> }) =>
      customerService.updateCustomer(id, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Customer updated successfully");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      closeFormModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to update customer");
    },
  });

  // Mutation: Delete Customer
  const deleteCustomerMutation = useMutation({
    mutationFn: (id: number) => customerService.deleteCustomer(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Customer deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete customer");
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormAddress("");
    setFormCity("");
    setFormPincode("");
    setFormNotes("");
    setSelectedCustomer(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsFormModalOpen(true);
  };

  const openEditModal = (customer: CustomerData) => {
    setSelectedCustomer(customer);
    setFormName(customer.name || "");
    setFormPhone(customer.phone || "");
    setFormEmail(customer.email || "");
    setFormAddress(customer.address || "");
    setFormCity(customer.city || "");
    setFormPincode(customer.pincode || "");
    setFormNotes(customer.notes || "");
    setIsFormModalOpen(true);
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    resetForm();
  };

  const openDetailModal = (customer: CustomerData) => {
    setSelectedCustomer(customer);
    setIsDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedCustomer(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!formPhone.trim()) {
      toast.error("Customer phone number is required");
      return;
    }

    const payload: CreateCustomerPayload = {
      name: formName.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim() || undefined,
      address: formAddress.trim() || undefined,
      city: formCity.trim() || undefined,
      pincode: formPincode.trim() || undefined,
      notes: formNotes.trim() || undefined,
    };

    if (selectedCustomer?.id) {
      updateCustomerMutation.mutate({ id: selectedCustomer.id, data: payload });
    } else {
      createCustomerMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to deactivate customer "${name}"?`)) {
      deleteCustomerMutation.mutate(id);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCity("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#3d6fe0]">
              <Users className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customer Management</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized registry for client details, contact directories, and sells associations.
              </p>
            </div>
          </div>
        </div>

        {pagePermission.canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3d6fe0] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#3162d2] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Add Customer</span>
          </button>
        )}
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#3d6fe0]">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Registered</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{paginationMeta.total}</h3>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Cities</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              {new Set(customerList.map((c) => c.city).filter(Boolean)).size || "—"}
            </h3>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current View</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              Page {paginationMeta.page} / {paginationMeta.totalPages}
            </h3>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by customer name, phone, city, pincode..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-[#3d6fe0] focus:bg-white focus:outline-none transition-all"
              />
            </div>

            {/* City Dropdown */}
            <div className="w-full sm:w-48">
              <select
                value={selectedCity}
                onChange={(e) => {
                  setSelectedCity(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-[#3d6fe0] focus:bg-white focus:outline-none transition-all"
              >
                <option value="">All Cities</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {(searchTerm || selectedCity) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Customers Data Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center text-rose-500 gap-2">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm font-semibold">
              {(error as any)?.response?.data?.message || (error as any)?.message || "Failed to load customers"}
            </p>
          </div>
        ) : customerList.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium">No customers found</p>
            <p className="text-xs text-slate-400">
              {searchTerm || selectedCity ? "Try adjusting your search criteria" : "Click 'Add Customer' to create the first record"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Sr.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Customer Name</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Phone Number</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">City</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Address</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Pincode</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Created Date</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {customerList.map((customer, index) => (
                  <tr key={customer.id || index} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-slate-400 font-medium whitespace-nowrap">
                      {(paginationMeta.page - 1) * pageSize + index + 1}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>{customer.name}</span>
                        {customer.email && (
                          <span className="text-[11px] text-slate-400 font-normal truncate max-w-36">
                            ({customer.email})
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-medium text-blue-600 bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {customer.city ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                          {customer.city}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 max-w-xs truncate text-slate-600">
                      {customer.address || <span className="text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-slate-600">
                      {customer.pincode || <span className="text-slate-300">—</span>}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap text-[11px] text-slate-400">
                      {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString("en-IN") : "—"}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetailModal(customer)}
                          title="View Customer Details"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {pagePermission.canUpdate && (
                          <button
                            type="button"
                            onClick={() => openEditModal(customer)}
                            title="Edit Customer"
                            className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}

                        {pagePermission.canDelete && (
                          <button
                            type="button"
                            onClick={() => customer.id && handleDelete(customer.id, customer.name)}
                            title="Deactivate Customer"
                            className="rounded p-1 text-rose-500 hover:bg-rose-50 transition"
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

        {/* Pagination Footer */}
        {!isLoading && !isError && customerList.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              Page {paginationMeta.page} of {paginationMeta.totalPages} · {paginationMeta.total} total customers
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={paginationMeta.page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={paginationMeta.page >= paginationMeta.totalPages}
                onClick={() => setPage((prev) => Math.min(paginationMeta.totalPages, prev + 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT CUSTOMER MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedCustomer ? "Edit Customer Record" : "Add New Customer"}
                </h3>
                <p className="text-xs text-slate-500">
                  Phone number serves as unique lookup identifier for Sells Entry.
                </p>
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Parth Patel"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formPhone}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setFormPhone(value);
                    }}
                    maxLength={10}
                    placeholder="9876543210"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    placeholder="e.g. Rajkot"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pincode
                  </label>
                  <input
                    type="text"
                    value={formPincode}
                    onChange={(e) => setFormPincode(e.target.value)}
                    placeholder="e.g. 360001"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Address
                </label>
                <textarea
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Street / Warehouse / Shop Address"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Additional client details or preferences..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
              </div>

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
                  disabled={createCustomerMutation.isPending || updateCustomerMutation.isPending}
                  className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#3162d2] disabled:opacity-50 transition"
                >
                  {createCustomerMutation.isPending || updateCustomerMutation.isPending
                    ? "Saving..."
                    : selectedCustomer
                      ? "Update Customer"
                      : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOMER DETAILS MODAL */}
      {isDetailModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedCustomer.name}</h3>
                <p className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" />
                  {selectedCustomer.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 border border-slate-100">
                <div>
                  <span className="text-slate-400 font-medium block">Email:</span>
                  <span className="text-slate-800 font-semibold">{selectedCustomer.email || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">City:</span>
                  <span className="text-slate-800 font-semibold">{selectedCustomer.city || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Pincode:</span>
                  <span className="text-slate-800 font-semibold">{selectedCustomer.pincode || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Registered On:</span>
                  <span className="text-slate-800 font-semibold">
                    {selectedCustomer.createdAt
                      ? new Date(selectedCustomer.createdAt).toLocaleDateString("en-IN")
                      : "—"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-medium block mb-1">Address:</span>
                <p className="rounded-lg bg-slate-50 p-3 text-slate-700 border border-slate-100">
                  {selectedCustomer.address || "No address specified."}
                </p>
              </div>

              {selectedCustomer.notes && (
                <div>
                  <span className="text-slate-400 font-medium block mb-1">Notes:</span>
                  <p className="rounded-lg bg-amber-50/60 p-3 text-amber-900 border border-amber-200/50">
                    {selectedCustomer.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeDetailModal}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 transition"
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

export default Customers;
