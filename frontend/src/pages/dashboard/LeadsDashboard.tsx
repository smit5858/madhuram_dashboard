import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Users, Clock, TrendingUp, CheckCircle2, XCircle, CalendarClock, AlertTriangle } from "lucide-react";
import type { RootState } from "@/store/store";
import { Routing } from "@/routes/routing";
import leadService from "@/services/lead.service";
import KpiCard from "./components/KpiCard";

// Sales Employee dashboard for the Lead Management module — distinct from SalesDashboard.tsx,
// which is the unrelated "Sells" (order-sales) module's dashboard for the "Sells" role. Stats
// come from GET /leads/stats, which is already scoped server-side by canViewAllRecords (an
// Admin/viewAllRecords-granted user sees every lead, a plain Sales Employee sees only their
// own) — no extra filtering needed here.
const LeadsDashboard = () => {
  const { permissions } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();

  const canRead = useMemo(() => permissions?.find((p) => p.routePath.toLowerCase() === "/leads")?.canRead ?? false, [permissions]);

  const { data: statsResp, isLoading } = useQuery({
    queryKey: ["lead-stats"],
    queryFn: () => leadService.getLeadStats(),
    enabled: canRead,
  });

  const stats = statsResp?.data?.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Leads</h1>
        <p className="mt-1 text-xs text-slate-500">A snapshot of your leads and upcoming follow-ups.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Total Leads"
          value={canRead ? String(stats?.total ?? 0) : "—"}
          caption={isLoading ? "Loading..." : "All your leads"}
          icon={Users}
          color="blue"
          onClick={() => navigate(Routing.Leads)}
          disabled={!canRead}
        />
        <KpiCard
          label="Pending"
          value={canRead ? String(stats?.pending ?? 0) : "—"}
          caption="Not yet started"
          icon={Clock}
          color="slate"
          onClick={() => navigate(`${Routing.Leads}?status=PENDING`)}
          disabled={!canRead}
        />
        <KpiCard
          label="In Progress"
          value={canRead ? String(stats?.progress ?? 0) : "—"}
          caption="Actively following up"
          icon={TrendingUp}
          color="indigo"
          onClick={() => navigate(`${Routing.Leads}?status=PROGRESS`)}
          disabled={!canRead}
        />
        <KpiCard
          label="Completed"
          value={canRead ? String(stats?.completed ?? 0) : "—"}
          caption="Converted successfully"
          icon={CheckCircle2}
          color="emerald"
          onClick={() => navigate(`${Routing.Leads}?status=COMPLETED`)}
          disabled={!canRead}
        />
        <KpiCard
          label="Not Interested"
          value={canRead ? String(stats?.notInterested ?? 0) : "—"}
          caption="Declined"
          icon={XCircle}
          color="rose"
          onClick={() => navigate(`${Routing.Leads}?status=NOT_INTERESTED`)}
          disabled={!canRead}
        />
        <KpiCard
          label="Today's Follow-ups"
          value={canRead ? String(stats?.todayFollowUps ?? 0) : "—"}
          caption="Due today"
          icon={CalendarClock}
          color="amber"
          onClick={() => navigate(Routing.Leads)}
          disabled={!canRead}
        />
        <KpiCard
          label="Overdue Follow-ups"
          value={canRead ? String(stats?.overdueFollowUps ?? 0) : "—"}
          caption="Need immediate attention"
          icon={AlertTriangle}
          color="rose"
          onClick={() => navigate(Routing.Leads)}
          disabled={!canRead}
        />
        <KpiCard
          label="Upcoming Follow-ups"
          value={canRead ? String(stats?.upcomingFollowUps ?? 0) : "—"}
          caption="Scheduled ahead"
          icon={CalendarClock}
          color="indigo"
          onClick={() => navigate(Routing.Leads)}
          disabled={!canRead}
        />
      </div>
    </div>
  );
};

export default LeadsDashboard;
