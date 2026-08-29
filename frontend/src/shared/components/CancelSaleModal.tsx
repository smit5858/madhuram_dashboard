import { useState } from "react";
import { XCircle } from "lucide-react";

interface CancelSaleModalProps {
  onClose: () => void;
  onConfirm: (options: { defective: boolean; reason?: string }) => void;
  isSubmitting?: boolean;
}

/** Confirmation dialog for cancelling a sale — supersedes a plain window.confirm() so the
 *  user can flag the released/returned units as defective (written off) instead of always
 *  restocking them as available. */
const CancelSaleModal = ({ onClose, onConfirm, isSubmitting }: CancelSaleModalProps) => {
  const [defective, setDefective] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-sm font-bold text-slate-900">Cancel Sale</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          This marks the sale as cancelled and releases (or returns, if it was already shipped) its units.
        </p>

        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={defective}
            onChange={(e) => setDefective(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
          />
          <span className="text-xs text-slate-700">
            <span className="font-semibold">Mark as defective — do not restock</span>
            <br />
            The unit(s) are written off instead of going back into available stock.
          </span>
        </label>

        <div className="mt-3">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. customer changed mind / unit damaged in transit"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none resize-none"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Keep Sale
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onConfirm({ defective, reason: reason.trim() || undefined })}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isSubmitting ? "Cancelling..." : "Cancel Sale"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelSaleModal;
