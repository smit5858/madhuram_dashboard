import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Field, Form, Formik } from "formik";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import type { RootState } from "@/store/store";
import taskService, { type TaskData } from "@/services/task.service";
import projectService from "@/services/project.service";
import userService from "@/services/user.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import { taskEntrySchema, type TaskEntryFormValues } from "@/validation/task.validation";
import { TASK_PRIORITY_OPTIONS, type TaskPriority } from "@/shared/constants/taskPriority";
import { TASK_TYPE_LABEL, type TaskType } from "@/shared/constants/taskType";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface TaskFormModalProps {
  /** null = creating a new task */
  task: TaskData | null;
  /** Pre-selects/locks the task type (e.g. "PROJECT_TASK" when launched from a project page). */
  defaultTaskType?: TaskType;
  /** Pre-selects/locks the project (used together with defaultTaskType="PROJECT_TASK"). */
  defaultProjectId?: number;
  onClose: () => void;
}

// Datetime-local inputs need "YYYY-MM-DDTHH:mm" — an ISO timestamp from the API has extra
// precision/timezone suffix that the input rejects outright.
const toDatetimeLocal = (value?: string | null) => (value ? value.slice(0, 16) : "");

const TaskFormModal = ({ task, defaultTaskType, defaultProjectId, onClose }: TaskFormModalProps) => {
  const queryClient = useQueryClient();
  const { role } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";
  const isEdit = !!task?.id;
  const projectLocked = defaultTaskType === "PROJECT_TASK" && !!defaultProjectId;

  const taskTypeOptions = useMemo(() => {
    const types: TaskType[] = isAdmin ? ["ADMIN_TO_EMPLOYEE", "EMPLOYEE_TO_EMPLOYEE", "PROJECT_TASK"] : ["EMPLOYEE_TO_EMPLOYEE", "PROJECT_TASK"];
    return types.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }));
  }, [isAdmin]);

  const initialTaskType: TaskType = task?.taskType || defaultTaskType || "EMPLOYEE_TO_EMPLOYEE";

  const { data: projectsResp } = useQuery({
    queryKey: ["projects", "for-task-form"],
    queryFn: () => projectService.getProjects({ limit: 100, status: "ACTIVE" }),
    enabled: !isEdit && initialTaskType === "PROJECT_TASK" && !projectLocked,
  });
  const projectOptions = (projectsResp?.data?.data || []).map((p) => ({ value: p.id, label: p.name }));

  const { data: projectDetailResp } = useQuery({
    queryKey: ["projects", "detail", defaultProjectId],
    queryFn: () => projectService.getProjectById(defaultProjectId!),
    enabled: projectLocked,
  });
  const projectMembers = (projectDetailResp?.data?.data?.members || []).filter((m) => !m.removedAt);

  const { data: usersResp } = useQuery({
    queryKey: ["users", "for-task-assignees"],
    queryFn: () => userService.getUsers({ limit: 100, status: "active" }),
    enabled: !isEdit && !projectLocked,
  });

  const assigneeChoices = projectLocked
    ? projectMembers.map((m) => ({ id: m.userId, name: m.user?.name || `#${m.userId}`, email: m.user?.email || "" }))
    : (usersResp?.data?.data || []).map((u) => ({ id: u.id, name: u.name, email: u.email }));

  const initialValues: TaskEntryFormValues = {
    title: task?.title || "",
    description: task?.description || "",
    taskType: initialTaskType,
    projectId: defaultProjectId ?? task?.projectId ?? "",
    priority: task?.priority || "MEDIUM",
    startAt: toDatetimeLocal(task?.startAt),
    dueAt: toDatetimeLocal(task?.dueAt),
    assigneeIds: (task?.assignees || []).filter((a) => !a.removedAt).map((a) => a.userId),
  };

  const saveMutation = useMutation({
    mutationFn: (values: TaskEntryFormValues) => {
      if (isEdit) {
        return taskService.updateTask(task!.id, {
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          priority: values.priority as TaskPriority,
          startAt: values.startAt || undefined,
          dueAt: values.dueAt || undefined,
        });
      }
      return taskService.createTask({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        taskType: values.taskType as TaskType,
        projectId: values.taskType === "PROJECT_TASK" ? Number(values.projectId) : undefined,
        priority: values.priority as TaskPriority,
        startAt: values.startAt || undefined,
        dueAt: values.dueAt || undefined,
        assigneeIds: (values.assigneeIds || []).map(Number),
      });
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Task updated successfully" : "Task created successfully"));
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save task");
    },
  });

  const validate = (values: TaskEntryFormValues) => {
    const result = taskEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof TaskEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof TaskEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Task" : "New Task"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => saveMutation.mutate(values)} enableReinitialize>
          {({ values, setFieldValue }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
                <Field name="title" label="Task Title" placeholder="e.g. Install ThinkDiag 2" component={FormikInput} />
                <Field name="description" label="Description (optional)" placeholder="What needs to be done" multiline component={FormikInput} />

                {!isEdit && !projectLocked && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field name="taskType" label="Task Type" options={taskTypeOptions} component={FormikSelect} />
                    <Field name="priority" label="Priority" options={TASK_PRIORITY_OPTIONS} component={FormikSelect} />
                  </div>
                )}
                {(isEdit || projectLocked) && <Field name="priority" label="Priority" options={TASK_PRIORITY_OPTIONS} component={FormikSelect} />}

                {!isEdit && values.taskType === "PROJECT_TASK" && !projectLocked && (
                  <Field name="projectId" label="Project" options={projectOptions} placeholder="Select a project" component={FormikSelect} />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="form-field">
                    <label className="form-input-label">Start Date/Time (optional)</label>
                    <input
                      type="datetime-local"
                      value={values.startAt || ""}
                      onChange={(e) => setFieldValue("startAt", e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-input-label">Due Date/Time (optional)</label>
                    <input
                      type="datetime-local"
                      value={values.dueAt || ""}
                      onChange={(e) => setFieldValue("dueAt", e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                {!isEdit && (
                  <div>
                    <div className="form-input-label mb-2">Assign To</div>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3 flex flex-col gap-2">
                      {assigneeChoices.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          {values.taskType === "PROJECT_TASK" ? "Select a project first." : "No users available."}
                        </p>
                      ) : (
                        assigneeChoices.map((u) => {
                          const checked = (values.assigneeIds || []).map(Number).includes(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const current = (values.assigneeIds || []).map(Number);
                                  setFieldValue("assigneeIds", e.target.checked ? [...current, u.id] : current.filter((id) => id !== u.id));
                                }}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              {u.name} {u.email && <span className="text-slate-400">({u.email})</span>}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3560c4] disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : isEdit ? "Update Task" : "Create Task"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default TaskFormModal;
