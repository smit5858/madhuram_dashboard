import { useState } from "react";
import { XCircle } from "lucide-react";
import type { CourierData } from "../../../services/courier.service";
import { STATUS_LABEL, STATUS_HELPER, type CourierStatus } from "../../../shared/constants/courierStatus";

// Waiting for Stock is system-managed (see updateCourier's WAITING_FOR_STOCK guard) — it's
// shown here only when the courier is currently in that state, and is never selectable.
const SELECTABLE_STATUSES: CourierStatus[] = ["PENDING", "IN_PROGRESS", "OUT_FOR_DELIVERY", "DONE"];

interface CourierStatusModalProps {
  courier: CourierData;
  onClose: () => void;
  onConfirm: (status: CourierStatus) => void;
  isSubmitting?: boolean;
}

/** Focused modal for moving a courier through Pending -> In Progress -> Out for Delivery -> Done. */
const CourierStatusModal = ({ courier, onClose, onConfirm, isSubmitting }: CourierStatusModalProps) => {
  const currentStatus = (courier.status as CourierStatus) || "PENDING";
  const isWaiting = currentStatus === "WAITING_FOR_STOCK";
  const [status, setStatus] = useState<CourierStatus>(isWaiting ? "PENDING" : currentStatus);

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="text-sm font-bold text-slate-900">Update Status</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          {courier.customerName || courier.name || "This courier record"}
          {courier.productName ? ` — ${courier.productName}` : ""}
        </p>

        {isWaiting && (
          <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3 text-xs text-orange-800">
            <span className="font-semibold">{STATUS_LABEL.WAITING_FOR_STOCK}</span> — {STATUS_HELPER.WAITING_FOR_STOCK} This
            shipment can't be advanced manually until then.
          </div>
        )}

        <fieldset disabled={isWaiting} className="space-y-2 disabled:opacity-50">
          {SELECTABLE_STATUSES.map((value) => (
            <label
              key={value}
              className={`flex items-start gap-2 rounded-lg border p-3 transition ${isWaiting ? "cursor-not-allowed" : "cursor-pointer"} ${
                status === value ? "border-[#3d6fe0] bg-blue-50/60" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="courier-status"
                value={value}
                checked={status === value}
                onChange={() => setStatus(value)}
                className="mt-0.5 h-4 w-4 border-slate-300 text-[#3d6fe0] focus:ring-[#3d6fe0]"
              />
              <span className="text-xs text-slate-700">
                <span className="font-semibold">{STATUS_LABEL[value]}</span>
                <br />
                {STATUS_HELPER[value]}
              </span>
            </label>
          ))}
        </fieldset>

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
            disabled={isSubmitting || isWaiting}
            onClick={() => onConfirm(status)}
            className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3162d2] disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Status"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CourierStatusModal;
