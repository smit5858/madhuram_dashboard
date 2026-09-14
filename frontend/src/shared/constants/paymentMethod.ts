// "COD" (Collect On Delivery) was retired — "Cash" now unambiguously means paid in person at the
// office/store, and COD-style collection is no longer a distinct payment method in this system.
export type PaymentMethod = "Cash" | "UPI" | "Card" | "BankTransfer" | "Other";

export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "UPI", "Card", "BankTransfer", "Other"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
    Cash: "Cash",
    UPI: "UPI",
    Card: "Card",
    BankTransfer: "Bank Transfer",
    Other: "Other",
};

export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({
    value,
    label: PAYMENT_METHOD_LABEL[value],
}));
