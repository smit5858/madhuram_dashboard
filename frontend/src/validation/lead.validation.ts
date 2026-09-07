import { z } from "zod";

const customerNameField = z
  .string()
  .min(1, "Customer name is required")
  .max(150, "Customer name must be under 150 characters");

const companyNameField = z.string().max(150, "Company name must be under 150 characters").optional();
const addressField = z.string().max(500, "Address must be under 500 characters").optional();
const cityField = z.string().max(100, "City must be under 100 characters").optional();

// Digits only, exactly 10 — matching FormikPhoneInput's on-keystroke sanitization (strips
// non-digits, caps at 10), same convention as courier.validation.ts's optionalMobileField.
const phoneField = z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits");

const platformIdField = z.union([z.string(), z.number()]).refine((val) => val !== "" && val !== undefined && val !== null, {
  message: "Platform is required",
});

const productIdField = z.union([z.string(), z.number()]).refine((val) => val !== "" && val !== undefined && val !== null, {
  message: "Product is required",
});

// Formik coerces <input type="number"> to a JS number, so this must accept a stray number
// before checking its pattern — same reasoning as pendingBill.validation.ts's amountField.
const quantityField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1, "Quantity is required"))
  .refine((val) => /^\d+$/.test(val) && Number(val) > 0, { message: "Quantity must be a whole number greater than 0" });

export const LEAD_STATUSES = ["PENDING", "PROGRESS", "COMPLETED", "INCOMPLETED", "NOT_INTERESTED"] as const;

const statusField = z.enum(LEAD_STATUSES, { error: "Status is required" });

const followUpNotesField = z.string().max(1000, "Notes must be under 1000 characters").optional();

export const leadEntrySchema = z
  .object({
    platformId: platformIdField,
    customerName: customerNameField,
    companyName: companyNameField,
    phone: phoneField,
    address: addressField,
    city: cityField,
    productId: productIdField,
    quantity: quantityField,
    status: statusField,

    followUp1Date: z.string().min(1, "Follow-up 1 date is required"),
    followUp1Notes: followUpNotesField,

    followUp2Date: z.string().optional(),
    followUp2Notes: followUpNotesField,

    followUp3Date: z.string().optional(),
    followUp3Notes: followUpNotesField,
  })
  // A follow-up's notes only make sense once its date is set — don't let the user fill in notes
  // for a follow-up they never scheduled.
  .superRefine((values, ctx) => {
    if (!values.followUp2Date && values.followUp2Notes) {
      ctx.addIssue({ code: "custom", path: ["followUp2Date"], message: "Set a date before adding notes for Follow-up 2" });
    }
    if (!values.followUp3Date && values.followUp3Notes) {
      ctx.addIssue({ code: "custom", path: ["followUp3Date"], message: "Set a date before adding notes for Follow-up 3" });
    }
  });

export type LeadEntryFormValues = z.infer<typeof leadEntrySchema>;

export const leadFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  status: z.string().optional(),
  approvalStatus: z.string().optional(),
  platformId: z.string().optional(),
  productId: z.string().optional(),
  city: z.string().optional(),
  salesEmployeeId: z.string().optional(),
  followUpStartDate: z.string().optional(),
  followUpEndDate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type LeadFilterValues = z.infer<typeof leadFilterSchema>;

export const leadRejectSchema = z.object({
  rejectionReason: z.string().min(3, "Please provide a reason for rejecting this lead").max(500, "Reason is too long"),
});

export type LeadRejectFormValues = z.infer<typeof leadRejectSchema>;
