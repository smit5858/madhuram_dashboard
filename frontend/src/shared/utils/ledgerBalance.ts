export type LedgerBalanceStatus = "ADVANCE" | "PENDING" | "SETTLED";

export interface LedgerBalance {
    amount: number;
    status: LedgerBalanceStatus;
    label: string;
}

export interface BalanceDisplay {
    text: string;
    emoji: string;
    textColorClass: string;
    bgColorClass: string;
    borderColorClass: string;
}

// Single place the "green = advance, red = pending, neutral = settled" rule lives on the
// frontend — used by the Sells table balance column, the Ledger page header, and the modals so
// the color/label can never drift between screens (mirrors backend customerLedger.service.js#getBalanceStatus).
export const getBalanceDisplay = (balance: LedgerBalance | null | undefined): BalanceDisplay => {
    const amount = Math.abs(balance?.amount || 0);
    const status = balance?.status || "SETTLED";
    const formatted = `₹${amount.toLocaleString("en-IN")}`;

    if (status === "ADVANCE") {
        return {
            text: `${formatted} Advance`,
            emoji: "🟢",
            textColorClass: "text-emerald-600",
            bgColorClass: "bg-emerald-50",
            borderColorClass: "border-emerald-200",
        };
    }
    if (status === "PENDING") {
        return {
            text: `${formatted} Pending`,
            emoji: "🔴",
            textColorClass: "text-rose-600",
            bgColorClass: "bg-rose-50",
            borderColorClass: "border-rose-200",
        };
    }
    return {
        text: "Settled",
        emoji: "⚪",
        textColorClass: "text-slate-500",
        bgColorClass: "bg-slate-50",
        borderColorClass: "border-slate-200",
    };
};
