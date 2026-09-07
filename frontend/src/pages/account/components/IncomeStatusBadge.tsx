import type { IncomeStatus } from "@/services/income.service";

const STATUS_LABEL: Record<IncomeStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
};

const STATUS_BADGE_CLASS: Record<IncomeStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border border-amber-100",
  APPROVED: "bg-green-50 text-green-700 border border-green-100",
};

const IncomeStatusBadge = ({ status }: { status?: IncomeStatus | string | null }) => {
  const key = (status && status in STATUS_LABEL ? status : "APPROVED") as IncomeStatus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[key]}`}>
      {STATUS_LABEL[key]}
    </span>
  );
};

export default IncomeStatusBadge;
