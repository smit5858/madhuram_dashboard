import { z } from "zod";

export const routeSettingFilterSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
});

export type RouteSettingFilterValues = z.infer<typeof routeSettingFilterSchema>;

export const permissionEntrySchema = z.object({
  routeId: z.number(),
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  viewAllRecords: z.boolean(),
});

export const routePermissionsFormSchema = z.object({
  permissions: z.array(permissionEntrySchema).min(1, "No routes to configure"),
});

export type RoutePermissionsFormValues = z.infer<typeof routePermissionsFormSchema>;
