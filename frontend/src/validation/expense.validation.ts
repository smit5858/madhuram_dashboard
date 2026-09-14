import { z } from "zod";

const nameField = z
  .string()
  .min(1, "Name is required")
  .max(150, "Name must be under 150 characters");

const optionalMobileField = z
  .union([z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"), z.literal("")])
  .optional();

// Formik coerces <input type="number"> to a JS number, so this must accept a stray number
// before checking its pattern — same reasoning as courier.validation.ts's optionalChargeField.
const amountField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1, "Amount is required"))
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) && Number(val) > 0, {
    message: "Please enter a valid amount greater than 0",
  });

// BankTransfer/UPI need a configured bank account named ("Select Bank") — matches
// order.service.js#needsBankSplit's same two methods.
const needsBankAccount = (paymentMethod?: string) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";

export const expenseEntrySchema = z
  .object({
    name: nameField,
    mobile: optionalMobileField,
    product: z.string().max(150, "Product name must be under 150 characters").optional(),
    amount: amountField,
    entryDate: z.string().min(1, "Date is required"),
    paymentMethod: z.string().optional(),
    bankAccountId: z.string().optional(),
    description: z.string().max(1000, "Description must be under 1000 characters").optional(),
  })
  .superRefine((values, ctx) => {
    if (needsBankAccount(values.paymentMethod) && !values.bankAccountId) {
      ctx.addIssue({ code: "custom", path: ["bankAccountId"], message: "Select a bank account for this payment method" });
    }
  });

export type ExpenseEntryFormValues = z.infer<typeof expenseEntrySchema>;

export const expenseFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  status: z.string().optional(),
});

export type ExpenseFilterValues = z.infer<typeof expenseFilterSchema>;
