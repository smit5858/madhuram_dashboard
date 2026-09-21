export type TaskStatus = "PENDING" | "IN_PROGRESS" | "IN_REVIEW" | "ON_HOLD" | "COMPLETED" | "CANCELLED";

// Order here is also the Kanban board's column order.
export const TASK_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "COMPLETED", "CANCELLED"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const TASK_STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  PENDING: "bg-slate-50 text-slate-600 border border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border border-blue-100",
  IN_REVIEW: "bg-violet-50 text-violet-700 border border-violet-100",
  ON_HOLD: "bg-amber-50 text-amber-700 border border-amber-100",
  COMPLETED: "bg-green-50 text-green-700 border border-green-100",
  CANCELLED: "bg-rose-50 text-rose-700 border border-rose-100",
};

export const TASK_STATUS_OPTIONS = TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }));

/** Label for a raw status code from an activity-log entry (falls back to the code itself). */
export const taskStatusLabel = (status?: string | null): string =>
  status && status in TASK_STATUS_LABEL ? TASK_STATUS_LABEL[status as TaskStatus] : status || "—";
