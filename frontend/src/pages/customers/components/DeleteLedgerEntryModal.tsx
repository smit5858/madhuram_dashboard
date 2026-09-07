import { XCircle } from "lucide-react";

interface DeleteLedgerEntryModalProps {
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

/** Confirmation dialog for permanently deleting a ledger transaction — only ever rendered for
 *  Admins (the Ledger page gates the Delete action on auth.role, and the backend hard-enforces it
 *  too — see customerLedger.controller.js#deleteEntry). This is a hard delete: the row and its
 *  linked pending/approved Income entry are both destroyed and cannot be recovered. Same visual
 *  pattern as CancelSaleModal.tsx. */
const DeleteLedgerEntryModal = ({ onClose, onConfirm, isSubmitting }: DeleteLedgerEntryModalProps) => {
  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-sm font-bold text-slate-900">Delete Transaction?</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Are you sure you want to delete this transaction? This permanently removes it and recalculates the customer's
          account balance. This action cannot be undone.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isSubmitting ? "Deleting..." : "Delete Transaction"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteLedgerEntryModal;
