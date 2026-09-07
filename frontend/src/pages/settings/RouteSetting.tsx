import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Field, Form, Formik, useFormikContext } from "formik";
import {
  ShieldCheck,
  Search as SearchIcon,
  Edit2,
  Mail,
  RotateCcw,
  AlertTriangle,
  Lock,
  Users as UsersIcon,
} from "lucide-react";
import { useDebounce } from "@/hook/useDebounce";
import { type RootState } from "../../store/store";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import userService, { type UserData, type UserFilters } from "../../services/user.service";
import {
  routeSettingFilterSchema,
  type RouteSettingFilterValues,
} from "@/validation/routeSetting.validation";
import RoutePermissionsEditModal from "./components/RoutePermissionsEditModal";

const PAGE_SIZE_OPTIONS = [10, 25, 50];

/** Applies filter form values to the fetched list — search is debounced, selects apply immediately. */
const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<UserFilters>>;
}) => {
  const { values } = useFormikContext<RouteSettingFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      role: values.role || undefined,
      status: (values.status || undefined) as UserFilters["status"],
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.role, values.status]);

  return null;
};

const RouteSetting = () => {
  const { permissions } = useSelector((state: RootState) => state.auth);

  // Derive permissions for "/setting/route-setting" from Redux (loaded once at login)
  const pagePermission = useMemo(() => {
    if (!permissions) {
      return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }
    const p = permissions.find(
      (perm) => perm.routePath.toLowerCase() === "/setting/route-setting"
    );
    return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
  }, [permissions]);

  const [appliedFilters, setAppliedFilters] = useState<UserFilters>({});
  const [pageSize, setPageSize] = useState(10);

  const queryFilters = useMemo<UserFilters>(
    () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: pageSize }),
    [appliedFilters, pageSize]
  );

  const { data: rolesResponse } = useQuery({
    queryKey: ["user-roles"],
    queryFn: () => userService.getRoles(),
    enabled: pagePermission.canRead,
  });
  const roles = rolesResponse?.data?.data || [];

  const {
    data: usersResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["route-setting-users", queryFilters],
    queryFn: ({ signal }) => userService.getUsers(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const usersList: UserData[] = usersResponse?.data?.data || [];
  const paginationMeta = usersResponse?.data?.meta || {
    page: 1,
    limit: pageSize,
    total: 0,
    totalPages: 1,
  };

  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  return (
    <div className="space-y-6 p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#3d6fe0]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Route Setting</h2>
          <p className="text-xs text-slate-500">Grant or revoke per-user access to each module.</p>
        </div>
      </div>

      {/* Filters Section — Formik managed */}
      <div className="rounded-2xl flex items-center justify-between border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          initialValues={{ search: "", role: "", status: "" }}
          validate={(values) => {
            const result = routeSettingFilterSchema.safeParse(values);
            return result.success ? {} : { search: result.error.issues[0]?.message };
          }}
          onSubmit={() => {}}
        >
          {({ resetForm }) => (
            <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <FilterSync setAppliedFilters={setAppliedFilters} />

              <div className="relative flex-1 min-w-50 max-w-md">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Field
                  name="search"
                  type="text"
                  placeholder="Search by name or email..."
                  className="w-full form-input pl-9"
                  component={FormikInput}
                />
              </div>

              <Field
                as="select"
                name="role"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="">All Roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Field>

              <Field
                as="select"
                name="status"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Field>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setAppliedFilters({});
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </Form>
          )}
        </Formik>
      </div>

      {/* Users Data Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {!pagePermission.canRead ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
            <Lock className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">You do not have permission to view Route Setting.</p>
            <p className="text-xs text-slate-400">Contact an administrator if you believe this is a mistake.</p>
          </div>
        ) : isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center text-rose-500 gap-2 px-6 text-center">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm font-semibold">
              {(error as any)?.response?.data?.message || (error as any)?.message || "Failed to load users"}
            </p>
          </div>
        ) : usersList.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
            <UsersIcon className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium">No users found</p>
            <p className="text-xs text-slate-400">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Sr.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Name</th>
                  <th className="hidden md:table-cell px-4 py-3.5 whitespace-nowrap">Email</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Role</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {usersList.map((user, index) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-slate-400 font-medium whitespace-nowrap">
                      {(paginationMeta.page - 1) * paginationMeta.limit + index + 1}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 whitespace-nowrap">{user.name}</div>
                      <div className="text-[11px] text-slate-400 md:hidden flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </div>
                    </td>

                    <td className="hidden md:table-cell px-4 py-3.5 text-slate-600 whitespace-nowrap">
                      {user.email}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                          user.Role?.name === "Admin"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {user.Role?.name || "—"}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {pagePermission.canUpdate && (
                        <button
                          type="button"
                          onClick={() => setEditingUser(user)}
                          title="Edit Permissions"
                          className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagePermission.canRead && !isLoading && !isError && usersList.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {paginationMeta.page} of {paginationMeta.totalPages} · {paginationMeta.total} total users
              {isFetching && <span className="ml-2 text-slate-400">(refreshing…)</span>}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-slate-500">
                Rows:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setAppliedFilters((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#3d6fe0] focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={paginationMeta.page <= 1}
                  onClick={() =>
                    setAppliedFilters((prev) => ({ ...prev, page: Math.max(1, paginationMeta.page - 1) }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={paginationMeta.page >= paginationMeta.totalPages}
                  onClick={() =>
                    setAppliedFilters((prev) => ({
                      ...prev,
                      page: Math.min(paginationMeta.totalPages, paginationMeta.page + 1),
                    }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <RoutePermissionsEditModal user={editingUser} onClose={() => setEditingUser(null)} />
      )}
    </div>
  );
};

export default RouteSetting;
