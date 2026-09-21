import { z } from "zod";
import { TASK_TYPES } from "@/shared/constants/taskType";
import { TASK_PRIORITIES } from "@/shared/constants/taskPriority";

const titleField = z.string().min(1, "Task title is required").max(200, "Title must be under 200 characters");
const descriptionField = z.string().max(5000, "Description must be under 5000 characters").optional();

export const taskEntrySchema = z
  .object({
    title: titleField,
    description: descriptionField,
    taskType: z.enum(TASK_TYPES as [string, ...string[]], { error: "Task type is required" }),
    projectId: z.union([z.string(), z.number()]).optional(),
    priority: z.enum(TASK_PRIORITIES as [string, ...string[]], { error: "Priority is required" }),
    startAt: z.string().optional(),
    dueAt: z.string().optional(),
    assigneeIds: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.taskType === "PROJECT_TASK" && (values.projectId === undefined || values.projectId === "")) {
      ctx.addIssue({ code: "custom", path: ["projectId"], message: "Project is required for a project task" });
    }
    if (values.startAt && values.dueAt && values.startAt > values.dueAt) {
      ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Due date/time cannot be before the start date/time" });
    }
  });

export type TaskEntryFormValues = z.infer<typeof taskEntrySchema>;

export const taskFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  taskType: z.string().optional(),
  assigneeId: z.string().optional(),
});

export type TaskFilterValues = z.infer<typeof taskFilterSchema>;
