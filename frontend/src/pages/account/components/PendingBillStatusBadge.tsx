import type { PendingBillStatus } from "@/services/pendingBill.service";

const STATUS_LABEL: Record<PendingBillStatus, string> = {
  PENDING: "Pending",
  PARTIALLY_PAID: "Partially Paid",
  PENDING_VERIFICATION: "Pending Verification",
  APPROVED: "Paid",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const STATUS_BADGE_CLASS: Record<PendingBillStatus, string> = {
  PENDING: "bg-slate-50 text-slate-600 border border-slate-200",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700 border border-amber-100",
  PENDING_VERIFICATION: "bg-blue-50 text-blue-700 border border-blue-100",
  APPROVED: "bg-green-50 text-green-700 border border-green-100",
  REJECTED: "bg-rose-50 text-rose-700 border border-rose-100",
  CANCELLED: "bg-slate-100 text-slate-500 border border-slate-200",
};

const PendingBillStatusBadge = ({ status }: { status?: PendingBillStatus | string | null }) => {
  const key = (status && status in STATUS_LABEL ? status : "PENDING") as PendingBillStatus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE_CLASS[key]}`}>
      {STATUS_LABEL[key]}
    </span>
  );
};

export default PendingBillStatusBadge;
