import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import incomeService from "@/services/income.service";
import { computeRange, RANGE_OPTIONS, type RangeKey } from "../utils/dateRange";
import { formatDisplayDate } from "@/shared/utils/date";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

const formatAxisDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  const dateLabel = label ? formatDisplayDate(label) : label;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-slate-700">{dateLabel}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-1.5" style={{ color: entry.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.dataKey === "income" ? "Income" : "Expense"}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};

// Income vs Expense trend, sourced from the same DailyAccountBalance rows the Income page's
// daily-balance table uses (see income.controller.js#getDailyBalances, extended to accept a
// startDate/endDate range for this chart).
const TrendChart = ({ enabled }: { enabled: boolean }) => {
  const [range, setRange] = useState<RangeKey>("1M");
  const { startDate, endDate } = useMemo(() => computeRange(range), [range]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-daily-balances", startDate, endDate],
    queryFn: ({ signal }) => incomeService.getDailyBalances({ startDate, endDate }, { signal }),
    enabled,
  });

  const chartData = useMemo(
    () =>
      (data?.data?.data || []).map((row) => ({
        date: row.date,
        income: Number(row.totalIn) || 0,
        expense: Number(row.totalOut) || 0,
      })),
    [data]
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-900">Income vs Expense Trend</h2>
        </div>
        <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1">
          {RANGE_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                range === key ? "bg-white text-[#3d6fe0] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64">
        {!enabled ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No access to this data.</div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">Failed to load trend data.</div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
            <p className="text-sm font-medium">No activity in this range.</p>
            {range === "1D" && <p className="text-xs">Balances are recorded once per day, not intraday.</p>}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrency(v)}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#incomeGradient)"
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#expenseGradient)"
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Expense
        </span>
      </div>
    </div>
  );
};

export default TrendChart;
