import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import sellsService from "@/services/sells.service";
import { Routing } from "@/routes/routing";

const formatCurrency = (amount: number | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);

const STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border border-amber-100",
  CONFIRMED: "bg-blue-50 text-blue-700 border border-blue-100",
  FULFILLED: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  CANCELLED: "bg-rose-50 text-rose-700 border border-rose-100",
};

const RecentOrders = ({ enabled }: { enabled: boolean }) => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-recent-orders"],
    queryFn: ({ signal }) => sellsService.getSales({ page: 1, limit: 6 }, { signal }),
    enabled,
  });

  const rows = data?.data?.data || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-900">Recent Orders</h2>
      </div>

      {!enabled ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No access to this data.</div>
      ) : isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No orders yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((sale) => (
            <li
              key={sale.id}
              onClick={() => navigate(Routing.Sells)}
              className="flex cursor-pointer items-center justify-between gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-1.5 -mx-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{sale.customerName}</p>
                <p className="text-[11px] text-slate-400">{sale.invoiceNumber || "—"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[sale.status || "PENDING"]}`}>
                  {sale.status || "PENDING"}
                </span>
                <span className="font-mono text-sm font-semibold text-slate-800">{formatCurrency(sale.sellingAmount)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RecentOrders;
