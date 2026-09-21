export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export const TASK_PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TASK_PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  LOW: "bg-slate-50 text-slate-600 border border-slate-200",
  MEDIUM: "bg-blue-50 text-blue-700 border border-blue-100",
  HIGH: "bg-amber-50 text-amber-700 border border-amber-100",
  URGENT: "bg-rose-50 text-rose-700 border border-rose-100",
};

export const TASK_PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }));
