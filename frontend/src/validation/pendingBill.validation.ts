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
  billNumber: z.string().max(100, "Bill number must be under 100 characters").optional(),
});

export type PendingBillEntryFormValues = z.infer<typeof pendingBillEntrySchema>;

export const pendingBillFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  status: z.string().optional(),
  billType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type PendingBillFilterValues = z.infer<typeof pendingBillFilterSchema>;

export const PENDING_BILL_PAYMENT_METHODS = ["Cash", "UPI", "Card", "BankTransfer", "Cheque", "Other"] as const;

// A payment can be the full remaining balance at once, or a custom/partial amount — the amount
// field itself carries no distinction, "full" is just whatever equals the remaining balance right
// now (see the quick-fill buttons in PendingBillPaymentFormModal).
export const pendingBillPaymentEntrySchema = z.object({
  amount: amountField,
  paymentMethod: z.enum(PENDING_BILL_PAYMENT_METHODS, { error: "Payment method is required" }),
  paymentDate: z.string().min(1, "Payment date is required"),
  transactionRef: z.string().max(100, "Transaction reference must be under 100 characters").optional(),
  notes: z.string().max(1000, "Notes must be under 1000 characters").optional(),
});

export type PendingBillPaymentEntryFormValues = z.infer<typeof pendingBillPaymentEntrySchema>;

export const pendingBillPaymentRejectSchema = z.object({
  rejectionReason: z.string().min(3, "Please provide a reason for rejecting this payment").max(1000, "Reason is too long"),
});

export type PendingBillPaymentRejectFormValues = z.infer<typeof pendingBillPaymentRejectSchema>;

// Create-a-bill form only — lets the team optionally record the first payment (full or custom
// amount) in the same step as adding the bill, instead of always requiring a separate "Record
// Payment" action afterward. All payment fields stay optional at the schema level; superRefine
// only requires them once `recordPayment` is checked.
export const pendingBillEntryWithPaymentSchema = pendingBillEntrySchema
  .extend({
    recordPayment: z.boolean().optional(),
    paymentAmount: z.string().optional(),
    paymentMethod: z.string().optional(),
    paymentDate: z.string().optional(),
    paymentTransactionRef: z.string().max(100, "Transaction reference must be under 100 characters").optional(),
    paymentNotes: z.string().max(1000, "Notes must be under 1000 characters").optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.recordPayment) return;

    if (!values.paymentAmount || !/^\d+(\.\d{1,2})?$/.test(values.paymentAmount) || Number(values.paymentAmount) <= 0) {
      ctx.addIssue({ code: "custom", path: ["paymentAmount"], message: "Please enter a valid amount greater than 0" });
    } else if (Number(values.paymentAmount) > Number(values.amount)) {
      ctx.addIssue({ code: "custom", path: ["paymentAmount"], message: "Cannot exceed the bill amount" });
    }
    if (!values.paymentMethod) {
      ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Payment method is required" });
    }
    if (!values.paymentDate) {
      ctx.addIssue({ code: "custom", path: ["paymentDate"], message: "Payment date is required" });
    }
  });

export type PendingBillEntryWithPaymentFormValues = z.infer<typeof pendingBillEntryWithPaymentSchema>;
