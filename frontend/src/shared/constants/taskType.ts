export type TaskType = "ADMIN_TO_EMPLOYEE" | "EMPLOYEE_TO_EMPLOYEE" | "PROJECT_TASK";

export const TASK_TYPES: TaskType[] = ["ADMIN_TO_EMPLOYEE", "EMPLOYEE_TO_EMPLOYEE", "PROJECT_TASK"];

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  ADMIN_TO_EMPLOYEE: "Admin → Employee",
  EMPLOYEE_TO_EMPLOYEE: "Employee → Employee",
  PROJECT_TASK: "Project Task",
};

export const TASK_TYPE_OPTIONS = TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }));
