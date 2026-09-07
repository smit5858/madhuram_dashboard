import { z } from "zod";

export const roleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be under 100 characters"),
});

export type RoleFormValues = z.infer<typeof roleSchema>;

export const assignRoleSchema = z.object({
  userId: z.union([z.string().min(1, "Select a user"), z.number()]),
  roleId: z.union([z.string().min(1, "Select a role"), z.number()]),
});

export type AssignRoleFormValues = z.infer<typeof assignRoleSchema>;
