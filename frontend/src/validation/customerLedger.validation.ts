import { z } from "zod";

// Formik coerces <input type="number"> to a JS number, so this must accept a stray number
// before checking its pattern — same reasoning as income.validation.ts's amountField.
const amountField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1, "Amount is required"))
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) && Number(val) > 0, {
    message: "Please enter a valid amount greater than 0",
  });

export const ledgerPaymentSchema = z.object({
  amount: amountField,
  paymentMethod: z.string().min(1, "Payment method is required"),
  bankAccountId: z.union([z.number(), z.literal("")]).optional(),
  transactionDate: z.string().min(1, "Payment date is required"),
  reference: z.string().max(150, "Reference must be under 150 characters").optional(),
  note: z.string().max(500, "Note must be under 500 characters").optional(),
});

export type LedgerPaymentFormValues = z.infer<typeof ledgerPaymentSchema>;

// Account → Debited "Add/Edit Debited Record" (a manual debit, not tied to a sale). customerId
// is always populated by the time this validates — picked via the autocomplete when adding, or
// carried over from the debtor row being edited — so it's simply required to be a real id.
export const manualDebitSchema = z.object({
  customerId: z.number().positive("Please select a customer"),
  amount: amountField,
  transactionDate: z.string().min(1, "Date is required"),
  reference: z.string().max(150, "Reference must be under 150 characters").optional(),
  note: z.string().max(500, "Note must be under 500 characters").optional(),
});

export type ManualDebitFormValues = z.infer<typeof manualDebitSchema>;
