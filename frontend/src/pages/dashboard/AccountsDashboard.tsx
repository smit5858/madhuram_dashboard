import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { IndianRupee, Receipt, TrendingUp, Clock, Users, Landmark } from "lucide-react";
import type { RootState } from "@/store/store";
import { Routing } from "@/routes/routing";
import incomeService from "@/services/income.service";
import expenseService from "@/services/expense.service";
import sellsService, { type SellsTotalsData } from "@/services/sells.service";
import customerLedgerService from "@/services/customerLedger.service";
import KpiCard from "./components/KpiCard";
import TrendChart from "./components/TrendChart";
import RecentTransactions from "./components/RecentTransactions";
import PaymentStatusSummary from "./components/PaymentStatusSummary";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

const EMPTY_TOTALS: SellsTotalsData = {
  totalSellingAmount: 0,
  totalCollectedAmount: 0,
  totalPendingAmount: 0,
  totalSalesCount: 0,
};

// Accounts (+ Admin) dashboard. Each KPI section is gated on the same per-route "canRead"
// permission its own module page checks — same pattern as Debited.tsx/Expense.tsx/Income.tsx —
// so an Account user missing a Route Setting grant sees that card/section degrade gracefully
// instead of erroring.
const AccountsDashboard = () => {
  const { permissions } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();

  const canRead = useMemo(() => {
    const find = (path: string) => permissions?.find((p) => p.routePath.toLowerCase() === path)?.canRead ?? false;
    return {
      income: find("/account/income"),
      expense: find("/account/expense"),
      sells: find("/sells"),
      debited: find("/account/debited"),
    };
  }, [permissions]);

  const { data: incomeTotalsResp, isLoading: incomeLoading } = useQuery({
    queryKey: ["dashboard-income-totals"],
    queryFn: ({ signal }) => incomeService.getIncomeTotals(undefined, { signal }),
    enabled: canRead.income,
  });

  const { data: expenseTotalsResp, isLoading: expenseLoading } = useQuery({
    queryKey: ["dashboard-expense-totals"],
    queryFn: ({ signal }) => expenseService.getExpenseTotals({ signal }),
    enabled: canRead.expense,
  });

  const { data: sellsTotalsResp, isLoading: sellsLoading } = useQuery({
    queryKey: ["dashboard-sells-totals"],
    queryFn: () => sellsService.getSellsTotals(),
    enabled: canRead.sells,
  });

  const { data: receivableResp, isLoading: receivableLoading } = useQuery({
    queryKey: ["dashboard-receivable-totals"],
    queryFn: ({ signal }) => customerLedgerService.getReceivableTotals({ signal }),
    enabled: canRead.debited,
  });

  const totalIncome = incomeTotalsResp?.data?.data?.totalIncome ?? 0;
  const totalExpense = expenseTotalsResp?.data?.data?.totalExpense ?? 0;
  const sellsTotals = sellsTotalsResp?.data?.data ?? EMPTY_TOTALS;
  const totalReceivable = receivableResp?.data?.data?.totalReceivable ?? 0;

  const netProfitAvailable = canRead.income && canRead.expense;
  const netProfit = totalIncome - totalExpense;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Accounts Overview</h1>
        <p className="mt-1 text-xs text-slate-500">A snapshot of income, expenses, and outstanding balances.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Total Income"
          value={canRead.income ? formatCurrency(totalIncome) : "—"}
          caption={incomeLoading ? "Loading..." : "Approved income entries"}
          icon={IndianRupee}
          color="emerald"
          onClick={() => navigate(Routing.AccountIncome)}
          disabled={!canRead.income}
        />
        <KpiCard
          label="Total Expense"
          value={canRead.expense ? formatCurrency(totalExpense) : "—"}
          caption={expenseLoading ? "Loading..." : "Approved expense entries"}
          icon={Receipt}
          color="rose"
          onClick={() => navigate(`${Routing.AccountExpense}?status=APPROVED`)}
          disabled={!canRead.expense}
        />
        <KpiCard
          label="Net Profit"
          value={netProfitAvailable ? formatCurrency(netProfit) : "—"}
          caption="Total Income − Total Expense"
          icon={TrendingUp}
          color={netProfit >= 0 ? "blue" : "amber"}
          disabled
        />
        <KpiCard
          label="Pending Payments"
          value={canRead.sells ? formatCurrency(sellsTotals.totalPendingAmount) : "—"}
          caption={sellsLoading ? "Loading..." : "Outstanding on sales"}
          icon={Clock}
          color="amber"
          onClick={() => navigate(Routing.Sells)}
          disabled={!canRead.sells}
        />
        <KpiCard
          label="Receivable"
          value={canRead.debited ? formatCurrency(totalReceivable) : "—"}
          caption={receivableLoading ? "Loading..." : "Owed by customers"}
          icon={Users}
          color="indigo"
          onClick={() => navigate(`${Routing.AccountDebited}?status=PENDING`)}
          disabled={!canRead.debited}
        />
        <KpiCard
          label="Payable"
          value="₹0"
          caption="Not tracked yet"
          icon={Landmark}
          color="slate"
          disabled
        />
      </div>

      <TrendChart enabled={canRead.income} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentTransactions canReadIncome={canRead.income} canReadExpense={canRead.expense} />
        <PaymentStatusSummary enabled={canRead.sells} totals={sellsTotals} />
      </div>
    </div>
  );
};

export default AccountsDashboard;
