import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import type { RootState } from "@/store/store";
import leadService from "@/services/lead.service";
import { formatDateTime, getTodayISODate } from "@/shared/utils/date";
import LeadStatusBadge from "./LeadStatusBadge";
import LeadApprovalBadge from "./LeadApprovalBadge";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const DetailItem = ({
  icon: Icon,
  label,
  value,
  full = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: ReactNode;
  full?: boolean;
}) => (
  <div className={`flex items-start gap-2.5 ${full ? "sm:col-span-2" : ""}`}>
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
      <Icon className="h-3.5 w-3.5" />
    </div>
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800 wrap-break-word">
        {value === undefined || value === null || value === "" ? (
          <span className="font-normal text-slate-300">Not provided</span>
        ) : (
          value
        )}
      </div>
    </div>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
    <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
    <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
  </div>
);

const followUpState = (date?: string | null, status?: string | null) => {
  if (!date) return null;
  if (status === "DONE") return { label: "Completed", className: "bg-green-50 text-green-700 border border-green-100" };
  const today = getTodayISODate();
  if (date < today) return { label: "Overdue", className: "bg-rose-50 text-rose-700 border border-rose-100" };
  if (date === today) return { label: "Due Today", className: "bg-amber-50 text-amber-700 border border-amber-100" };
  return { label: "Upcoming", className: "bg-blue-50 text-blue-700 border border-blue-100" };
};

const FollowUpRow = ({
  index,
  date,
  time,
  notes,
  status,
}: {
  index: number;
  date?: string | null;
  time?: string | null;
  notes?: string | null;
  status?: string | null;
}) => {
  if (!date) {
    return (
      <div className="flex items-center gap-3 py-2 text-xs text-slate-300">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400">
          {index}
        </div>
        Not scheduled
      </div>
    );
  }

  const state = followUpState(date, status);

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">
            {date}
            {time ? ` · ${time}` : ""}
          </span>
          {state && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.className}`}>
              {state.label}
            </span>
          )}
        </div>
        {notes && <p className="mt-1 text-xs text-slate-500 whitespace-pre-line">{notes}</p>}
      </div>
    </div>
  );
};

interface LeadViewModalProps {
  leadId: number;
  onClose: () => void;
}

const LeadViewModal = ({ leadId, onClose }: LeadViewModalProps) => {
  const queryClient = useQueryClient();
  const { role } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leads", "detail", leadId],
    queryFn: () => leadService.getLeadById(leadId),
  });
  const lead = data?.data?.data;

  const approveMutation = useMutation({
    mutationFn: () => leadService.approveLead(leadId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Lead approved");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to approve lead");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      const reason = window.prompt("Reason for rejecting this lead:");
      if (!reason || !reason.trim()) throw new Error("A rejection reason is required");
      return leadService.rejectLead(leadId, reason.trim());
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || "Lead rejected");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to reject lead");
    },
  });

  if (isLoading || isError || !lead) {
    return (
      <div
        className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-slate-200 flex items-center justify-center">
          {isLoading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-rose-500">
              <AlertTriangle className="h-8 w-8" />
              <p className="text-sm font-semibold">
                {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load lead"}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <User className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900">{lead.customerName}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Lead #{lead.id}</span>
                <LeadStatusBadge status={lead.status} />
                {isAdmin && lead.approvalStatus !== "APPROVED" && <LeadApprovalBadge approvalStatus={lead.approvalStatus} />}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-4">
            <Section title="Customer Information">
              <DetailItem icon={User} label="Customer Name" value={lead.customerName} />
              <DetailItem icon={Building2} label="Company Name" value={lead.companyName} />
              <DetailItem icon={Phone} label="Phone" value={lead.phone} />
              <DetailItem icon={MapPin} label="City" value={lead.city} />
              <DetailItem icon={MapPin} label="Address" value={lead.address} full />
            </Section>

            <Section title="Lead Information">
              <DetailItem icon={Package} label="Platform" value={lead.platform?.name} />
              <DetailItem icon={Package} label="Product" value={lead.product?.name} />
              <DetailItem icon={Package} label="Quantity" value={lead.quantity} />
              <DetailItem icon={User} label="Sales Employee" value={lead.salesEmployee?.name} />
              <DetailItem icon={Calendar} label="Created" value={formatDateTime(lead.createdAt)} />
              <DetailItem icon={Calendar} label="Last Updated" value={formatDateTime(lead.updatedAt)} />
            </Section>

            {lead.approvalStatus !== "PENDING" && (
              <Section title="Approval">
                <DetailItem icon={ShieldCheck} label={lead.approvalStatus === "APPROVED" ? "Approved By" : "Reviewed By"} value={lead.approver?.name} />
                <DetailItem icon={Calendar} label="Decision Date" value={formatDateTime(lead.approvedAt || undefined)} />
                {lead.approvalStatus === "REJECTED" && (
                  <DetailItem icon={XCircle} label="Rejection Reason" value={lead.rejectionReason} full />
                )}
              </Section>
            )}

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Clock className="h-3 w-3" /> Follow-up Timeline
              </div>
              <div className="divide-y divide-slate-100">
                <FollowUpRow index={1} date={lead.followUp1Date} time={lead.followUp1Time} notes={lead.followUp1Notes} status={lead.followUp1Status} />
                <FollowUpRow index={2} date={lead.followUp2Date} time={lead.followUp2Time} notes={lead.followUp2Notes} status={lead.followUp2Status} />
                <FollowUpRow index={3} date={lead.followUp3Date} time={lead.followUp3Time} notes={lead.followUp3Notes} status={lead.followUp3Status} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
          {isAdmin && lead.approvalStatus === "PENDING" && (
            <>
              <button
                type="button"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadViewModal;
