import { getBalanceDisplay, type LedgerBalance } from "@/shared/utils/ledgerBalance";

interface BalanceBadgeProps {
  balance: LedgerBalance | null | undefined;
  size?: "sm" | "lg";
}

/** Advance/Pending/Settled indicator — green for advance, red for pending, neutral when settled.
 *  Reused across the Sells table, the Customer Ledger page header, and the payment modals so the
 *  color/label logic lives in exactly one place (see shared/utils/ledgerBalance.ts). */
const BalanceBadge = ({ balance, size = "sm" }: BalanceBadgeProps) => {
  const display = getBalanceDisplay(balance);

  if (size === "lg") {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-lg font-bold ${display.bgColorClass} ${display.borderColorClass} ${display.textColorClass}`}
      >
        <span>{display.emoji}</span>
        {display.text}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${display.bgColorClass} ${display.borderColorClass} ${display.textColorClass}`}
    >
      <span>{display.emoji}</span>
      {display.text}
    </span>
  );
};

export default BalanceBadge;
