export type PaymentMethod = "Cash" | "UPI" | "Card" | "COD" | "BankTransfer" | "Other";

export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "UPI", "Card", "COD", "BankTransfer", "Other"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
    Cash: "Cash",
    UPI: "UPI",
    Card: "Card",
    COD: "COD",
    BankTransfer: "Bank Transfer",
    Other: "Other",
};

export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({
    value,
    label: PAYMENT_METHOD_LABEL[value],
}));
