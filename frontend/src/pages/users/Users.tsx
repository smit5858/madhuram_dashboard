import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Field, Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import {
  Users as UsersIcon,
  Search as SearchIcon,
  Plus,
  Edit2,
  Trash2,
  Eye,
  XCircle,
  Mail,
  ShieldCheck,
  UserCheck,
  RotateCcw,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { useDebounce } from "@/hook/useDebounce";
import { type RootState } from "../../store/store";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import userService, {
  type UserData,
  type CreateUserPayload,
  type UpdateUserPayload,
  type UserFilters,
} from "../../services/user.service";
import {
  userFilterSchema,
  createUserSchema,
  editUserSchema,
  type UserFilterValues,
} from "@/validation/user.validation";

interface UserFormValues {
  name: string;
  email: string;
  password: string;
  roleId: number | "";
  allowedCity: string;
  isActive: boolean;
}

const EMPTY_FORM_VALUES: UserFormValues = {
  name: "",
  email: "",
  password: "",
  roleId: "",
  allowedCity: "",
  isActive: true,
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

/** Applies filter form values to the fetched list — search is debounced, selects apply immediately. */
const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<UserFilters>>;
}) => {
  const { values } = useFormikContext<UserFilterValues>();
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

const Users = () => {
  const queryClient = useQueryClient();
  const { permissions } = useSelector((state: RootState) => state.auth);

  // Derive permissions for "/users" from Redux (loaded once at login)
  const pagePermission = useMemo(() => {
    if (!permissions) {
      return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }
    const p = permissions.find(
      (perm) =>
        perm.routePath.toLowerCase() === "/users" ||
        perm.routeName.toLowerCase() === "users"
    );
    return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
  }, [permissions]);

  // Filters + pagination state
  const [appliedFilters, setAppliedFilters] = useState<UserFilters>({});
  const [pageSize, setPageSize] = useState(10);

  const queryFilters = useMemo<UserFilters>(
    () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: pageSize }),
    [appliedFilters, pageSize]
  );

  // Query: Roles (for filter + form dropdowns)
  const { data: rolesResponse } = useQuery({
    queryKey: ["user-roles"],
    queryFn: () => userService.getRoles(),
    enabled: pagePermission.canRead,
  });
  const roles = rolesResponse?.data?.data || [];

  // Query: Users List
  const {
    data: usersResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["users", queryFilters],
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

  // Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  // Mutation: Create User
  const createUserMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => userService.createUser(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || "User created successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeFormModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to create user");
    },
  });

  // Mutation: Update User
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserPayload }) =>
      userService.updateUser(id, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || "User updated successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeFormModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to update user");
    },
  });

  // Mutation: Deactivate User
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => userService.deleteUser(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "User deactivated successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to deactivate user");
    },
  });

  const openCreateModal = () => {
    setSelectedUser(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (user: UserData) => {
    setSelectedUser(user);
    setIsFormModalOpen(true);
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setSelectedUser(null);
  };

  const openDetailModal = (user: UserData) => {
    setSelectedUser(user);
    setIsDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedUser(null);
  };

  const validateUserForm = (values: UserFormValues) => {
    const schema = selectedUser ? editUserSchema : createUserSchema;
    const result = schema.safeParse(values);
    if (result.success) return {};
    return result.error.issues.reduce(
      (errors, issue) => {
        const field = issue.path[0] as keyof UserFormValues;
        if (!errors[field]) errors[field] = issue.message;
        return errors;
      },
      {} as Partial<Record<keyof UserFormValues, string>>
    );
  };

  const handleFormSubmit = (values: UserFormValues, helpers: FormikHelpers<UserFormValues>) => {
    const basePayload = {
      name: values.name.trim(),
      email: values.email.trim(),
      roleId: Number(values.roleId),
      allowedCity: values.allowedCity.trim() || undefined,
      isActive: values.isActive,
    };

    if (selectedUser) {
      const updatePayload: UpdateUserPayload = { ...basePayload };
      if (values.password) updatePayload.password = values.password;
      updateUserMutation.mutate(
        { id: selectedUser.id, data: updatePayload },
        { onSettled: () => helpers.setSubmitting(false) }
      );
    } else {
      const createPayload: CreateUserPayload = { ...basePayload, password: values.password };
      createUserMutation.mutate(createPayload, {
        onSettled: () => helpers.setSubmitting(false),
      });
    }
  };

  const handleDelete = (user: UserData) => {
    if (window.confirm(`Are you sure you want to deactivate "${user.name}"? They will no longer be able to log in.`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  const isMutating = createUserMutation.isPending || updateUserMutation.isPending;

  return (
    <div className="space-y-6 p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#3d6fe0]">
            <UsersIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Users</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{paginationMeta.total}</h3>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active On This Page</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              {usersList.filter((u) => u.isActive).length}
            </h3>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current View</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              Page {paginationMeta.page} / {paginationMeta.totalPages}
            </h3>
          </div>
        </div>
      </div>

      {/* Filters Section — Formik managed */}
      <div className="rounded-2xl flex items-center justify-between border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          initialValues={{ search: "", role: "", status: "" }}
          validate={(values) => {
            const result = userFilterSchema.safeParse(values);
            return result.success ? {} : { search: result.error.issues[0]?.message };
          }}
          onSubmit={(values) => {
            setAppliedFilters((prev) => ({
              ...prev,
              search: values.search || undefined,
              role: values.role || undefined,
              status: (values.status || undefined) as UserFilters["status"],
              page: 1,
            }));
          }}
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
              </button>
            </Form>
          )}
        </Formik>

        {pagePermission.canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3d6fe0] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#3162d2] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Add User</span>
          </button>
        )}
      </div>

      {/* Users Data Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {!pagePermission.canRead ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
            <Lock className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">You do not have permission to view users.</p>
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
            <p className="text-xs text-slate-400">
              {appliedFilters.search || appliedFilters.role || appliedFilters.status
                ? "Try adjusting your search or filters"
                : "Click 'Add User' to create the first account"}
            </p>
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
                  <th className="hidden lg:table-cell px-4 py-3.5 whitespace-nowrap">Created Date</th>
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

                    <td className="hidden lg:table-cell px-4 py-3.5 whitespace-nowrap text-[11px] text-slate-400">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN") : "—"}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetailModal(user)}
                          title="View User Details"
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {pagePermission.canUpdate && (
                          <button
                            type="button"
                            onClick={() => openEditModal(user)}
                            title="Edit User"
                            className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}

                        {pagePermission.canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(user)}
                            title="Deactivate User"
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

      {/* CREATE / EDIT USER MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedUser ? "Edit User" : "Add New User"}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedUser
                    ? "Leave password blank to keep the current password."
                    : "The new user will be able to log in immediately with these credentials."}
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

            <Formik
              initialValues={
                selectedUser
                  ? {
                      name: selectedUser.name || "",
                      email: selectedUser.email || "",
                      password: "",
                      roleId: selectedUser.roleId ?? "",
                      allowedCity: selectedUser.allowedCity || "",
                      isActive: selectedUser.isActive ?? true,
                    }
                  : EMPTY_FORM_VALUES
              }
              enableReinitialize
              validate={validateUserForm}
              onSubmit={handleFormSubmit}
            >
              {({ values, setFieldValue, isSubmitting }) => (
                <Form className="mt-5 space-y-4">
                  <Field
                    name="name"
                    label="Full Name *"
                    placeholder="e.g. Parth Patel"
                    component={FormikInput}
                  />

                  <Field
                    name="email"
                    type="email"
                    label="Email Address *"
                    placeholder="user@madhuram.com"
                    component={FormikInput}
                  />

                  <Field
                    name="password"
                    type="password"
                    label={selectedUser ? "New Password" : "Password *"}
                    placeholder={selectedUser ? "Leave blank to keep current" : "At least 6 characters"}
                    showPasswordToggle
                    component={FormikInput}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
                      <select
                        value={values.roleId}
                        onChange={(e) =>
                          setFieldValue("roleId", e.target.value ? Number(e.target.value) : "")
                        }
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                      >
                        <option value="">-- Select Role --</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Allowed City</label>
                      <input
                        type="text"
                        value={values.allowedCity}
                        onChange={(e) => setFieldValue("allowedCity", e.target.value)}
                        placeholder="Leave blank for no restriction"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={values.isActive}
                      onChange={(e) => setFieldValue("isActive", e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#3d6fe0] focus:ring-[#3d6fe0]"
                    />
                    Active (can log in)
                  </label>

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
                      disabled={isSubmitting || isMutating}
                      className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#3162d2] disabled:opacity-50 transition"
                    >
                      {isSubmitting || isMutating
                        ? "Saving..."
                        : selectedUser
                        ? "Update User"
                        : "Create User"}
                    </button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* USER DETAILS MODAL */}
      {isDetailModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedUser.name}</h3>
                <p className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />
                  {selectedUser.email}
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
                  <span className="text-slate-400 font-medium block">Role:</span>
                  <span className="text-slate-800 font-semibold">{selectedUser.Role?.name || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Status:</span>
                  <span className={selectedUser.isActive ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                    {selectedUser.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Allowed City:</span>
                  <span className="text-slate-800 font-semibold">{selectedUser.allowedCity || "No restriction"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Joined On:</span>
                  <span className="text-slate-800 font-semibold">
                    {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString("en-IN") : "—"}
                  </span>
                </div>
              </div>
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

export default Users;
