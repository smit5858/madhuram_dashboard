import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle } from "lucide-react";
import pendingBillService, { type PendingBillData, type PendingBillPaymentData } from "@/services/pendingBill.service";
import { formatDateTime, formatDisplayDate } from "@/shared/utils/date";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface PendingBillPaymentVerifyModalProps {
  bill: PendingBillData;
  payment: PendingBillPaymentData;
  onClose: () => void;
}

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

const PendingBillPaymentVerifyModal = ({ bill, payment, onClose }: PendingBillPaymentVerifyModalProps) => {
  const queryClient = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
    queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
  };

  const verifyMutation = useMutation({
    mutationFn: () => pendingBillService.verifyPayment(bill.id!, payment.id!),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Payment verified successfully");
      invalidate();
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to verify payment");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => pendingBillService.rejectPayment(bill.id!, payment.id!, rejectionReason.trim()),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Payment rejected");
      invalidate();
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to reject payment");
    },
  });

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">Verify Payment</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Bill</span>
            <span className="font-medium text-slate-800">{bill.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Amount</span>
            <span className="font-bold text-slate-900">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Method</span>
            <span className="font-medium text-slate-800">{payment.paymentMethod}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Payment Date</span>
            <span className="font-medium text-slate-800">{formatDisplayDate(payment.paymentDate)}</span>
          </div>
          {payment.transactionRef && (
            <div className="flex justify-between">
              <span className="text-slate-500">Reference</span>
              <span className="font-medium text-slate-800">{payment.transactionRef}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Submitted By</span>
            <span className="font-medium text-slate-800">{payment.creator?.name || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Submitted At</span>
            <span className="font-medium text-slate-800">{formatDateTime(payment.createdAt) || "—"}</span>
          </div>
          {payment.notes && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-line">{payment.notes}</div>
          )}

          {showReject && (
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-600">Rejection reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Why is this payment being rejected?"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {!showReject ? (
            <>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
              <button
                type="button"
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {verifyMutation.isPending ? "Verifying..." : "Verify"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={rejectMutation.isPending || rejectionReason.trim().length < 3}
              onClick={() => rejectMutation.mutate()}
              className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingBillPaymentVerifyModal;
