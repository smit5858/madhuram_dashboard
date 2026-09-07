import type { ExpenseStatus } from "@/services/expense.service";

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_BADGE_CLASS: Record<ExpenseStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border border-amber-100",
  APPROVED: "bg-green-50 text-green-700 border border-green-100",
  REJECTED: "bg-rose-50 text-rose-700 border border-rose-100",
};

const ExpenseStatusBadge = ({ status }: { status?: ExpenseStatus | string | null }) => {
  const key = (status && status in STATUS_LABEL ? status : "PENDING") as ExpenseStatus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[key]}`}>
      {STATUS_LABEL[key]}
    </span>
  );
};

export default ExpenseStatusBadge;
