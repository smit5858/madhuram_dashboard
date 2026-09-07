import type { LeadStatus } from "@/services/lead.service";

const STATUS_LABEL: Record<LeadStatus, string> = {
  PENDING: "Pending",
  PROGRESS: "Progress",
  COMPLETED: "Completed",
  INCOMPLETED: "Incompleted",
  NOT_INTERESTED: "Not Interested",
};

const STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  PENDING: "bg-slate-50 text-slate-600 border border-slate-200",
  PROGRESS: "bg-blue-50 text-blue-700 border border-blue-100",
  COMPLETED: "bg-green-50 text-green-700 border border-green-100",
  INCOMPLETED: "bg-amber-50 text-amber-700 border border-amber-100",
  NOT_INTERESTED: "bg-rose-50 text-rose-700 border border-rose-100",
};

const LeadStatusBadge = ({ status }: { status?: LeadStatus | string | null }) => {
  const key = (status && status in STATUS_LABEL ? status : "PENDING") as LeadStatus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE_CLASS[key]}`}>
      {STATUS_LABEL[key]}
    </span>
  );
};

export default LeadStatusBadge;
