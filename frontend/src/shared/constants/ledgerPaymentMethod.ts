// Separate from paymentMethod.ts (used by Sale/Payment forms) so the ledger's own list can
// diverge without touching existing Sale forms. "Cheque" was retired (no direct equivalent among
// the remaining methods) — see backend server.js#ensureChequePaymentMethodBackfilled.
export type LedgerPaymentMethod = "Cash" | "UPI" | "BankTransfer" | "Card" | "Other";

export const LEDGER_PAYMENT_METHODS: LedgerPaymentMethod[] = ["Cash", "UPI", "BankTransfer", "Card", "Other"];

export const LEDGER_PAYMENT_METHOD_LABEL: Record<LedgerPaymentMethod, string> = {
    Cash: "Cash",
    UPI: "UPI",
    BankTransfer: "Bank Transfer",
    Card: "Card",
    Other: "Other",
};

export const LEDGER_PAYMENT_METHOD_OPTIONS = LEDGER_PAYMENT_METHODS.map((value) => ({
    value,
    label: LEDGER_PAYMENT_METHOD_LABEL[value],
}));
