import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import incomeService from "@/services/income.service";
import expenseService from "@/services/expense.service";
import IncomeStatusBadge from "@/pages/account/components/IncomeStatusBadge";
import ExpenseStatusBadge from "@/pages/account/components/ExpenseStatusBadge";
import { Routing } from "@/routes/routing";

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

interface MergedRow {
  key: string;
  type: "INCOME" | "EXPENSE";
  name: string;
  amount: number;
  entryDate: string;
  status: string;
}

// Composes the existing Income/Expense list endpoints (last 5 each) rather than a new
// "recent transactions" backend endpoint — small enough to merge/sort client-side.
const RecentTransactions = ({ canReadIncome, canReadExpense }: { canReadIncome: boolean; canReadExpense: boolean }) => {
  const navigate = useNavigate();

  const { data: incomeResp, isLoading: incomeLoading } = useQuery({
    queryKey: ["dashboard-recent-income"],
    queryFn: ({ signal }) => incomeService.getIncomeEntries({ page: 1, limit: 5 }, { signal }),
    enabled: canReadIncome,
  });

  const { data: expenseResp, isLoading: expenseLoading } = useQuery({
    queryKey: ["dashboard-recent-expense"],
    queryFn: ({ signal }) => expenseService.getExpenseEntries({ page: 1, limit: 5 }, { signal }),
    enabled: canReadExpense,
  });

  const rows = useMemo<MergedRow[]>(() => {
    const income: MergedRow[] = (incomeResp?.data?.data || []).map((entry) => ({
      key: `income-${entry.id}`,
      type: "INCOME",
      name: entry.customerName,
      amount: Number(entry.amount) || 0,
      entryDate: entry.entryDate,
      status: entry.status || "APPROVED",
    }));
    const expense: MergedRow[] = (expenseResp?.data?.data || []).map((entry) => ({
      key: `expense-${entry.id}`,
      type: "EXPENSE",
      name: entry.name,
      amount: Number(entry.amount) || 0,
      entryDate: entry.entryDate,
      status: entry.status || "PENDING",
    }));
    return [...income, ...expense].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 8);
  }, [incomeResp, expenseResp]);

  const isLoading = (canReadIncome && incomeLoading) || (canReadExpense && expenseLoading);
  const hasAccess = canReadIncome || canReadExpense;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Receipt className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-900">Recent Transactions</h2>
      </div>

      {!hasAccess ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No access to this data.</div>
      ) : isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No transactions yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li
              key={row.key}
              onClick={() => navigate(row.type === "INCOME" ? Routing.AccountIncome : Routing.AccountExpense)}
              className="flex cursor-pointer items-center justify-between gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-1.5 -mx-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{row.name}</p>
                <p className="text-[11px] text-slate-400">{row.entryDate}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {row.type === "INCOME" ? (
                  <IncomeStatusBadge status={row.status} />
                ) : (
                  <ExpenseStatusBadge status={row.status} />
                )}
                <span className={`font-mono text-sm font-semibold ${row.type === "INCOME" ? "text-emerald-700" : "text-rose-700"}`}>
                  {row.type === "INCOME" ? "+" : "-"}
                  {formatCurrency(row.amount)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RecentTransactions;
