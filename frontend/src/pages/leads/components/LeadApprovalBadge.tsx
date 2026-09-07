import type { LeadApprovalStatus } from "@/services/lead.service";

const APPROVAL_LABEL: Record<LeadApprovalStatus, string> = {
  PENDING: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const APPROVAL_BADGE_CLASS: Record<LeadApprovalStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
};

const LeadApprovalBadge = ({ approvalStatus }: { approvalStatus?: LeadApprovalStatus | string | null }) => {
  const key = (approvalStatus && approvalStatus in APPROVAL_LABEL ? approvalStatus : "PENDING") as LeadApprovalStatus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${APPROVAL_BADGE_CLASS[key]}`}>
      {APPROVAL_LABEL[key]}
    </span>
  );
};

export default LeadApprovalBadge;
