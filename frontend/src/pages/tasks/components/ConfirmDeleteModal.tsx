import { XCircle } from "lucide-react";

interface ConfirmDeleteModalProps {
  title: string;
  /** Name of the thing being deleted, shown in bold. */
  itemName: string;
  /** Extra consequence text, e.g. "All of its tasks will be deleted too." */
  warning?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Same confirmation-dialog style as DeleteCourierModal, generic for Task/Project deletes. */
const ConfirmDeleteModal = ({ title, itemName, warning, isSubmitting, onClose, onConfirm }: ConfirmDeleteModalProps) => (
  <div
    className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
    onClick={(e) => {
      e.stopPropagation();
      if (e.target === e.currentTarget && !isSubmitting) onClose();
    }}
  >
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
          <XCircle className="h-5 w-5" />
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Are you sure you want to delete <span className="font-semibold text-slate-700">{itemName}</span>? {warning} This cannot be undone.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onConfirm}
          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {isSubmitting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
);

export default ConfirmDeleteModal;
