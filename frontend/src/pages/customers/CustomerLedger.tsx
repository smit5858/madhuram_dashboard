import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Edit2, Trash2 } from "lucide-react";
import { type RootState } from "@/store/store";
import customerLedgerService, { type LedgerEntry } from "@/services/customerLedger.service";
import BalanceBadge from "@/shared/components/BalanceBadge";
import LedgerPaymentModal from "./components/LedgerPaymentModal";
import DeleteLedgerEntryModal from "./components/DeleteLedgerEntryModal";
import ShareStatementMenu from "./components/ShareStatementMenu";
import { formatDisplayDate } from "@/shared/utils/date";

const describeEntry = (entry: LedgerEntry) => {
  if (entry.type === "SALE") return `Product Sale${entry.sale?.invoiceNumber ? ` (${entry.sale.invoiceNumber})` : ""}`;
  if (entry.type === "PAYMENT") return `Payment${entry.paymentMethod ? ` - ${entry.paymentMethod}` : ""}`;
  if (entry.type === "MANUAL_DEBIT") return `Manual Debit${entry.note ? ` - ${entry.note}` : ""}`;
  return `Adjustment${entry.note ? ` - ${entry.note}` : ""}`;
};

const CustomerLedger = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const id = Number(customerId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useSelector((state: RootState) => state.auth);
  const isAdmin = auth.role === "Admin";
  // Only Admin/Account manage the ledger (record/edit payments) — enforced the same way on the
  // backend (customerLedger.controller.js#isLedgerManager). Delete stays Admin-only below.
  const canManage = auth.role === "Admin" || auth.role === "Account";

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<LedgerEntry | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-ledger", id],
    queryFn: () => customerLedgerService.getCustomerLedger(id),
    enabled: !!id,
  });

  const ledger = data?.data?.data;

  const deleteMutation = useMutation({
    mutationFn: (entryId: number) => customerLedgerService.deleteLedgerEntry(id, entryId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Transaction deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["customer-ledger", id] });
      queryClient.invalidateQueries({ queryKey: ["sells"] });
      setDeletingEntry(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || "Failed to delete transaction");
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-75 items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
      </div>
    );
  }

  if (error || !ledger) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <p className="text-sm font-semibold text-rose-500">Failed to load customer account</p>
        <button onClick={() => navigate(-1)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Go back
        </button>
      </div>
    );
  }

  const { customer, balance, entries } = ledger;

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Sells
          </button>
          <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
          <p className="text-xs text-slate-500 font-mono">{customer.phone}</p>
        </div>

        <div className="flex items-center gap-2">
          <BalanceBadge balance={balance} size="lg" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Transaction History</h2>
        <div className="flex items-center gap-2">
          <ShareStatementMenu customerId={id} customerName={customer.name} customerPhone={customer.phone} balance={balance} />
          {canManage && (
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[#3d6fe0] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#3162d2] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Record Payment
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {entries.length === 0 ? (
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
                  <th className="px-4 py-3.5 whitespace-nowrap">Description</th>
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">Amount</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Payment Method</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Reference / Note</th>
                  <th className="px-4 py-3.5 whitespace-nowrap text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry, index) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{formatDisplayDate(entry.transactionDate)}</td>
                    <td className="px-4 py-3.5">{describeEntry(entry)}</td>
                    <td className={`px-4 py-3.5 text-right font-bold whitespace-nowrap ${entry.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {entry.amount < 0 ? "-" : "+"}₹{Math.abs(entry.amount).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{entry.paymentMethod || "—"}</td>
                    <td className="px-4 py-3.5 max-w-xs truncate">{entry.reference || entry.note || "—"}</td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {entry.type !== "SALE" && (
                        <div className="flex justify-end items-center gap-1.5">
                          {/* Manual debits are added/edited only from Account → Debited's own
                              form (see DebitedFormModal) — keeps that flow's field set (no
                              payment method/bank account) separate from this Collect Payment
                              modal's. */}
                          {canManage && entry.type !== "MANUAL_DEBIT" && (
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => setDeletingEntry(entry)}
                              className="rounded p-1 text-rose-500 hover:bg-rose-50 transition"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isPaymentModalOpen && (
        <LedgerPaymentModal customerId={id} customerName={customer.name} onClose={() => setIsPaymentModalOpen(false)} />
      )}

      {editingEntry && (
        <LedgerPaymentModal customerId={id} customerName={customer.name} entry={editingEntry} onClose={() => setEditingEntry(null)} />
      )}

      {deletingEntry && (
        <DeleteLedgerEntryModal
          isSubmitting={deleteMutation.isPending}
          onClose={() => setDeletingEntry(null)}
          onConfirm={() => deleteMutation.mutate(deletingEntry.id)}
        />
      )}
    </div>
  );
};

export default CustomerLedger;
