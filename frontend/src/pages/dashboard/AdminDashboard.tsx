import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, IndianRupee, Receipt, ShoppingBag, Clock, Truck, UserCog } from "lucide-react";
import { Routing } from "@/routes/routing";
import userService from "@/services/user.service";
import sellsService from "@/services/sells.service";
import incomeService from "@/services/income.service";
import expenseService from "@/services/expense.service";
import courierService from "@/services/courier.service";
import KpiCard from "./components/KpiCard";
import TrendChart from "./components/TrendChart";
import { HR_MOCK_TOTALS } from "./mock/hrMockData";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

// Admin dashboard — Admin bypasses every route permission check server-side (authorize.js),
// so unlike the other dashboards there's no per-card permission gating here; every call below
// is always enabled. Reuses the exact same totals endpoints the Accounts/Sales/Courier
// dashboards call (no new backend calls introduced by this file), plus the untouched Accounts
// TrendChart for the Income vs Expense section.
const AdminDashboard = () => {
  const navigate = useNavigate();

  const { data: usersResp, isLoading: usersLoading } = useQuery({
    queryKey: ["dashboard-admin-users"],
    queryFn: () => userService.getUsers({ page: 1, limit: 1 }),
  });

  const { data: sellsResp, isLoading: sellsLoading } = useQuery({
    queryKey: ["dashboard-admin-sells-totals"],
    queryFn: () => sellsService.getSellsTotals(),
  });

  const { data: incomeResp, isLoading: incomeLoading } = useQuery({
    queryKey: ["dashboard-admin-income-totals"],
    queryFn: () => incomeService.getIncomeTotals(),
  });

  const { data: expenseResp, isLoading: expenseLoading } = useQuery({
    queryKey: ["dashboard-admin-expense-totals"],
    queryFn: () => expenseService.getExpenseTotals(),
  });

  const { data: pendingResp } = useQuery({
    queryKey: ["dashboard-admin-pending-orders"],
    queryFn: () => sellsService.getSales({ status: "PENDING", page: 1, limit: 1 }),
  });

  const { data: courierResp, isLoading: courierLoading } = useQuery({
    queryKey: ["dashboard-admin-courier-totals"],
    queryFn: () => courierService.getCourierTotals(),
  });

  const totalUsers = usersResp?.data?.meta?.total ?? 0;
  const sellsTotals = sellsResp?.data?.data;
  const totalIncome = incomeResp?.data?.data?.totalIncome ?? 0;
  const totalExpense = expenseResp?.data?.data?.totalExpense ?? 0;
  const pendingOrders = pendingResp?.data?.meta?.total ?? 0;
  const deliveries = courierResp?.data?.data?.totalDeliveries ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Admin Overview</h1>
        <p className="mt-1 text-xs text-slate-500">A system-wide snapshot across every module.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Users"
          value={String(totalUsers)}
          caption={usersLoading ? "Loading..." : "Registered accounts"}
          icon={UserCog}
          color="blue"
          onClick={() => navigate(Routing.Users)}
        />
        <KpiCard
          label="Total Employees"
          value={String(HR_MOCK_TOTALS.totalEmployees)}
          caption="Mock data — HR module not yet built"
          icon={Users}
          color="slate"
          disabled
        />
        <KpiCard
          label="Total Sales"
          value={formatCurrency(sellsTotals?.totalSellingAmount ?? 0)}
          caption={sellsLoading ? "Loading..." : "All-time selling amount"}
          icon={ShoppingBag}
          color="indigo"
          onClick={() => navigate(Routing.Sells)}
        />
        <KpiCard
          label="Total Orders"
          value={String(sellsTotals?.totalSalesCount ?? 0)}
          caption={sellsLoading ? "Loading..." : "All-time order count"}
          icon={ShoppingBag}
          color="blue"
          onClick={() => navigate(Routing.Sells)}
        />
        <KpiCard
          label="Total Income"
          value={formatCurrency(totalIncome)}
          caption={incomeLoading ? "Loading..." : "Approved income entries"}
          icon={IndianRupee}
          color="emerald"
          onClick={() => navigate(Routing.AccountIncome)}
        />
        <KpiCard
          label="Total Expenses"
          value={formatCurrency(totalExpense)}
          caption={expenseLoading ? "Loading..." : "Approved expense entries"}
          icon={Receipt}
          color="rose"
          onClick={() => navigate(Routing.AccountExpense)}
        />
        <KpiCard
          label="Pending Orders"
          value={String(pendingOrders)}
          caption="Awaiting confirmation/fulfillment"
          icon={Clock}
          color="amber"
          onClick={() => navigate(`${Routing.Sells}?status=PENDING`)}
        />
        <KpiCard
          label="Deliveries"
          value={String(deliveries)}
          caption={courierLoading ? "Loading..." : "All outgoing shipments"}
          icon={Truck}
          color="indigo"
          onClick={() => navigate(`${Routing.Couriers}?direction=OUT`)}
        />
      </div>

      <TrendChart enabled />
    </div>
  );
};

export default AdminDashboard;
