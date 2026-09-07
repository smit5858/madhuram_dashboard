import { Users, UserCheck, UserX, FileClock, ClipboardCheck, UserPlus, Info } from "lucide-react";
import KpiCard from "./components/KpiCard";
import GenericTrendChart from "./components/GenericTrendChart";
import { HR_MOCK_TOTALS, HR_MOCK_ACTIVITY, getHrAttendanceTrend } from "./mock/hrMockData";

// HR dashboard — no Employee/Attendance/Leave/Payroll model exists anywhere in this codebase
// yet, so every number here is static sample data from mock/hrMockData.ts (also the source
// for Admin's "Total Employees" card, so the two never disagree). Every KPI card is rendered
// disabled — there's no real HR module page to send a click to yet.
const HRDashboard = () => {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">HR Overview</h1>
        <p className="mt-1 text-xs text-slate-500">A snapshot of workforce attendance and leave activity.</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
        <Info className="h-4 w-4 shrink-0" />
        Showing sample data — the HR module hasn't been built yet.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Total Employees" value={String(HR_MOCK_TOTALS.totalEmployees)} caption="Mock data" icon={Users} color="blue" disabled />
        <KpiCard label="Present Today" value={String(HR_MOCK_TOTALS.presentToday)} caption="Mock data" icon={UserCheck} color="emerald" disabled />
        <KpiCard label="Absent Today" value={String(HR_MOCK_TOTALS.absentToday)} caption="Mock data" icon={UserX} color="rose" disabled />
        <KpiCard label="Leave Requests" value={String(HR_MOCK_TOTALS.leaveRequests)} caption="Mock data" icon={FileClock} color="amber" disabled />
        <KpiCard label="Pending Approvals" value={String(HR_MOCK_TOTALS.pendingApprovals)} caption="Mock data" icon={ClipboardCheck} color="indigo" disabled />
        <KpiCard label="New Employees" value={String(HR_MOCK_TOTALS.newEmployees)} caption="Mock data, this month" icon={UserPlus} color="slate" disabled />
      </div>

      <GenericTrendChart
        title="Attendance Trend"
        queryKey="dashboard-hr-attendance-mock"
        series={[
          { dataKey: "present", label: "Present", color: "#10b981" },
          { dataKey: "absent", label: "Absent", color: "#ef4444" },
        ]}
        fetchFn={async () => getHrAttendanceTrend()}
        enabled
        emptyHint="Sample data covers the last 14 days only."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-900">Recent HR Activity</h2>
        <ul className="divide-y divide-slate-100">
          {HR_MOCK_ACTIVITY.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{row.name}</p>
                <p className="text-[11px] text-slate-400">{row.activity}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{row.date}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default HRDashboard;
