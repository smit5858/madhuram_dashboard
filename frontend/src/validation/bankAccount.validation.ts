import { z } from "zod";

export const bankAccountSchema = z.object({
  bankName: z.string().min(1, "Bank name is required").max(150, "Bank name must be under 150 characters"),
  accountHolderName: z.string().max(150, "Account holder name must be under 150 characters").optional(),
  accountNumber: z
    .union([z.string().regex(/^[A-Za-z0-9]+$/, "Account number must contain only letters and digits"), z.literal("")])
    .refine((val) => !val || val.length <= 30, "Account number must be under 30 characters")
    .optional(),
  ifscCode: z
    .union([z.string().regex(/^[A-Za-z0-9]{4,15}$/, "Enter a valid IFSC code"), z.literal("")])
    .optional(),
  branchName: z.string().max(150, "Branch name must be under 150 characters").optional(),
  upiId: z.string().max(100, "UPI ID must be under 100 characters").optional(),
  notes: z.string().max(1000, "Notes must be under 1000 characters").optional(),
});

export type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

export const bankAccountFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  isActive: z.string().optional(),
});

export type BankAccountFilterValues = z.infer<typeof bankAccountFilterSchema>;
