import { z } from "zod";

const nameField = z.string().min(1, "Project name is required").max(200, "Name must be under 200 characters");
const descriptionField = z.string().max(2000, "Description must be under 2000 characters").optional();

export const PROJECT_TASK_CREATION_PERMISSIONS = ["ADMIN_ONLY", "ADMIN_AND_MEMBERS"] as const;

export const projectEntrySchema = z.object({
  name: nameField,
  description: descriptionField,
  taskCreationPermission: z.enum(PROJECT_TASK_CREATION_PERMISSIONS, { error: "Task creation permission is required" }),
  memberIds: z.array(z.union([z.string(), z.number()])).optional(),
});

export type ProjectEntryFormValues = z.infer<typeof projectEntrySchema>;

export const projectFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  status: z.string().optional(),
});

export type ProjectFilterValues = z.infer<typeof projectFilterSchema>;
