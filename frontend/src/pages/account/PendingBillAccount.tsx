import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Ban, CreditCard, Edit2, Eye, Plus, Trash2 } from "lucide-react";
import type { RootState } from "@/store/store";
import pendingBillService, { type PendingBillData, type PendingBillAccountTransaction } from "@/services/pendingBill.service";
import { initSocket } from "@/services/socket.service";
import { formatDisplayDate } from "@/shared/utils/date";
import PendingBillStatusBadge from "./components/PendingBillStatusBadge";
import PendingBillViewModal from "./components/PendingBillViewModal";
import PendingBillFormModal from "./components/PendingBillFormModal";
import PendingBillPaymentFormModal from "./components/PendingBillPaymentFormModal";
import PendingBillAccountPaymentModal from "./components/PendingBillAccountPaymentModal";

interface ApiErrorLike {
  response?: { status?: number; data?: { message?: string } };
  message?: string;
}

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

const EXPENSE_STATUS_CLASS = {
  PENDING: "bg-amber-50 text-amber-700 border border-amber-100",
  APPROVED: "bg-green-50 text-green-700 border border-green-100",
  REJECTED: "bg-rose-50 text-rose-700 border border-rose-100",
} as const;

const StatCard = ({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`mt-1 text-lg font-bold ${tone}`}>{value}</div>
  </div>
);

// Account → Pending Bill → one Seller/Dealer/Company's account: the money we owe them. Same layout
// as Debited's Customer Account page — totals and outstanding up top, the bills that make it up,
// then one chronological transaction history (bills add to what's owed, payments reduce it) with
// the running outstanding balance after every row.
const PendingBillAccount = () => {
  const { accountKey = "" } = useParams<{ accountKey: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { permissions, role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    if (!permissions) return fallback;
    return (
      permissions.find(
        (p) => p.routePath.toLowerCase() === "/account/pending-bill" || p.routeName.toLowerCase() === "pending bill"
      ) ?? fallback
    );
  }, [permissions]);

  useEffect(() => {
    const socket = initSocket("account", userId);
    if (isAdmin) initSocket("admin", userId);
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
    };
    const events = ["pending_bill_created", "pending_bill_approved", "pending_bill_payment_submitted", "pending_bill_payment_verified", "pending_bill_payment_rejected"];
    events.forEach((event) => socket.on(event, refresh));
    return () => {
      events.forEach((event) => socket.off(event, refresh));
    };
  }, [queryClient, userId, isAdmin]);

  const [showPayModal, setShowPayModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewBillId, setViewBillId] = useState<number | null>(null);
  const [editBill, setEditBill] = useState<PendingBillData | null>(null);
  const [payBill, setPayBill] = useState<PendingBillData | null>(null);
  const [deleteBill, setDeleteBill] = useState<PendingBillData | null>(null);
  const [cancelBill, setCancelBill] = useState<PendingBillData | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pending-bill", "account", accountKey],
    queryFn: () => pendingBillService.getPendingBillAccount(accountKey),
    enabled: pagePermission.canRead && !!accountKey,
    retry: false,
  });
  const detail = data?.data?.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-bill"] });
    queryClient.invalidateQueries({ queryKey: ["expense"] });
    queryClient.invalidateQueries({ queryKey: ["expense-totals"] });
    queryClient.invalidateQueries({ queryKey: ["daily-balances"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => pendingBillService.deletePendingBill(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Pending bill deleted successfully");
      invalidate();
      setDeleteBill(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete pending bill");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => pendingBillService.cancelPendingBill(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Pending bill cancelled");
      invalidate();
      setCancelBill(null);
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to cancel pending bill");
    },
  });

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          You do not have permission to view pending bills.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-75 items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <p className="text-sm font-semibold text-rose-500">
          {(error as ApiErrorLike)?.response?.data?.message || "Failed to load pending bill account"}
        </p>
        <button onClick={() => navigate("/account/pending-bill")} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Pending Bill
        </button>
      </div>
    );
  }

  const { account, bills, transactions } = detail;
  const settled = account.outstanding <= 0;
  const describeMethod = (t: PendingBillAccountTransaction) =>
    t.type === "PAYMENT" && t.paymentMethod
      ? `${t.paymentMethod}${t.bankAccount ? ` — ${t.bankAccount.bankName}` : ""}`
      : "—";

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={() => navigate("/account/pending-bill")}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Pending Bill
          </button>
          <h1 className="text-xl font-bold text-slate-900">{account.name} Account</h1>
          <p className="text-xs text-slate-500">Seller / Dealer / Company · {account.billCount} bill{account.billCount === 1 ? "" : "s"}</p>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-lg font-bold ${
            settled ? "border-slate-200 bg-slate-50 text-slate-500" : "border-rose-200 bg-rose-50 text-rose-600"
          }`}
        >
          <span>{settled ? "⚪" : "🔴"}</span>
          {settled ? "Settled — ₹0" : `${formatCurrency(account.outstanding)} Outstanding`}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total Bill Amount" value={formatCurrency(account.totalBilled)} />
        <StatCard label="Total Paid" value={formatCurrency(account.totalPaid)} tone="text-emerald-600" />
        <StatCard label="Current Outstanding" value={formatCurrency(account.outstanding)} tone={settled ? "text-slate-500" : "text-rose-600"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Bills / Purchases</h2>
        <div className="flex items-center gap-2">
          {pagePermission.canCreate && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" /> Add Bill
            </button>
          )}
          {pagePermission.canCreate && !settled && (
            <button
              type="button"
              onClick={() => setShowPayModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#3d6fe0] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#3162d2] active:scale-[0.98]"
            >
              <CreditCard className="h-4 w-4" /> Pay / Add Payment
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 whitespace-nowrap">Date</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Product / Bill For</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Bill No</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Amount</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Paid</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Remaining</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Notes</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.map((bill) => (
                <tr key={bill.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3.5 whitespace-nowrap">{formatDisplayDate(bill.billDate)}</td>
                  <td className="px-4 py-3.5 font-medium text-slate-800">{bill.name}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">{bill.billNumber || "—"}</td>
                  <td className="px-4 py-3.5 text-right font-semibold whitespace-nowrap">{formatCurrency(bill.amount)}</td>
                  <td className="px-4 py-3.5 text-right text-emerald-600 whitespace-nowrap">{formatCurrency(bill.paidAmount)}</td>
                  <td className="px-4 py-3.5 text-right text-rose-600 whitespace-nowrap">{formatCurrency(bill.remainingAmount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <PendingBillStatusBadge status={bill.status} />
                  </td>
                  <td className="px-4 py-3.5 max-w-xs truncate">{bill.description || "—"}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => bill.id && setViewBillId(bill.id)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {pagePermission.canUpdate && !["APPROVED", "CANCELLED"].includes(bill.status || "") && (
                        <button
                          type="button"
                          onClick={() => setEditBill(bill)}
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                      {pagePermission.canCreate && !["APPROVED", "CANCELLED", "REJECTED"].includes(bill.status || "") && (
                        <button
                          type="button"
                          onClick={() => setPayBill(bill)}
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                          title="Pay this bill"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleteBill(bill)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin && Number(bill.paidAmount || 0) === 0 && bill.status !== "CANCELLED" && (
                        <button
                          type="button"
                          onClick={() => setCancelBill(bill)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                          title="Cancel"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Transaction History</h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {transactions.length === 0 ? (
          <div className="flex min-h-50 flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-medium text-slate-500">No transactions recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Sr No</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Type</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Description</th>
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">Amount</th>
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">Balance</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Payment Method</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Reference / Note</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Recorded By</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Expense</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((t, index) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{formatDisplayDate(t.date)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-semibold">{t.type === "BILL" ? "Bill" : "Payment"}</td>
                    <td className="px-4 py-3.5">
                      {t.description}
                      {t.paymentStatus && t.paymentStatus !== "Verified" && (
                        <div className="text-[10px] text-amber-600">
                          {t.paymentStatus}
                          {t.rejectionReason ? `: ${t.rejectionReason}` : " — not counted until verified"}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3.5 text-right font-bold whitespace-nowrap ${t.type === "BILL" ? "text-rose-600" : "text-emerald-600"}`}>
                      {t.type === "BILL" ? "+" : "−"}
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold whitespace-nowrap text-slate-800">{formatCurrency(t.balance)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{describeMethod(t)}</td>
                    <td className="px-4 py-3.5 max-w-xs truncate">{t.reference || t.note || "—"}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{t.recordedBy?.name || "—"}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {t.expense ? (
                        <span
                          title={`Created by ${t.expense.creator?.name || "—"}`}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${EXPENSE_STATUS_CLASS[t.expense.status]}`}
                        >
                          {t.expense.status === "PENDING" ? "Pending Approval" : t.expense.status === "APPROVED" ? "Approved" : "Rejected"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm">
        <span className="text-slate-500">Current Outstanding:&nbsp;</span>
        <span className={`font-bold ${settled ? "text-slate-500" : "text-rose-600"}`}>{formatCurrency(account.outstanding)}</span>
      </div>

      {viewBillId !== null && <PendingBillViewModal billId={viewBillId} onClose={() => setViewBillId(null)} />}
      {(showAddModal || editBill) && (
        <PendingBillFormModal
          bill={editBill}
          defaultDealerName={account.name}
          onClose={() => {
            setShowAddModal(false);
            setEditBill(null);
          }}
        />
      )}
      {payBill && <PendingBillPaymentFormModal bill={payBill} onClose={() => setPayBill(null)} />}
      {showPayModal && (
        <PendingBillAccountPaymentModal
          accountKey={account.accountKey}
          accountName={account.name}
          outstanding={account.outstanding}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {deleteBill && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteBill(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Delete Pending Bill</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to delete "{deleteBill.name}"? This action cannot be undone. Any payments made directly against it,
              and the Expense entries they created, are removed too.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteBill(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteBill.id && deleteMutation.mutate(deleteBill.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelBill && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setCancelBill(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Cancel Pending Bill</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to cancel "{cancelBill.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelBill(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelBill.id && cancelMutation.mutate(cancelBill.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? "Cancelling..." : "Cancel Bill"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingBillAccount;
