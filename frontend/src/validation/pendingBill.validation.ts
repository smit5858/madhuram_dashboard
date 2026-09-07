import { z } from "zod";

const nameField = z
  .string()
  .min(1, "Name is required")
  .max(150, "Name must be under 150 characters");

const dealerNameField = z
  .string()
  .max(150, "Dealer name must be under 150 characters")
  .optional();

// Formik coerces <input type="number"> to a JS number, so this must accept a stray number
// before checking its pattern — same reasoning as expense.validation.ts's amountField.
const amountField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1, "Amount is required"))
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) && Number(val) > 0, {
    message: "Please enter a valid amount greater than 0",
  });

export const pendingBillEntrySchema = z.object({
  name: nameField,
  dealerName: dealerNameField,
  amount: amountField,
  billDate: z.string().min(1, "Date is required"),
  description: z.string().max(1000, "Description must be under 1000 characters").optional(),
});

export type PendingBillEntryFormValues = z.infer<typeof pendingBillEntrySchema>;

export const pendingBillFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type PendingBillFilterValues = z.infer<typeof pendingBillFilterSchema>;
