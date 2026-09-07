import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Field, Form, Formik } from "formik";
import toast from "react-hot-toast";
import { AlertTriangle, Calendar, Edit2, Eye, Hash, Plus, Search, Share2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { z } from "zod";
import type { RootState } from "@/store/store";
import platformService, { type PlatformData } from "@/services/platform.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import { formatDateTime } from "@/shared/utils/date";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const platformSchema = z.object({
  name: z.string().min(1, "Platform name is required").max(100, "Platform name must be under 100 characters"),
});

type PlatformFormValues = z.infer<typeof platformSchema>;

// Combined Create/Edit modal — the Lead form only ever reads platforms with isActive:true
// (GET /platforms?status=active), so deactivating one here removes it from that dropdown without
// breaking historical leads that already reference it.
const PlatformEditModal = ({ platform, onClose }: { platform: PlatformData | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const isEdit = !!platform?.id;
  const [isActive, setIsActive] = useState(platform?.isActive ?? true);

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; isActive: boolean }) =>
      isEdit ? platformService.updatePlatform(platform!.id, data) : platformService.createPlatform(data),
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Platform updated" : "Platform created"));
      queryClient.invalidateQueries({ queryKey: ["platforms"] });
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save platform");
    },
  });

  const initialValues: PlatformFormValues = { name: platform?.name || "" };

  const validate = (values: PlatformFormValues) => {
    const result = platformSchema.safeParse(values);
    if (result.success) return {};
    return result.error.issues.reduce((errors, issue) => {
      const field = issue.path[0] as keyof PlatformFormValues;
      if (!errors[field]) errors[field] = issue.message;
      return errors;
    }, {} as Partial<Record<keyof PlatformFormValues, string>>);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">{isEdit ? "Edit Platform" : "New Platform"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik
          initialValues={initialValues}
          validate={validate}
          onSubmit={(values) => saveMutation.mutate({ name: values.name.trim(), isActive })}
        >
          <Form className="mt-4 flex flex-col gap-4">
            <Field name="name" label="Platform Name" placeholder="e.g. IndiaMART, WhatsApp, Facebook" component={FormikInput} />

            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Status</label>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-[#3d6fe0]" : "bg-slate-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-xs text-slate-500">{isActive ? "Active" : "Inactive"}</span>
            </div>
            <p className="text-[10px] text-slate-400 -mt-2">Inactive platforms are hidden from the Lead form but existing leads keep them.</p>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]">
                {saveMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </Form>
        </Formik>
      </div>
    </div>
  );
};

const PlatformViewModal = ({ platform, onClose }: { platform: PlatformData; onClose: () => void }) => (
  <div
    className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Share2 className="h-5.5 w-5.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 truncate">{platform.name}</h3>
            <span
              className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                platform.isActive ? "bg-green-50 text-green-700 border border-green-100" : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              {platform.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
          <XCircle className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-200">
            <Hash className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Platform ID</div>
            <div className="mt-0.5 text-sm font-medium text-slate-800">#{platform.id}</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-200">
            <Calendar className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Created</div>
            <div className="mt-0.5 text-sm font-medium text-slate-800">{formatDateTime(platform.createdAt) || "—"}</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-200">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last Updated</div>
            <div className="mt-0.5 text-sm font-medium text-slate-800">{formatDateTime(platform.updatedAt) || "—"}</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-slate-100 px-6 py-4">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
          Close
        </button>
      </div>
    </div>
  </div>
);

const DeletePlatformModal = ({
  platform,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  platform: PlatformData;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}) => (
  <div
    className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <h3 className="text-sm font-bold text-slate-900">Delete Platform</h3>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
          <XCircle className="h-5 w-5" />
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Are you sure you want to delete <span className="font-semibold text-slate-700">{platform.name}</span>? If it's used by any
        leads, deactivate it instead.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onConfirm}
          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {isSubmitting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
);

const PlatformManagement = () => {
  const queryClient = useQueryClient();
  const { permissions } = useSelector((state: RootState) => state.auth);

  const pagePermission = useMemo(() => {
    if (!permissions) return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    const p = permissions.find((perm) => perm.routePath.toLowerCase() === "/settings/platforms");
    return {
      canRead: p?.canRead ?? false,
      canCreate: p?.canCreate ?? false,
      canUpdate: p?.canUpdate ?? false,
      canDelete: p?.canDelete ?? false,
    };
  }, [permissions]);

  const [search, setSearch] = useState("");
  const [editPlatform, setEditPlatform] = useState<PlatformData | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletePlatform, setDeletePlatform] = useState<PlatformData | null>(null);
  const [viewPlatform, setViewPlatform] = useState<PlatformData | null>(null);

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => platformService.getPlatforms(),
    enabled: pagePermission.canRead,
  });
  const platforms = response?.data?.data || [];
  const filtered = platforms.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const deleteMutation = useMutation({
    mutationFn: (id: number) => platformService.deletePlatform(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Platform deleted");
      queryClient.invalidateQueries({ queryKey: ["platforms"] });
      setDeletePlatform(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete platform");
    },
  });

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">You do not have permission to view platforms.</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Platform Management</h1>
          <p className="text-xs text-slate-500">Manage the lead sources (IndiaMART, WhatsApp, Facebook, ...) offered on the Lead form.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search platforms..."
              className="w-56 rounded-full border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
            />
          </div>
          {pagePermission.canCreate && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Add Platform
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
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm font-semibold">Failed to load platforms</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <Share2 className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">No platforms found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((platform) => (
                  <tr key={platform.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{platform.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          platform.isActive ? "bg-green-50 text-green-700 border border-green-100" : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {platform.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{formatDateTime(platform.createdAt) || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewPlatform(platform)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {pagePermission.canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditPlatform(platform)}
                            className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {pagePermission.canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletePlatform(platform)}
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
      </div>

      {viewPlatform && <PlatformViewModal platform={viewPlatform} onClose={() => setViewPlatform(null)} />}

      {(showAddModal || editPlatform) && (
        <PlatformEditModal
          platform={editPlatform}
          onClose={() => {
            setShowAddModal(false);
            setEditPlatform(null);
          }}
        />
      )}

      {deletePlatform && (
        <DeletePlatformModal
          platform={deletePlatform}
          onClose={() => setDeletePlatform(null)}
          isSubmitting={deleteMutation.isPending}
          onConfirm={() => deletePlatform.id && deleteMutation.mutate(deletePlatform.id)}
        />
      )}
    </div>
  );
};

export default PlatformManagement;
