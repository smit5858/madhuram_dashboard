import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowRightLeft, Calendar, Edit2, FolderKanban, Trash2, User, UserMinus, UserPlus, XCircle } from "lucide-react";
import type { RootState } from "@/store/store";
import taskService from "@/services/task.service";
import userService from "@/services/user.service";
import projectService from "@/services/project.service";
import { formatDateTime } from "@/shared/utils/date";
import { TASK_STATUS_OPTIONS } from "@/shared/constants/taskStatus";
import TaskStatusBadge from "./TaskStatusBadge";
import TaskPriorityBadge from "./TaskPriorityBadge";
import TaskFormModal from "./TaskFormModal";
import TaskNotes from "./TaskNotes";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import TaskActivityTimeline from "./TaskActivityTimeline";
import TaskTimeLogged from "@/pages/timesheets/components/TaskTimeLogged";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface TaskViewModalProps {
  taskId: number;
  onClose: () => void;
}

const DetailItem = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: React.ReactNode;
}) => (
  <div className="flex items-start gap-2.5">
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
      <Icon className="h-3.5 w-3.5" />
    </div>
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">
        {value === undefined || value === null || value === "" ? <span className="font-normal text-slate-300">—</span> : value}
      </div>
    </div>
  </div>
);

const TaskViewModal = ({ taskId, onClose }: TaskViewModalProps) => {
  const queryClient = useQueryClient();
  const { role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [addAssigneeId, setAddAssigneeId] = useState<number | "">("");
  const [reassignToId, setReassignToId] = useState<number | "">("");

  const detailQueryKey = ["tasks", "detail", taskId];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => taskService.getTaskById(taskId),
  });
  const task = data?.data?.data;

  const { data: usersResp } = useQuery({
    queryKey: ["users", "for-task-assignees"],
    queryFn: () => userService.getUsers({ limit: 100, status: "active" }),
  });

  const activeAssignees = useMemo(() => (task?.assignees || []).filter((a) => !a.removedAt), [task]);

  // Mirrors the backend's canActOnTask/canManageAssignees rules — Admin, creator, or an active
  // assignee. This is UX only; the backend re-checks and is the real boundary.
  const canAct = isAdmin || task?.createdBy === userId || activeAssignees.some((a) => a.userId === userId);
  const canEditFields = isAdmin || task?.createdBy === userId;
  // Notes: Admin or someone currently assigned (backend canNoteOnTask) — a creator who handed
  // the task off can still view it but not add notes.
  const canNote = isAdmin || activeAssignees.some((a) => a.userId === userId);

  // Project tasks can only be (re)assigned to project members — the backend enforces this; the
  // picker is narrowed the same way so the user isn't offered choices that will be rejected.
  const projectId = task?.taskType === "PROJECT_TASK" ? task.projectId : null;
  const { data: projectResp } = useQuery({
    queryKey: ["projects", "detail", projectId],
    queryFn: () => projectService.getProjectById(projectId!),
    enabled: !!projectId && canAct,
  });
  const projectMemberIds = useMemo(
    () => (projectResp?.data?.data?.members || []).filter((m) => !m.removedAt).map((m) => m.userId),
    [projectResp]
  );

  const statusMutation = useMutation({
    mutationFn: (status: string) => taskService.updateTaskStatus(taskId, status as never),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Task status updated");
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to update status"),
  });

  const addAssigneeMutation = useMutation({
    mutationFn: (userIdToAdd: number) => taskService.addTaskAssignees(taskId, [userIdToAdd]),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Assignee added");
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setAddAssigneeId("");
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to add assignee"),
  });

  const removeAssigneeMutation = useMutation({
    mutationFn: (userIdToRemove: number) => taskService.removeTaskAssignee(taskId, userIdToRemove),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Assignee removed");
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to remove assignee"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => taskService.deleteTask(taskId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Task deleted");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to delete task"),
  });

  const reassignMutation = useMutation({
    mutationFn: (assigneeId: number) => taskService.reassignTask(taskId, assigneeId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Task reassigned");
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setReassignToId("");
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to reassign task"),
  });

  const addableUsers = (usersResp?.data?.data || []).filter((u) => !activeAssignees.some((a) => a.userId === u.id));
  const reassignableUsers = (usersResp?.data?.data || []).filter(
    (u) => !(activeAssignees.length === 1 && activeAssignees[0].userId === u.id) && (!projectId || projectMemberIds.includes(u.id))
  );

  if (isLoading || isError || !task) {
    return (
      <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-slate-200 flex items-center justify-center">
          {isLoading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-rose-500">
              <AlertTriangle className="h-8 w-8" />
              <p className="text-sm font-semibold">{(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load task"}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">{task.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Task #{task.id}</span>
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
              {task.project && (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <FolderKanban className="h-3 w-3" /> {task.project.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button type="button" onClick={() => setShowDeleteModal(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete task">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {canEditFields && (
              <button type="button" onClick={() => setShowEditModal(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit">
                <Edit2 className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {task.description && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Description</div>
              <p className="whitespace-pre-line text-sm text-slate-700">{task.description}</p>
            </div>
          )}

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailItem icon={User} label="Created By" value={task.creator?.name} />
            <DetailItem icon={Calendar} label="Start" value={task.startAt ? formatDateTime(task.startAt) : undefined} />
            <DetailItem icon={Calendar} label="Due" value={task.dueAt ? formatDateTime(task.dueAt) : undefined} />
            <DetailItem icon={Calendar} label="Completed" value={task.completedAt ? `${formatDateTime(task.completedAt)} by ${task.completer?.name || ""}` : undefined} />
          </div>

          {canAct && (
            <div className="rounded-xl border border-slate-100 p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Change Status</div>
              <div className="flex flex-wrap gap-2">
                {TASK_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={statusMutation.isPending || opt.value === task.status}
                    onClick={() => statusMutation.mutate(opt.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border disabled:opacity-40 disabled:cursor-not-allowed ${
                      opt.value === task.status ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-100 p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Assignees</div>
            <div className="flex flex-col gap-2">
              {activeAssignees.length === 0 ? (
                <p className="text-xs text-slate-400">No one assigned yet.</p>
              ) : (
                activeAssignees.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-700">{a.user?.name || `#${a.userId}`}</span>
                    {canAct && (
                      <button
                        type="button"
                        disabled={removeAssigneeMutation.isPending}
                        onClick={() => removeAssigneeMutation.mutate(a.userId)}
                        className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                        title="Remove"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            {canAct && (
              <div className="mt-3 flex gap-2">
                <select
                  value={addAssigneeId}
                  onChange={(e) => setAddAssigneeId(e.target.value ? Number(e.target.value) : "")}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                >
                  <option value="">Add an assignee...</option>
                  {addableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!addAssigneeId || addAssigneeMutation.isPending}
                  onClick={() => addAssigneeId && addAssigneeMutation.mutate(addAssigneeId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3560c4] disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            )}
            {canAct && (
              <div className="mt-2 flex gap-2">
                <select
                  value={reassignToId}
                  onChange={(e) => setReassignToId(e.target.value ? Number(e.target.value) : "")}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                >
                  <option value="">Reassign to (replaces current assignees)...</option>
                  {reassignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!reassignToId || reassignMutation.isPending}
                  onClick={() => reassignToId && reassignMutation.mutate(reassignToId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#3d6fe0] px-3 py-2 text-xs font-semibold text-[#3d6fe0] hover:bg-blue-50 disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" /> {reassignMutation.isPending ? "Reassigning..." : "Reassign"}
                </button>
              </div>
            )}
          </div>

          <TaskTimeLogged task={{ id: task.id, title: task.title, status: task.status, projectId: task.projectId, project: task.project }} />

          <div className="rounded-xl border border-slate-100 p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Notes</div>
            <TaskNotes taskId={taskId} notes={task.notes || []} canNote={canNote} isAdmin={isAdmin} currentUserId={userId} />
          </div>

          <div className="rounded-xl border border-slate-100 p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Activity Timeline</div>
            <TaskActivityTimeline entries={task.activityLog} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            Close
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <ConfirmDeleteModal
          title="Delete Task"
          itemName={task.title}
          warning="Its notes, assignments and activity history will be deleted too."
          isSubmitting={deleteMutation.isPending}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
      {showEditModal && <TaskFormModal task={task} onClose={() => setShowEditModal(false)} />}
    </div>
  );
};

export default TaskViewModal;
