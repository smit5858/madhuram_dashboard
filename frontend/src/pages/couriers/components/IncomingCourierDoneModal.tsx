import { CheckCircle2, XCircle } from "lucide-react";
import type { CourierData } from "../../../services/courier.service";

interface IncomingCourierDoneModalProps {
  courier: CourierData;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

/** Confirmation dialog for the Incoming Courier "Done" workflow — explains upfront that
 *  confirming will create an Outgoing Courier record and an Accounts entry, since that side
 *  effect isn't obvious from the button alone. */
const IncomingCourierDoneModal = ({ courier, onClose, onConfirm, isSubmitting }: IncomingCourierDoneModalProps) => {
  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Mark Incoming Courier as Done
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
          This will complete the incoming courier entry for{" "}
          <span className="font-semibold text-slate-800">
            {courier.customerName || courier.name || "this entry"}
          </span>
          {courier.productName ? ` — ${courier.productName}` : ""}.
        </p>

        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
          Confirming will:
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>Create a matching entry in <span className="font-semibold">Outgoing Courier</span></li>
            <li>Create a transaction entry in <span className="font-semibold">Accounts</span></li>
            <li>Mark this entry as <span className="font-semibold">Done</span></li>
          </ul>
        </div>

        <p className="mt-3 text-[11px] text-slate-400">This action cannot be undone or repeated once confirmed.</p>

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
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSubmitting ? "Processing..." : "Confirm & Complete"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCourierDoneModal;
