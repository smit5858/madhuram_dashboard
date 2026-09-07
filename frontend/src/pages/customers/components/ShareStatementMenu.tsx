import { useState } from "react";
import toast from "react-hot-toast";
import { Share2, ChevronDown, FileText, MessageCircle } from "lucide-react";
import customerLedgerService from "@/services/customerLedger.service";
import { getBalanceDisplay, type LedgerBalance } from "@/shared/utils/ledgerBalance";

interface ShareStatementMenuProps {
  customerId: number;
  customerName: string;
  customerPhone?: string | null;
  balance: LedgerBalance | null | undefined;
  /** Compact icon-only trigger for use inside a table row; full button otherwise. */
  compact?: boolean;
}

/** Share → WhatsApp / PDF (spec §15/§16). WhatsApp opens a wa.me link with a text summary only —
 *  there's no public/unauthenticated file host to embed a PDF link in, so the statement itself is
 *  a separate authenticated download (same as the existing Sales export's blob-download pattern
 *  in Sells.tsx#handleExport) rather than exposed via an open URL. */
const ShareStatementMenu = ({ customerId, customerName, customerPhone, balance, compact }: ShareStatementMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleWhatsApp = () => {
    const display = getBalanceDisplay(balance);
    const message = [
      "Madhuram Motors",
      "",
      `Customer: ${customerName}`,
      "",
      "Current Balance:",
      display.text,
      "",
      "Please find your account statement attached.",
    ].join("\n");

    const phoneDigits = (customerPhone || "").replace(/\D/g, "");
    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  };

  const handlePdf = async () => {
    setIsDownloading(true);
    try {
      const res = await customerLedgerService.downloadStatementPdf(customerId);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement-${customerName.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to download statement");
    } finally {
      setIsDownloading(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        title="Share"
        className={
          compact
            ? "rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
            : "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        }
      >
        <Share2 className="h-4 w-4" />
        {!compact && (
          <>
            Share
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> Share via WhatsApp
          </button>
          <button
            type="button"
            disabled={isDownloading}
            onClick={handlePdf}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5 text-blue-600" /> {isDownloading ? "Downloading..." : "Download PDF"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ShareStatementMenu;
