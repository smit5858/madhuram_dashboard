import { z } from "zod";

const customerNameField = z
  .string()
  .min(1, "Customer name is required")
  .max(150, "Customer name must be under 150 characters");

const optionalMobileField = z
  .union([z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"), z.literal("")])
  .optional();

// Formik coerces <input type="number"> to a JS number, so this must accept a stray number
// before checking its pattern — same reasoning as courier.validation.ts's optionalChargeField.
const amountField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1, "Amount is required"))
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) && Number(val) > 0, {
    message: "Please enter a valid amount greater than 0",
  });

export const incomeEntrySchema = z.object({
  customerName: customerNameField,
  customerPhone: optionalMobileField,
  productName: z.string().max(150, "Product name must be under 150 characters").optional(),
  serialNumber: z.string().max(100, "Serial number must be under 100 characters").optional(),
  amount: amountField,
  entryDate: z.string().min(1, "Transaction date is required"),
  paymentMethod: z.string().optional(),
  bankName: z.string().max(150, "Bank name must be under 150 characters").optional(),
  description: z.string().max(1000, "Description must be under 1000 characters").optional(),
});

export type IncomeEntryFormValues = z.infer<typeof incomeEntrySchema>;

export const incomeFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  paymentMethod: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type IncomeFilterValues = z.infer<typeof incomeFilterSchema>;

export const updateBalanceSchema = z.object({
  closingBalance: z
    .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1, "Balance amount is required"))
    .refine((val) => /^-?\d+(\.\d{1,2})?$/.test(val), { message: "Please enter a valid amount" }),
  password: z.string().min(1, "Password is required"),
});

export type UpdateBalanceFormValues = z.infer<typeof updateBalanceSchema>;
