import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Truck } from "lucide-react";
import courierService from "@/services/courier.service";
import { STATUS_LABEL, STATUS_BADGE_CLASS, type CourierStatus } from "@/shared/constants/courierStatus";
import { Routing } from "@/routes/routing";
import { formatDisplayDate } from "@/shared/utils/date";

const RecentDeliveries = ({ enabled }: { enabled: boolean }) => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-recent-deliveries"],
    queryFn: ({ signal }) => courierService.getCouriers({ direction: "OUT", page: 1, limit: 6 }, { signal }),
    enabled,
  });

  const rows = data?.data?.data || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Truck className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-900">Recent Delivery Activity</h2>
      </div>

      {!enabled ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No access to this data.</div>
      ) : isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No deliveries yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((courier) => {
            const status = (courier.status || "PENDING") as CourierStatus;
            return (
              <li
                key={courier.id}
                onClick={() => navigate(Routing.Couriers)}
                className="flex cursor-pointer items-center justify-between gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-1.5 -mx-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{courier.customerName || courier.name}</p>
                  <p className="text-[11px] text-slate-400">{courier.entryDate ? formatDisplayDate(courier.entryDate) : "—"}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RecentDeliveries;
