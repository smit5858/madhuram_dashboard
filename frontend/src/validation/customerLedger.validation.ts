import { z } from "zod";

// Formik coerces <input type="number"> to a JS number, so this must accept a stray number
// before checking its pattern — same reasoning as income.validation.ts's amountField.
const amountField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().min(1, "Amount is required"))
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) && Number(val) > 0, {
    message: "Please enter a valid amount greater than 0",
  });

// One row of the Bank Account split — same {bankAccountId, amount} shape as the Add/Edit Sales
// form's bank payment rows (Sells.tsx's `bankPayments` state), reused here so a BankTransfer/UPI
// ledger payment can name which bank(s) it went into.
const bankPaymentRowSchema = z.object({
  bankAccountId: z.union([z.number(), z.literal("")]),
  amount: z.string(),
});

export const ledgerPaymentSchema = z
  .object({
    amount: amountField,
    paymentMethod: z.string().min(1, "Payment method is required"),
    bankPayments: z.array(bankPaymentRowSchema).default([]),
    transactionDate: z.string().min(1, "Payment date is required"),
    reference: z.string().max(150, "Reference must be under 150 characters").optional(),
    note: z.string().max(500, "Note must be under 500 characters").optional(),
  })
  // BankTransfer/UPI payments are routed through one or more bank accounts, so unlike the Sale
  // form's optional bank split (which may fall short of the collected amount, the remainder
  // assumed cash), the rows here must name every bank account and add up to EXACTLY the total
  // payment amount — there's no other payment method covering the rest.
  .superRefine((values, ctx) => {
    const needsBank = values.paymentMethod === "BankTransfer" || values.paymentMethod === "UPI";
    if (!needsBank) return;

    const rows = values.bankPayments;
    if (rows.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankPayments"], message: "Select at least one bank account" });
      return;
    }

    for (const row of rows) {
      if (!row.bankAccountId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankPayments"], message: "Select a bank account for every row" });
        return;
      }
      if (!row.amount || !/^\d+(\.\d{1,2})?$/.test(row.amount) || Number(row.amount) <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankPayments"], message: "Enter a valid amount for every bank account" });
        return;
      }
    }

    const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    const target = Number(values.amount) || 0;
    if (Math.abs(total - target) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankPayments"],
        message: `Bank account amounts (₹${total.toFixed(2)}) must add up to the total payment amount (₹${target.toFixed(2)})`,
      });
    }
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
