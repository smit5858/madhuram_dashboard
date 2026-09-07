import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { IndianRupee, CalendarClock, TrendingUp, Clock, CheckCircle2, Users } from "lucide-react";
import type { RootState } from "@/store/store";
import { Routing } from "@/routes/routing";
import sellsService from "@/services/sells.service";
import customerService from "@/services/customer.service";
import KpiCard from "./components/KpiCard";
import GenericTrendChart from "./components/GenericTrendChart";
import RecentOrders from "./components/RecentOrders";
import { getTodayISODate } from "@/shared/utils/date";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

const firstOfMonthISODate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

// Sales (+ Admin, via reuse) dashboard. Gated on the same /sells and /customers permissions
// their own module pages check — same pattern as AccountsDashboard.tsx.
const SalesDashboard = () => {
  const { permissions } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  const today = getTodayISODate();

  const canRead = useMemo(() => {
    const find = (path: string) => permissions?.find((p) => p.routePath.toLowerCase() === path)?.canRead ?? false;
    return { sells: find("/sells"), customers: find("/customers") };
  }, [permissions]);

  const { data: totalsResp, isLoading: totalsLoading } = useQuery({
    queryKey: ["dashboard-sales-totals"],
    queryFn: () => sellsService.getSellsTotals(),
    enabled: canRead.sells,
  });

  const { data: todayResp, isLoading: todayLoading } = useQuery({
    queryKey: ["dashboard-sales-today", today],
    queryFn: () => sellsService.getSellsTotals({ startDate: today, endDate: today }),
    enabled: canRead.sells,
  });

  const { data: monthResp, isLoading: monthLoading } = useQuery({
    queryKey: ["dashboard-sales-month", today],
    queryFn: () => sellsService.getSellsTotals({ startDate: firstOfMonthISODate(), endDate: today }),
    enabled: canRead.sells,
  });

  const { data: pendingResp } = useQuery({
    queryKey: ["dashboard-sales-pending-count"],
    queryFn: () => sellsService.getSales({ status: "PENDING", page: 1, limit: 1 }),
    enabled: canRead.sells,
  });

  const { data: completedResp } = useQuery({
    queryKey: ["dashboard-sales-completed-count"],
    queryFn: () => sellsService.getSales({ status: "FULFILLED", page: 1, limit: 1 }),
    enabled: canRead.sells,
  });

  const { data: customersResp, isLoading: customersLoading } = useQuery({
    queryKey: ["dashboard-customers-count"],
    queryFn: () => customerService.getCustomers({ page: 1, limit: 1 }),
    enabled: canRead.customers,
  });

  const totalSales = totalsResp?.data?.data?.totalSellingAmount ?? 0;
  const todaySales = todayResp?.data?.data?.totalSellingAmount ?? 0;
  const monthRevenue = monthResp?.data?.data?.totalSellingAmount ?? 0;
  const pendingOrders = pendingResp?.data?.meta?.total ?? 0;
  const completedOrders = completedResp?.data?.meta?.total ?? 0;
  const customersCount = customersResp?.data?.meta?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Sales Overview</h1>
        <p className="mt-1 text-xs text-slate-500">A snapshot of sales performance and order status.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Total Sales"
          value={canRead.sells ? formatCurrency(totalSales) : "—"}
          caption={totalsLoading ? "Loading..." : "All-time selling amount"}
          icon={IndianRupee}
          color="blue"
          onClick={() => navigate(Routing.Sells)}
          disabled={!canRead.sells}
        />
        <KpiCard
          label="Today's Sales"
          value={canRead.sells ? formatCurrency(todaySales) : "—"}
          caption={todayLoading ? "Loading..." : "Selling amount today"}
          icon={CalendarClock}
          color="emerald"
          onClick={() => navigate(Routing.Sells)}
          disabled={!canRead.sells}
        />
        <KpiCard
          label="Monthly Revenue"
          value={canRead.sells ? formatCurrency(monthRevenue) : "—"}
          caption={monthLoading ? "Loading..." : "This calendar month"}
          icon={TrendingUp}
          color="indigo"
          onClick={() => navigate(Routing.Sells)}
          disabled={!canRead.sells}
        />
        <KpiCard
          label="Pending Orders"
          value={canRead.sells ? String(pendingOrders) : "—"}
          caption="Awaiting confirmation/fulfillment"
          icon={Clock}
          color="amber"
          onClick={() => navigate(`${Routing.Sells}?status=PENDING`)}
          disabled={!canRead.sells}
        />
        <KpiCard
          label="Completed Orders"
          value={canRead.sells ? String(completedOrders) : "—"}
          caption="Fully fulfilled"
          icon={CheckCircle2}
          color="emerald"
          onClick={() => navigate(`${Routing.Sells}?status=FULFILLED`)}
          disabled={!canRead.sells}
        />
        <KpiCard
          label="Customers"
          value={canRead.customers ? String(customersCount) : "—"}
          caption={customersLoading ? "Loading..." : "Total customers"}
          icon={Users}
          color="rose"
          onClick={() => navigate(Routing.Customers)}
          disabled={!canRead.customers}
        />
      </div>

      <GenericTrendChart
        title="Revenue Trend"
        queryKey="dashboard-sales-trend"
        series={[{ dataKey: "totalSelling", label: "Revenue", color: "#3d6fe0" }]}
        valueFormatter={(v) => formatCurrency(v)}
        fetchFn={async (range, signal) => {
          const res = await sellsService.getSalesDailyTrend(range, { signal });
          return res.data.data;
        }}
        enabled={canRead.sells}
      />

      <RecentOrders enabled={canRead.sells} />
    </div>
  );
};

export default SalesDashboard;
