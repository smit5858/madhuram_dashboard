import { Form, Formik } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle, ShieldCheck } from "lucide-react";
import routeSettingService, { type RouteSettingPermission } from "../../../services/routeSetting.service";
import PermissionGrid from "../../../shared/components/PermissionGrid";
import { routePermissionsFormSchema, type RoutePermissionsFormValues } from "../../../validation/routeSetting.validation";
import type { UserData } from "../../../services/user.service";

interface RoutePermissionsEditModalProps {
  user: UserData;
  onClose: () => void;
}

const RoutePermissionsEditModal = ({ user, onClose }: RoutePermissionsEditModalProps) => {
  const queryClient = useQueryClient();
  const isAdmin = user.Role?.name === "Admin";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["route-setting-permissions", user.id],
    queryFn: () => routeSettingService.getUserPermissions(user.id),
  });

  const permissions: RouteSettingPermission[] = data?.data?.data?.permissions || [];

  const saveMutation = useMutation({
    mutationFn: (values: RoutePermissionsFormValues) =>
      routeSettingService.updateUserPermissions(
        user.id,
        values.permissions.map((p) => ({
          routeId: p.routeId,
          canRead: p.canRead,
          canCreate: p.canCreate,
          canUpdate: p.canUpdate,
          canDelete: p.canDelete,
          viewAllRecords: p.viewAllRecords,
        }))
      ),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Permissions updated successfully");
      queryClient.invalidateQueries({ queryKey: ["route-setting-permissions", user.id] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to update permissions");
    },
  });

  const initialValues: RoutePermissionsFormValues = {
    permissions: permissions.map((p) => ({
      routeId: p.routeId,
      canRead: p.canRead,
      canCreate: p.canCreate,
      canUpdate: p.canUpdate,
      canDelete: p.canDelete,
      viewAllRecords: p.viewAllRecords,
    })),
  };

  const validate = (values: RoutePermissionsFormValues) => {
    const result = routePermissionsFormSchema.safeParse(values);
    return result.success ? {} : { permissions: result.error.issues[0]?.message };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#3d6fe0]" />
              Route Permissions — {user.name}
            </h3>
            <p className="text-xs text-slate-500">{user.email} · Role: {user.Role?.name || "—"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {isAdmin ? (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-700">
            Admin accounts always have full access to every module. Per-user overrides don't apply to Admins.
          </div>
        ) : isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-40 items-center justify-center text-sm font-semibold text-rose-500">
            Failed to load permissions
          </div>
        ) : (
          <Formik
            initialValues={initialValues}
            enableReinitialize
            validate={validate}
            onSubmit={(values) => saveMutation.mutate(values)}
          >
            {() => (
              <Form className="mt-4">
                <PermissionGrid
                  routesMeta={permissions.map((p) => ({
                    routeId: p.routeId,
                    routeName: p.routeName,
                    module: p.module,
                    isOverride: p.isOverride,
                    fifthColumnHint: p.routeName === "Role Management" ? "Assign Role to User" : undefined,
                  }))}
                />

                <div className="mt-5 flex justify-end gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2] disabled:opacity-50"
                  >
                    {saveMutation.isPending ? "Saving..." : "Save Permissions"}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        )}
      </div>
    </div>
  );
};

export default RoutePermissionsEditModal;
