import { z } from "zod";

export const userFilterSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
});

export type UserFilterValues = z.infer<typeof userFilterSchema>;

const nameField = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must be under 100 characters");

const emailField = z
  .string()
  .min(1, "Email is required")
  .email("Please enter a valid email");

const roleIdField = z.coerce
  .number({ error: "Role is required" })
  .min(1, "Role is required");

export const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: z.string().min(6, "Password must be at least 6 characters"),
  roleId: roleIdField,
  allowedCity: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export const editUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: z
    .union([z.literal(""), z.string().min(6, "Password must be at least 6 characters")])
    .optional(),
  roleId: roleIdField,
  allowedCity: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type EditUserFormValues = z.infer<typeof editUserSchema>;
