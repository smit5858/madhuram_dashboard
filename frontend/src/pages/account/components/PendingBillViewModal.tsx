import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  IndianRupee,
  Package,
  Receipt,
  ShieldCheck,
  Store,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import type { RootState } from "@/store/store";
import pendingBillService, { type PendingBillPaymentData, type PendingBillPaymentStatus } from "@/services/pendingBill.service";
import { formatDateTime, formatDisplayDate } from "@/shared/utils/date";
import PendingBillStatusBadge from "./PendingBillStatusBadge";
import PendingBillPaymentVerifyModal from "./PendingBillPaymentVerifyModal";

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

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

const PAYMENT_STATUS_CLASS: Record<PendingBillPaymentStatus, string> = {
  "Pending Verification": "bg-blue-50 text-blue-700 border border-blue-100",
  Verified: "bg-green-50 text-green-700 border border-green-100",
  Rejected: "bg-rose-50 text-rose-700 border border-rose-100",
};

const PaymentStatusBadge = ({ status }: { status?: PendingBillPaymentStatus }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${PAYMENT_STATUS_CLASS[status || "Pending Verification"]}`}>
    {status || "Pending Verification"}
  </span>
);

interface PendingBillViewModalProps {
  billId: number;
  onClose: () => void;
}

const PendingBillViewModal = ({ billId, onClose }: PendingBillViewModalProps) => {
  const queryClient = useQueryClient();
  const { role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";
  const [verifyPayment, setVerifyPayment] = useState<PendingBillPaymentData | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pending-bill", "detail", billId],
    queryFn: () => pendingBillService.getPendingBillById(billId),
  });
  const bill = data?.data?.data;

  const deleteMutation = useMutation({
    mutationFn: (paymentId: number) => pendingBillService.deletePayment(billId, paymentId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Payment deleted");
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete payment");
    },
  });

  if (isLoading || isError || !bill) {
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
                {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load bill"}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const payments = bill.payments || [];
  const isRestock = bill.billType === "RESTOCK";

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isRestock ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600"}`}>
              {isRestock ? <Package className="h-5.5 w-5.5" /> : <Receipt className="h-5.5 w-5.5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900">{bill.name}</h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>{formatCurrency(bill.amount)}</span>
                <PendingBillStatusBadge status={bill.status} />
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
            <Section title="Details">
              <DetailItem icon={FileText} label="Name" value={bill.name} />
              <DetailItem icon={Store} label="Dealer Name" value={bill.dealerName} />
              <DetailItem icon={Calendar} label="Date" value={formatDisplayDate(bill.billDate)} />
              <DetailItem icon={FileText} label="Bill / Invoice Number" value={bill.billNumber} />
              {isRestock && <DetailItem icon={Package} label="Quantity" value={bill.quantity} />}
              {isRestock && (
                <DetailItem icon={IndianRupee} label="Purchase Price / Unit" value={bill.purchasePrice != null ? formatCurrency(bill.purchasePrice) : undefined} />
              )}
            </Section>

            <Section title="Payment Summary">
              <DetailItem icon={IndianRupee} label="Total Amount" value={formatCurrency(bill.amount)} />
              <DetailItem icon={IndianRupee} label="Paid Amount" value={<span className="text-emerald-600">{formatCurrency(bill.paidAmount)}</span>} />
              <DetailItem icon={IndianRupee} label="Remaining Amount" value={<span className="text-rose-600">{formatCurrency(bill.remainingAmount)}</span>} />
              <DetailItem icon={Receipt} label="Status" value={<PendingBillStatusBadge status={bill.status} />} />
            </Section>

            {bill.description && (
              <Section title="Description">
                <div className="sm:col-span-2 flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-200">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm font-medium text-slate-800 whitespace-pre-line">{bill.description}</p>
                </div>
              </Section>
            )}

            <Section title="Record Info">
              <DetailItem icon={User} label="Added By" value={bill.creator?.name} />
              <DetailItem icon={Calendar} label="Created" value={formatDateTime(bill.createdAt)} />
              {bill.status === "APPROVED" && (
                <>
                  <DetailItem icon={ShieldCheck} label="Approved By" value={bill.approver?.name} />
                  <DetailItem icon={Calendar} label="Approved At" value={formatDateTime(bill.approvedAt || undefined)} />
                </>
              )}
            </Section>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Payment History</div>
              {payments.length === 0 ? (
                <p className="text-xs text-slate-400">No payments recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Amount</th>
                        <th className="px-2 py-2">Method</th>
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Reference</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Submitted By</th>
                        <th className="px-2 py-2">Verified By</th>
                        <th className="px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-2 py-2 font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                          <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{p.paymentMethod}</td>
                          <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{formatDisplayDate(p.paymentDate)}</td>
                          <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{p.transactionRef || "—"}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <PaymentStatusBadge status={p.status} />
                            {p.status === "Rejected" && p.rejectionReason && (
                              <div className="mt-1 max-w-40 text-[10px] text-rose-500 whitespace-normal">{p.rejectionReason}</div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{p.creator?.name || "—"}</td>
                          <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
                            {p.verifier?.name ? (
                              <>
                                {p.verifier.name}
                                <div className="text-[10px] text-slate-400">{formatDateTime(p.verifiedAt) || ""}</div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {isAdmin && p.status === "Pending Verification" && (
                                <button
                                  type="button"
                                  onClick={() => setVerifyPayment(p)}
                                  className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                                  title="Verify / Reject"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {p.status === "Pending Verification" && (isAdmin || p.createdBy === userId) && (
                                <button
                                  type="button"
                                  disabled={deleteMutation.isPending}
                                  onClick={() => p.id && deleteMutation.mutate(p.id)}
                                  className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>

      {verifyPayment && <PendingBillPaymentVerifyModal bill={bill} payment={verifyPayment} onClose={() => setVerifyPayment(null)} />}
    </div>
  );
};

export default PendingBillViewModal;
