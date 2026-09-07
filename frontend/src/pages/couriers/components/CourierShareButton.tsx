import { MessageCircle } from "lucide-react";
import toast from "react-hot-toast";
import type { CourierData } from "../../../services/courier.service";
import { getCourierShareUrl } from "../../../shared/utils/courierShare";

interface CourierShareButtonProps {
  courier: CourierData;
  /** Sibling courier rows sharing the same shipmentGroupId, when already loaded (e.g. by the
   *  view modal) — used to list every product in a multi-product shipment. Omit to share just
   *  this record's own product, as from a table row. */
  siblings?: CourierData[];
  /** Icon-only trigger for a table row; labeled button otherwise. */
  compact?: boolean;
}

/** Opens a wa.me chat with the customer, pre-filled with the courier details message — the only
 *  way to share an Outgoing Courier record (moved here from the old Sells "Share" action, which
 *  shared customer ledger statements, not courier/shipment info). */
const CourierShareButton = ({ courier, siblings, compact }: CourierShareButtonProps) => {
  const handleShare = () => {
    const url = getCourierShareUrl(courier, siblings);
    if (!url) {
      toast.error("Customer mobile number is required to send WhatsApp message.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      title="Share via WhatsApp"
      className={
        compact
          ? "rounded p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          : "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition"
      }
    >
      <MessageCircle className={compact ? "h-4 w-4" : "h-4 w-4"} />
      {!compact && "Share via WhatsApp"}
    </button>
  );
};

export default CourierShareButton;
