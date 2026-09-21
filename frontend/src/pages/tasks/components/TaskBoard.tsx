import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { AlertTriangle, ClipboardList, GripVertical, Loader2 } from "lucide-react";
import type { RootState } from "@/store/store";
import taskService, { type TaskData, type TaskFilters } from "@/services/task.service";
import { TASK_STATUSES, TASK_STATUS_BADGE_CLASS, TASK_STATUS_LABEL, type TaskStatus } from "@/shared/constants/taskStatus";
import { TASK_TYPE_LABEL } from "@/shared/constants/taskType";
import { formatDateTime } from "@/shared/utils/date";
import TaskPriorityBadge from "./TaskPriorityBadge";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

type TaskListResponse = Awaited<ReturnType<typeof taskService.getTasks>>;

const BOARD_LIMIT = 100;

interface TaskBoardProps {
  /** List filters (search/priority/type); status and paging are ignored — columns *are* statuses. */
  filters: TaskFilters;
  onOpenTask: (taskId: number) => void;
}

const TaskBoard = ({ filters, onOpenTask }: TaskBoardProps) => {
  const queryClient = useQueryClient();
  const { role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Set on drop so a click event fired right after a drag doesn't also open the task.
  const justDragged = useRef(false);

  const boardFilters: TaskFilters = { ...filters, status: undefined, page: 1, limit: BOARD_LIMIT };
  const boardKey = ["tasks", "board", boardFilters];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: boardKey,
    queryFn: ({ signal }) => taskService.getTasks(boardFilters, { signal }),
  });

  const tasks = data?.data?.data || [];
  const total = data?.data?.meta?.total ?? tasks.length;

  // Mirrors the backend's canActOnTask (Admin, creator, or active assignee) — UX only, the
  // status endpoint re-checks and is the real boundary.
  const canMove = (task: TaskData) => isAdmin || task.createdBy === userId || (task.assignees || []).some((a) => !a.removedAt && a.userId === userId);

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => taskService.updateTaskStatus(id, status),
    onMutate: async ({ id, status }) => {
      setMoveError(null);
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previous = queryClient.getQueryData<TaskListResponse>(boardKey);
      // Optimistic move: the card jumps columns immediately and is restored in onError if the
      // server rejects the change. The same task row is edited — nothing is ever duplicated.
      queryClient.setQueryData<TaskListResponse>(boardKey, (old) =>
        old ? { ...old, data: { ...old.data, data: old.data.data.map((t) => (t.id === id ? { ...t, status } : t)) } } : old
      );
      return { previous };
    },
    onError: (err: ApiErrorLike, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
      const message = err.response?.data?.message || err.message || "Failed to update task status";
      setMoveError(message);
      toast.error(message);
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || "Task status updated");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const pendingTaskId = moveMutation.isPending ? moveMutation.variables?.id : null;

  const handleDrop = (status: TaskStatus) => {
    const task = tasks.find((t) => t.id === dragTaskId);
    setDragTaskId(null);
    setOverStatus(null);
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
    if (!task || task.status === status || !canMove(task)) return;
    moveMutation.mutate({ id: task.id, status });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-gray-200">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 px-4 text-center text-red-500">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm font-semibold">{(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load tasks"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {moveError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {moveError} — the task was moved back to its previous column.
          </span>
          <button type="button" onClick={() => setMoveError(null)} className="font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUSES.map((status) => {
          const columnTasks = tasks.filter((t) => t.status === status);
          const isOver = overStatus === status && dragTaskId !== null;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (dragTaskId === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overStatus !== status) setOverStatus(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverStatus((cur) => (cur === status ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(status);
              }}
              className={`flex w-64 shrink-0 flex-col rounded-xl border bg-slate-50/60 transition ${isOver ? "border-[#3d6fe0] bg-blue-50/60" : "border-slate-200"}`}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TASK_STATUS_BADGE_CLASS[status]}`}>{TASK_STATUS_LABEL[status]}</span>
                <span className="text-xs font-semibold text-slate-400">{columnTasks.length}</span>
              </div>

              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {columnTasks.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-6 text-slate-300">
                    <ClipboardList className="h-5 w-5" />
                    <span className="text-[11px]">No tasks</span>
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    const movable = canMove(task);
                    const activeAssignees = (task.assignees || []).filter((a) => !a.removedAt);
                    const isSaving = pendingTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        draggable={movable && !isSaving}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(task.id));
                          setMoveError(null);
                          setDragTaskId(task.id);
                        }}
                        onDragEnd={() => {
                          setDragTaskId(null);
                          setOverStatus(null);
                        }}
                        onClick={() => {
                          if (!justDragged.current) onOpenTask(task.id);
                        }}
                        title={movable ? "Drag to another column to change status" : "You can't change the status of this task"}
                        className={`relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 ${
                          movable && !isSaving ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${dragTaskId === task.id ? "opacity-40" : ""}`}
                      >
                        {isSaving && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 rounded-lg bg-white/70 text-xs font-medium text-slate-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                          </div>
                        )}
                        <div className="flex items-start gap-1.5">
                          {movable && <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />}
                          <span className="text-sm font-medium text-slate-800">{task.title}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <TaskPriorityBadge priority={task.priority} />
                          <span className="text-[11px] text-slate-400">{TASK_TYPE_LABEL[task.taskType]}</span>
                        </div>
                        {task.project?.name && <div className="mt-1.5 text-[11px] text-slate-400">{task.project.name}</div>}
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="truncate">{activeAssignees.length ? activeAssignees.map((a) => a.user?.name).filter(Boolean).join(", ") : "Unassigned"}</span>
                          {task.dueAt && <span className="shrink-0 text-slate-400">{formatDateTime(task.dueAt)?.split(",")[0]}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {total > BOARD_LIMIT && (
        <p className="text-xs text-slate-400">
          Showing the {BOARD_LIMIT} most recent of {total} tasks — use the filters to narrow the board.
        </p>
      )}
    </div>
  );
};

export default TaskBoard;
