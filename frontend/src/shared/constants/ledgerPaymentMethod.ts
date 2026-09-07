// Separate from paymentMethod.ts (used by Sale/Payment forms) — the ledger's payment method
// list includes Cheque per the Customer Account spec, which the Sale/Payment enum doesn't have.
// Kept isolated so existing Sale forms are unaffected.
export type LedgerPaymentMethod = "Cash" | "UPI" | "BankTransfer" | "Cheque" | "Card" | "Other";

export const LEDGER_PAYMENT_METHODS: LedgerPaymentMethod[] = ["Cash", "UPI", "BankTransfer", "Cheque", "Card", "Other"];

export const LEDGER_PAYMENT_METHOD_LABEL: Record<LedgerPaymentMethod, string> = {
    Cash: "Cash",
    UPI: "UPI",
    BankTransfer: "Bank Transfer",
    Cheque: "Cheque",
    Card: "Card",
    Other: "Other",
};

export const LEDGER_PAYMENT_METHOD_OPTIONS = LEDGER_PAYMENT_METHODS.map((value) => ({
    value,
    label: LEDGER_PAYMENT_METHOD_LABEL[value],
}));
