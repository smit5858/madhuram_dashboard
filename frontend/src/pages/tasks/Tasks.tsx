import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Field, Form, Formik, useFormikContext, type FormikProps } from "formik";
import { AlertTriangle, ClipboardList, KanbanSquare, List, Plus, RotateCcw, Search as SearchIcon } from "lucide-react";
import type { RootState } from "@/store/store";
import taskService, { type TaskFilters } from "@/services/task.service";
import { taskFilterSchema, type TaskFilterValues } from "@/validation/task.validation";
import { TASK_STATUS_OPTIONS } from "@/shared/constants/taskStatus";
import { TASK_PRIORITY_OPTIONS } from "@/shared/constants/taskPriority";
import { TASK_TYPE_LABEL, TASK_TYPE_OPTIONS } from "@/shared/constants/taskType";
import { useDebounce } from "@/hook/useDebounce";
import { useDocumentTitle } from "@/hook/useDocumentTitle";
import { formatDateTime } from "@/shared/utils/date";
import TaskStatusBadge from "./components/TaskStatusBadge";
import TaskPriorityBadge from "./components/TaskPriorityBadge";
import TaskFormModal from "./components/TaskFormModal";
import TaskViewModal from "./components/TaskViewModal";
import TaskBoard from "./components/TaskBoard";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [{ value: "", label: "All Status" }, ...TASK_STATUS_OPTIONS];
const PRIORITY_OPTIONS = [{ value: "", label: "All Priority" }, ...TASK_PRIORITY_OPTIONS];
const TYPE_OPTIONS = [{ value: "", label: "All Types" }, ...TASK_TYPE_OPTIONS];

const FilterSync = ({ setAppliedFilters }: { setAppliedFilters: React.Dispatch<React.SetStateAction<TaskFilters>> }) => {
  const { values } = useFormikContext<TaskFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      status: (values.status || undefined) as TaskFilters["status"],
      priority: (values.priority || undefined) as TaskFilters["priority"],
      taskType: (values.taskType || undefined) as TaskFilters["taskType"],
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.status, values.priority, values.taskType]);

  return null;
};

const Tasks = () => {
  useDocumentTitle("Tasks");
  const { permissions, userId } = useSelector((state: RootState) => state.auth);

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, viewAllRecords: false };
    if (!permissions) return fallback;
    return permissions.find((p) => p.routePath.toLowerCase() === "/tasks") ?? fallback;
  }, [permissions]);

  const [appliedFilters, setAppliedFilters] = useState<TaskFilters>({});
  const filterFormRef = useRef<FormikProps<TaskFilterValues>>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewTaskId, setViewTaskId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const queryFilters = useMemo<TaskFilters>(() => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: PAGE_SIZE }), [appliedFilters]);

  const { data: taskResponse, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["tasks", queryFilters],
    queryFn: ({ signal }) => taskService.getTasks(queryFilters, { signal }),
    enabled: pagePermission.canRead && viewMode === "list",
  });

  const taskList = taskResponse?.data?.data || [];
  const meta = taskResponse?.data?.meta || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const hasActiveFilters = Boolean(appliedFilters.search || appliedFilters.status || appliedFilters.priority || appliedFilters.taskType);

  const handleReset = () => {
    filterFormRef.current?.resetForm();
    setAppliedFilters({});
  };

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">You do not have permission to view tasks.</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          innerRef={filterFormRef}
          initialValues={{ search: "", status: "", priority: "", taskType: "" } as TaskFilterValues}
          validate={(values) => {
            const result = taskFilterSchema.safeParse(values);
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
                    placeholder="Search title, description..."
                    className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                  />
                </div>
                {[
                  { name: "status", options: STATUS_OPTIONS },
                  { name: "priority", options: PRIORITY_OPTIONS },
                  { name: "taskType", options: TYPE_OPTIONS },
                ]
                  .filter(({ name }) => !(viewMode === "board" && name === "status"))
                  .map(({ name, options }) => (
                  <Field
                    key={name}
                    as="select"
                    name={name}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    {options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Field>
                ))}
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

              <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    { mode: "list", label: "List", Icon: List },
                    { mode: "board", label: "Board", Icon: KanbanSquare },
                  ] as const
                ).map(({ mode, label, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                      viewMode === mode ? "bg-white text-[#3d6fe0] shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
              {pagePermission.canCreate && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" /> New Task
                </button>
              )}
              </div>
            </div>
          </Form>
        </Formik>
      </div>

      {viewMode === "board" && <TaskBoard filters={appliedFilters} onOpenTask={setViewTaskId} />}

      <div className={`rounded-xl border border-gray-200 overflow-hidden ${viewMode === "board" ? "hidden" : ""}`}>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-48 flex-col items-center justify-center text-red-500 gap-1 text-center px-4">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm font-semibold">{(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load tasks"}</p>
          </div>
        ) : taskList.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-slate-400 gap-2">
            <ClipboardList className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-gray-500">No tasks found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Task</th>
                  <th className="px-4 py-3 whitespace-nowrap">Type</th>
                  <th className="px-4 py-3 whitespace-nowrap">Project</th>
                  <th className="px-4 py-3 whitespace-nowrap">Priority</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Assignees</th>
                  <th className="px-4 py-3 whitespace-nowrap">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {taskList.map((task) => {
                  const activeAssignees = (task.assignees || []).filter((a) => !a.removedAt);
                  const isMine = task.createdBy === userId || activeAssignees.some((a) => a.userId === userId);
                  return (
                    <tr key={task.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setViewTaskId(task.id)}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-blue-700">{task.title}</span>
                        {isMine && <span className="ml-2 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">Mine</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{TASK_TYPE_LABEL[task.taskType]}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{task.project?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <TaskPriorityBadge priority={task.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {activeAssignees.length === 0 ? "—" : activeAssignees.map((a) => a.user?.name).filter(Boolean).join(", ")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{task.dueAt ? formatDateTime(task.dueAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && taskList.length > 0 && (
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

      {showAddModal && <TaskFormModal task={null} onClose={() => setShowAddModal(false)} />}
      {viewTaskId !== null && <TaskViewModal taskId={viewTaskId} onClose={() => setViewTaskId(null)} />}
    </div>
  );
};

export default Tasks;
