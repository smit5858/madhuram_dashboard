import { AlertTriangle, XCircle } from "lucide-react";

export interface StockShortageItem {
  productName: string;
  requested: number;
  available: number;
}

interface StockShortageModalProps {
  shortages: StockShortageItem[];
  onClose: () => void;
  /** Caps each short line's quantity down to what's currently in stock (drops it entirely if 0). */
  onAvailableOnly: () => void;
  /** Submits exactly as entered — the shortfall is backordered, same as the existing default. */
  onAllProducts: () => void;
  isSubmitting?: boolean;
}

/** Shown when one or more line items on the create-sale form exceed current stock — lets the
 *  user choose between trimming the order to what's actually in stock, or submitting as entered
 *  (backordering the shortfall, which the backend already supports). */
const StockShortageModal = ({ shortages, onClose, onAvailableOnly, onAllProducts, isSubmitting }: StockShortageModalProps) => {
  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Stock Shortage
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600">
          {shortages.length === 1 ? "This product doesn't" : "These products don't"} have enough stock for the requested quantity:
        </p>

        <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
          <ul className="space-y-1">
            {shortages.map((s, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="font-semibold text-slate-800">{s.productName}</span>
                <span>Requested {s.requested} · In stock {s.available}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Create with only the available stock (quantities trimmed down, and any fully out-of-stock item removed), or create
          with all products as entered (the shortfall becomes backordered)?
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onAvailableOnly}
            className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3162d2] disabled:opacity-50"
          >
            {isSubmitting ? "Processing..." : "Create with Available Stock Only"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onAllProducts}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Create with All Products (Backorder Shortfall)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel — Let Me Edit
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockShortageModal;
