import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { AlertTriangle, Edit2, Eye, Plus, RotateCcw, Search as SearchIcon, ShoppingBag, Trash2, UserSquare2 } from "lucide-react";
import type { RootState } from "@/store/store";
import leadService, { type LeadData, type LeadFilters } from "@/services/lead.service";
import platformService from "@/services/platform.service";
import userService from "@/services/user.service";
import { leadFilterSchema, LEAD_STATUSES, type LeadFilterValues } from "@/validation/lead.validation";
import { useDebounce } from "@/hook/useDebounce";
import { initSocket } from "@/services/socket.service";
import { getTodayISODate, formatDisplayDate } from "@/shared/utils/date";
import LeadStatusBadge from "./components/LeadStatusBadge";
import LeadViewModal from "./components/LeadViewModal";
import LeadFormModal from "./components/LeadFormModal";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  ...LEAD_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ") })),
];

const APPROVAL_OPTIONS = [
  { value: "", label: "All Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

// Nearest upcoming/overdue PENDING follow-up among the 3 fixed slots — falls back to the
// earliest PENDING one if none are upcoming, then to Follow-up 1 if all 3 are DONE.
const getNextFollowUp = (lead: LeadData): { date: string; overdue: boolean } | null => {
  const today = getTodayISODate();
  const slots = [
    { date: lead.followUp1Date, status: lead.followUp1Status },
    { date: lead.followUp2Date, status: lead.followUp2Status },
    { date: lead.followUp3Date, status: lead.followUp3Status },
  ].filter((s) => s.date) as { date: string; status?: string }[];

  const pending = slots.filter((s) => s.status !== "DONE").sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = pending.find((s) => s.date >= today);
  const chosen = upcoming || pending[0] || slots[0];
  if (!chosen) return null;
  return { date: chosen.date, overdue: chosen.status !== "DONE" && chosen.date < today };
};

const FilterSync = ({ setAppliedFilters }: { setAppliedFilters: React.Dispatch<React.SetStateAction<LeadFilters>> }) => {
  const { values } = useFormikContext<LeadFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      status: (values.status || undefined) as LeadFilters["status"],
      approvalStatus: (values.approvalStatus || undefined) as LeadFilters["approvalStatus"],
      platformId: values.platformId || undefined,
      salesEmployeeId: values.salesEmployeeId || undefined,
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.status, values.approvalStatus, values.platformId, values.salesEmployeeId]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      followUpStartDate: values.followUpStartDate || undefined,
      followUpEndDate: values.followUpEndDate || undefined,
      startDate: values.startDate || undefined,
      endDate: values.endDate || undefined,
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.followUpStartDate, values.followUpEndDate, values.startDate, values.endDate]);

  return null;
};

const Leads = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { permissions, role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  useEffect(() => {
    const socket = initSocket("leads", userId);
    if (isAdmin) initSocket("admin", userId);
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    };
    const events = ["lead_created", "lead_approved", "lead_rejected"];
    events.forEach((event) => socket.on(event, refresh));
    return () => {
      events.forEach((event) => socket.off(event, refresh));
    };
  }, [queryClient, userId, isAdmin]);

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, viewAllRecords: false };
    if (!permissions) return fallback;
    return permissions.find((p) => p.routePath.toLowerCase() === "/leads" || p.routeName.toLowerCase() === "leads") ?? fallback;
  }, [permissions]);

  const canViewAll = isAdmin || pagePermission.viewAllRecords;

  const [appliedFilters, setAppliedFilters] = useState<LeadFilters>({});
  const filterFormRef = useRef<FormikProps<LeadFilterValues>>(null);

  const [viewLeadId, setViewLeadId] = useState<number | null>(null);
  const [editLead, setEditLead] = useState<LeadData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteLead, setDeleteLead] = useState<LeadData | null>(null);

  const { data: platformsResp } = useQuery({
    queryKey: ["platforms", "active"],
    queryFn: () => platformService.getPlatforms({ status: "active" }),
  });
  const platformOptions = [{ value: "", label: "All Platforms" }, ...(platformsResp?.data?.data || []).map((p) => ({ value: p.id, label: p.name }))];

  const { data: salesEmployeesResp } = useQuery({
    queryKey: ["users", "sales-employee"],
    queryFn: () => userService.getUsers({ role: "Sales Employee", limit: 100 }),
    enabled: canViewAll,
  });
  const salesEmployeeOptions = [
    { value: "", label: "All Sales Employees" },
    ...(salesEmployeesResp?.data?.data || []).map((u) => ({ value: u.id, label: u.name })),
  ];

  const queryFilters = useMemo<LeadFilters>(() => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: PAGE_SIZE }), [appliedFilters]);

  const {
    data: leadResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["leads", queryFilters],
    queryFn: ({ signal }) => leadService.getLeads(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const leadList = leadResponse?.data?.data || [];
  const meta = leadResponse?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => leadService.deleteLead(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Lead deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
      setDeleteLead(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete lead");
    },
  });

  const hasActiveFilters = Boolean(
    appliedFilters.search ||
      appliedFilters.status ||
      appliedFilters.approvalStatus ||
      appliedFilters.platformId ||
      appliedFilters.salesEmployeeId ||
      appliedFilters.followUpStartDate ||
      appliedFilters.followUpEndDate ||
      appliedFilters.startDate ||
      appliedFilters.endDate
  );

  const handleReset = () => {
    filterFormRef.current?.resetForm();
    setAppliedFilters({});
  };

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">You do not have permission to view leads.</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          innerRef={filterFormRef}
          initialValues={
            {
              search: "",
              status: "",
              approvalStatus: "",
              platformId: "",
              productId: "",
              salesEmployeeId: "",
              followUpStartDate: "",
              followUpEndDate: "",
              startDate: "",
              endDate: "",
            } as LeadFilterValues
          }
          validate={(values) => {
            const result = leadFilterSchema.safeParse(values);
            return result.success ? {} : { search: result.error.issues[0]?.message };
          }}
          onSubmit={() => {}}
        >
          <Form className="flex flex-col gap-3">
            <FilterSync setAppliedFilters={setAppliedFilters} />

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative flex-1 min-w-64 max-w-xs">
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Field
                    name="search"
                    type="text"
                    placeholder="Search name, company, phone, lead #..."
                    className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                  />
                </div>

                <Field
                  as="select"
                  name="status"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Field>

                {isAdmin && (
                  <Field
                    as="select"
                    name="approvalStatus"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    {APPROVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Field>
                )}

                <Field
                  as="select"
                  name="platformId"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
                >
                  {platformOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Field>

                {canViewAll && (
                  <Field
                    as="select"
                    name="salesEmployeeId"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    {salesEmployeeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Field>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  title="Clear filters"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${
                    hasActiveFilters
                      ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Clear
                </button>
              </div>

              {pagePermission.canCreate && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" /> Add Lead
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span className="font-semibold uppercase tracking-wide text-slate-400">Follow-up:</span>
              <Field name="followUpStartDate" type="date" className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700" />
              <span>to</span>
              <Field name="followUpEndDate" type="date" className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700" />
              <span className="ml-2 font-semibold uppercase tracking-wide text-slate-400">Created:</span>
              <Field name="startDate" type="date" className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700" />
              <span>to</span>
              <Field name="endDate" type="date" className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700" />
            </div>
          </Form>
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
            <p className="text-sm font-semibold">
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load leads"}
            </p>
          </div>
        ) : leadList.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <UserSquare2 className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">No leads found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Lead ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">Platform</th>
                  <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                  <th className="px-4 py-3 whitespace-nowrap">Company</th>
                  <th className="px-4 py-3 whitespace-nowrap">Phone</th>
                  <th className="px-4 py-3 whitespace-nowrap">City</th>
                  <th className="px-4 py-3 whitespace-nowrap">Product</th>
                  <th className="px-4 py-3 whitespace-nowrap">Qty</th>
                  {canViewAll && <th className="px-4 py-3 whitespace-nowrap">Sales Employee</th>}
                  <th className="px-4 py-3 whitespace-nowrap">Next Follow-up</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Created</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leadList.map((lead) => {
                  const nextFollowUp = getNextFollowUp(lead);
                  const isOwner = lead.createdBy === userId;
                  const canEditRow = pagePermission.canUpdate && (canViewAll || isOwner);
                  return (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">#{lead.id}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-800">{lead.platform?.name || "—"}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{lead.customerName}</td>
                      <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{lead.companyName || "—"}</td>
                      <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{lead.phone}</td>
                      <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{lead.city || "—"}</td>
                      <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{lead.product?.name || "Other"}</td>
                      <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{lead.quantity}</td>
                      {canViewAll && <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{lead.salesEmployee?.name || "—"}</td>}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {nextFollowUp ? (
                          <span className={nextFollowUp.overdue ? "font-semibold text-rose-600" : "text-gray-800"}>{formatDisplayDate(nextFollowUp.date)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <LeadStatusBadge status={lead.status} />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{lead.createdAt?.slice(0, 10)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => lead.id && setViewLeadId(lead.id)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {lead.status === "COMPLETED" && lead.sale?.id && (
                            <button
                              type="button"
                              onClick={() => navigate(`/sells?openSaleId=${lead.sale!.id}`)}
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                              title="Open Sell"
                            >
                              <ShoppingBag className="h-4 w-4" />
                            </button>
                          )}
                          {canEditRow && (
                            <button
                              type="button"
                              onClick={() => setEditLead(lead)}
                              className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                          {isAdmin && pagePermission.canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeleteLead(lead)}
                              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
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

        {!isLoading && !isError && leadList.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
            <span>
              Page {meta.page} of {meta.totalPages} · {meta.total} total entries
              {isFetching && <span className="ml-2 text-gray-400">(refreshing…)</span>}
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

      {viewLeadId !== null && <LeadViewModal leadId={viewLeadId} onClose={() => setViewLeadId(null)} />}
      {(showAddModal || editLead) && (
        <LeadFormModal
          lead={editLead}
          onClose={() => {
            setShowAddModal(false);
            setEditLead(null);
          }}
        />
      )}

      {deleteLead && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteLead(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Delete Lead</h3>
            <p className="text-xs text-slate-500 mb-4">Are you sure you want to delete this lead? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteLead(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteLead.id && deleteMutation.mutate(deleteLead.id)}
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

export default Leads;
