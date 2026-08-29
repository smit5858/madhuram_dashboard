import { z } from "zod";

export const courierCompanySchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be under 100 characters"),
  trackingLinkTemplate: z
    .union([
      z
        .string()
        .regex(/^https?:\/\/.+\{trackId\}.*$/, "Must be a valid http(s) URL containing a {trackId} placeholder")
        .max(500, "URL must be under 500 characters"),
      z.literal(""),
    ])
    .optional(),
});

export type CourierCompanyFormValues = z.infer<typeof courierCompanySchema>;
