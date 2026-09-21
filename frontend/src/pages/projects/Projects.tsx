import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { AlertTriangle, FolderKanban, Plus, RotateCcw, Search as SearchIcon, Settings2, Trash2, Users } from "lucide-react";
import type { RootState } from "@/store/store";
import projectService, { type ProjectData, type ProjectFilters } from "@/services/project.service";
import { projectFilterSchema, type ProjectFilterValues } from "@/validation/project.validation";
import { useDebounce } from "@/hook/useDebounce";
import { useDocumentTitle } from "@/hook/useDocumentTitle";
import { formatDisplayDate } from "@/shared/utils/date";
import ProjectFormModal from "./components/ProjectFormModal";
import ProjectMembersModal from "./components/ProjectMembersModal";
import ConfirmDeleteModal from "../tasks/components/ConfirmDeleteModal";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: "bg-blue-50 text-blue-700 border border-blue-100",
  COMPLETED: "bg-green-50 text-green-700 border border-green-100",
  ARCHIVED: "bg-slate-50 text-slate-500 border border-slate-200",
};

const FilterSync = ({ setAppliedFilters }: { setAppliedFilters: React.Dispatch<React.SetStateAction<ProjectFilters>> }) => {
  const { values } = useFormikContext<ProjectFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, status: (values.status || undefined) as ProjectFilters["status"], page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.status]);

  return null;
};

const Projects = () => {
  useDocumentTitle("Projects");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { permissions, role } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, viewAllRecords: false };
    if (!permissions) return fallback;
    return permissions.find((p) => p.routePath.toLowerCase() === "/projects") ?? fallback;
  }, [permissions]);

  const [appliedFilters, setAppliedFilters] = useState<ProjectFilters>({});
  const filterFormRef = useRef<FormikProps<ProjectFilterValues>>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectService.deleteProject(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Project deleted");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setDeleteTarget(null);
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to delete project"),
  });
  const [membersProject, setMembersProject] = useState<ProjectData | null>(null);

  const queryFilters = useMemo<ProjectFilters>(() => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: PAGE_SIZE }), [appliedFilters]);

  const { data: projectResponse, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["projects", queryFilters],
    queryFn: ({ signal }) => projectService.getProjects(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const projectList = projectResponse?.data?.data || [];
  const meta = projectResponse?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const hasActiveFilters = Boolean(appliedFilters.search || appliedFilters.status);

  const handleReset = () => {
    filterFormRef.current?.resetForm();
    setAppliedFilters({});
  };

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">You do not have permission to view projects.</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          innerRef={filterFormRef}
          initialValues={{ search: "", status: "" } as ProjectFilterValues}
          validate={(values) => {
            const result = projectFilterSchema.safeParse(values);
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
                    placeholder="Search project name..."
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
                <button
                  type="button"
                  onClick={handleReset}
                  title="Clear filters"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${
                    hasActiveFilters ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Clear
                </button>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" /> New Project
                </button>
              )}
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
            <p className="text-sm font-semibold">{(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load projects"}</p>
          </div>
        ) : projectList.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <FolderKanban className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">No projects found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Project</th>
                  <th className="px-4 py-3 whitespace-nowrap">Task Creation</th>
                  <th className="px-4 py-3 whitespace-nowrap">Members</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Created</th>
                  <th className="px-4 py-3 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projectList.map((project) => {
                  const activeMembers = (project.members || []).filter((m) => !m.removedAt);
                  return (
                    <tr key={project.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => navigate(`/projects/${project.id}`)} className="font-medium text-blue-700 hover:underline">
                          {project.name}
                        </button>
                        {project.description && <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">{project.description}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {project.taskCreationPermission === "ADMIN_AND_MEMBERS" ? "Admin + Members" : "Admin Only"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-slate-400" /> {activeMembers.length}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[project.status]}`}>{project.status}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{formatDisplayDate(project.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isAdmin && (
                            <button type="button" onClick={() => setMembersProject(project)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Manage Members">
                              <Settings2 className="h-4 w-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button type="button" onClick={() => setDeleteTarget({ id: project.id, name: project.name })} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete Project">
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

        {!isLoading && !isError && projectList.length > 0 && (
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

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Delete Project"
          itemName={deleteTarget.name}
          warning="All tasks in this project, with their notes and history, will be deleted too."
          isSubmitting={deleteMutation.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
      {showAddModal && <ProjectFormModal project={null} onClose={() => setShowAddModal(false)} />}
      {membersProject && (
        <ProjectMembersModal
          project={membersProject}
          onClose={() => {
            setMembersProject(null);
            queryClient.invalidateQueries({ queryKey: ["projects"] });
          }}
        />
      )}
    </div>
  );
};

export default Projects;
