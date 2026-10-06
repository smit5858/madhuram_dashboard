import { Package, XCircle } from "lucide-react";
import type { LedgerEntry } from "@/services/customerLedger.service";
import { formatDisplayDate } from "@/shared/utils/date";

const formatCurrency = (amount: number | string | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount) || 0);

interface SaleItemsModalProps {
  entry: LedgerEntry;
  onClose: () => void;
}

// Opened from a SALE row's invoice number in CustomerLedger — lists the products on that sale.
const SaleItemsModal = ({ entry, onClose }: SaleItemsModalProps) => {
  const items = entry.sale?.items ?? [];

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Package className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 font-mono">{entry.sale?.invoiceNumber}</h3>
              <div className="mt-1 text-xs text-slate-500">
                {formatDisplayDate(entry.transactionDate)} · {formatCurrency(Math.abs(entry.amount))}
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

        <div className="overflow-y-auto p-6">
          {items.length === 0 ? (
            <p className="text-center text-sm text-slate-500">No products found for this sale.</p>
          ) : (
            <table className="w-full border-collapse text-left text-xs text-slate-600">
              <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 pr-3">Product</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 pl-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className={`py-2.5 pr-3 font-medium ${item.fulfillmentStatus === "CANCELLED" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {item.Product?.name || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">{item.quantity}</td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">{formatCurrency(item.sellingPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleItemsModal;
