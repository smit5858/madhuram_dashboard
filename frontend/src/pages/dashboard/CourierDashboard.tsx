import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Package, Clock, CheckCircle2, XCircle, CalendarClock } from "lucide-react";
import type { RootState } from "@/store/store";
import { Routing } from "@/routes/routing";
import courierService from "@/services/courier.service";
import KpiCard from "./components/KpiCard";
import GenericTrendChart from "./components/GenericTrendChart";
import RecentDeliveries from "./components/RecentDeliveries";

// Courier dashboard. Gated on the same /couriers permission Couriers.tsx checks. "Failed
// Deliveries" isn't a concept the Courier model tracks (no FAILED status exists — only the
// pipeline stages, DONE, and CANCELLED), so the closest real bucket (CANCELLED) is shown
// honestly labeled "Cancelled" rather than implying failure-tracking that doesn't exist.
const CourierDashboard = () => {
  const { permissions } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();

  const canRead = useMemo(
    () => permissions?.find((p) => p.routePath.toLowerCase() === "/couriers")?.canRead ?? false,
    [permissions]
  );

  const { data: totalsResp, isLoading } = useQuery({
    queryKey: ["dashboard-courier-totals"],
    queryFn: () => courierService.getCourierTotals(),
    enabled: canRead,
  });

  const totals = totalsResp?.data?.data ?? {
    totalDeliveries: 0,
    pendingDeliveries: 0,
    deliveredCount: 0,
    cancelledCount: 0,
    todayCount: 0,
  };

  // Couriers.tsx doesn't read a status filter from the URL today (only `direction`) — its
  // Pending/Completed split is computed client-side from the fetched list, not a server
  // query param. Every KPI card here lands on the same Outgoing list rather than pretending
  // to pre-filter by a status the destination page can't actually apply.
  const goToCouriers = () => navigate(`${Routing.Couriers}?direction=OUT`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Courier Overview</h1>
        <p className="mt-1 text-xs text-slate-500">A snapshot of outgoing deliveries and their status.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Total Deliveries"
          value={canRead ? String(totals.totalDeliveries) : "—"}
          caption={isLoading ? "Loading..." : "All outgoing shipments"}
          icon={Package}
          color="blue"
          onClick={() => goToCouriers()}
          disabled={!canRead}
        />
        <KpiCard
          label="Pending Deliveries"
          value={canRead ? String(totals.pendingDeliveries) : "—"}
          caption="Not yet delivered"
          icon={Clock}
          color="amber"
          onClick={() => goToCouriers()}
          disabled={!canRead}
        />
        <KpiCard
          label="Delivered"
          value={canRead ? String(totals.deliveredCount) : "—"}
          caption="Marked Done"
          icon={CheckCircle2}
          color="emerald"
          onClick={() => goToCouriers()}
          disabled={!canRead}
        />
        <KpiCard
          label="Cancelled"
          value={canRead ? String(totals.cancelledCount) : "—"}
          caption="Linked order was cancelled"
          icon={XCircle}
          color="rose"
          onClick={() => goToCouriers()}
          disabled={!canRead}
        />
        <KpiCard
          label="Today's Deliveries"
          value={canRead ? String(totals.todayCount) : "—"}
          caption="Dispatched today"
          icon={CalendarClock}
          color="indigo"
          onClick={() => goToCouriers()}
          disabled={!canRead}
        />
      </div>

      <GenericTrendChart
        title="Delivery Trend"
        queryKey="dashboard-courier-trend"
        series={[{ dataKey: "shipments", label: "Shipments Dispatched", color: "#3d6fe0" }]}
        fetchFn={async (range, signal) => {
          const res = await courierService.getCourierDailyTrend(range, { signal });
          return res.data.data;
        }}
        enabled={canRead}
        emptyHint="Shipments are recorded once per day, not intraday."
      />

      <RecentDeliveries enabled={canRead} />
    </div>
  );
};

export default CourierDashboard;
