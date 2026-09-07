import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import type { SellsTotalsData } from "@/services/sells.service";
import { Routing } from "@/routes/routing";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

// Reuses the same sells totals already fetched for the Pending Payments KPI — no new endpoint.
const PaymentStatusSummary = ({ enabled, totals }: { enabled: boolean; totals: SellsTotalsData }) => {
  const navigate = useNavigate();
  const collectedPct = totals.totalSellingAmount > 0 ? Math.round((totals.totalCollectedAmount / totals.totalSellingAmount) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-900">Payment Status</h2>
      </div>

      {!enabled ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No access to this data.</div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-amber-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${collectedPct}%` }} />
          </div>
          <p className="text-xs text-slate-500">{collectedPct}% of total sales collected</p>

          <button
            type="button"
            onClick={() => navigate(Routing.Sells)}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50"
          >
            <span className="text-xs text-slate-500">Collected</span>
            <span className="font-mono text-sm font-semibold text-emerald-700">{formatCurrency(totals.totalCollectedAmount)}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(Routing.Sells)}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50"
          >
            <span className="text-xs text-slate-500">Pending</span>
            <span className="font-mono text-sm font-semibold text-amber-700">{formatCurrency(totals.totalPendingAmount)}</span>
          </button>
          <div className="flex items-center justify-between px-2 py-1.5 -mx-2 border-t border-slate-100 pt-2.5">
            <span className="text-xs text-slate-500">Total Orders</span>
            <span className="font-mono text-sm font-semibold text-slate-800">{totals.totalSalesCount}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentStatusSummary;
