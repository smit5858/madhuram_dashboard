import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Download, Loader2, MessageCircle, Share2, XCircle } from "lucide-react";
import LOGO from "@/assets/logo.png";
import saleService from "@/services/sells.service";
import { formatPhoneDisplay } from "@/shared/utils/phone";
import {
  INVOICE_COMPANY_NAME,
  INVOICE_TAGLINE,
  PAYMENT_STATUS_LABELS,
  buildSaleInvoice,
  buildInvoiceShareMessage,
  formatInvoiceAmount,
  getInvoiceWhatsAppUrl,
  invoiceFileName,
} from "@/pages/sells/utils/saleInvoice";

interface SaleInvoiceModalProps {
  saleId: number;
  onClose: () => void;
}

// Same colours as backend saleInvoice.service.js#STATUS_COLORS.
const STATUS_TEXT_CLASS: Record<string, string> = {
  PAID: "text-emerald-600",
  PARTIALLY_PAID: "text-amber-600",
  UNPAID: "text-rose-600",
};

// The Web Share API's file support (mobile Chrome/Safari, some desktops) — the only way to hand
// the actual PDF to WhatsApp or another app. Feature-detected once; elsewhere the button is hidden.
const canShareFiles = (() => {
  try {
    return typeof navigator !== "undefined" && typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "invoice.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
})();

// A blob responseType also wraps the JSON error body in a Blob — unwrap it for the message
// (same as ExportDropdown).
const getBlobErrorMessage = async (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text())?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return (err as { message?: string })?.message || fallback;
};

/** Share action on the Sells table — previews a simple customer receipt (not a GST invoice) built
 *  from the sale's real record, then shares it via WhatsApp, the device share sheet (PDF file), or
 *  a PDF download. Reuses the "sale-detail" query the Sale Details modal already uses. */
const SaleInvoiceModal = ({ saleId, onClose }: SaleInvoiceModalProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const { data: saleResponse, isLoading, error } = useQuery({
    queryKey: ["sale-detail", saleId],
    queryFn: () => saleService.getSaleById(saleId),
  });
  const sale = saleResponse?.data?.data ?? null;
  const invoice = useMemo(() => (sale ? buildSaleInvoice(sale) : null), [sale]);

  // Prefetched where file sharing is supported: navigator.share must run close to the user's tap,
  // so the PDF has to be ready before the click rather than downloaded inside the handler.
  const { data: prefetchedPdf } = useQuery({
    queryKey: ["sale-invoice-pdf", saleId, sale?.updatedAt],
    queryFn: async () => (await saleService.downloadInvoicePdf(saleId)).data,
    enabled: canShareFiles && !!sale,
    staleTime: 60_000,
  });

  const getPdfBlob = async () =>
    new Blob([prefetchedPdf ?? (await saleService.downloadInvoicePdf(saleId)).data], { type: "application/pdf" });

  const handleWhatsApp = () => {
    if (!invoice) return;
    window.open(getInvoiceWhatsAppUrl(invoice), "_blank", "noopener,noreferrer");
  };

  const handleDownload = async () => {
    if (!invoice) return;
    setIsDownloading(true);
    try {
      const url = window.URL.createObjectURL(await getPdfBlob());
      const a = document.createElement("a");
      a.href = url;
      a.download = invoiceFileName(invoice, saleId);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    } catch (err) {
      toast.error(await getBlobErrorMessage(err, "Failed to download invoice"));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleNativeShare = async () => {
    if (!invoice) return;
    setIsSharing(true);
    try {
      const file = new File([await getPdfBlob()], invoiceFileName(invoice, saleId), { type: "application/pdf" });
      await navigator.share({
        files: [file],
        title: `${INVOICE_COMPANY_NAME} Invoice${invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : ""}`,
        text: buildInvoiceShareMessage(invoice),
      });
    } catch (err) {
      // Closing the share sheet rejects with AbortError — not a failure worth reporting.
      if ((err as { name?: string })?.name !== "AbortError") {
        toast.error(await getBlobErrorMessage(err, "Failed to share invoice"));
      }
    } finally {
      setIsSharing(false);
    }
  };

  const hasShipTo = !!invoice && !!(invoice.shipTo.address || invoice.shipTo.city || invoice.shipTo.pincode);

  // Right-aligned "label: value" row — used for both the meta block and the totals, as in the PDF.
  const metaRow = (label: string, value: string, valueClassName = "") => (
    <div className="grid grid-cols-[1fr_auto] gap-4 px-3">
      <span className="text-right text-[#777]">{label}</span>
      <span className={`text-right tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl bg-slate-100 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Share2 className="h-4 w-4 text-[#3d6fe0]" />
            Share Invoice
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice...
            </div>
          ) : error || !invoice ? (
            <div className="py-16 text-center text-xs text-rose-600">
              {(error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to load sale details"}
            </div>
          ) : (
            // Invoice preview — same layout as the PDF; always a white "paper" card, independent of the app theme.
            <div className="rounded-xl bg-white p-4 sm:p-6 text-[11px] sm:text-xs text-[#333] shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <img src={LOGO} alt="" className="h-16 w-16 sm:h-20 sm:w-20 rounded object-contain" />
                  <p className="mt-3 font-bold">{INVOICE_COMPANY_NAME}</p>
                  <p>{INVOICE_TAGLINE}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl sm:text-3xl font-light tracking-wide">INVOICE</p>
                  {invoice.invoiceNumber && <p className="mt-0.5 text-sm text-[#777]"># {invoice.invoiceNumber}</p>}
                </div>
              </div>

              <div className="mt-4 space-y-2 sm:ml-auto sm:w-1/2 sm:-mt-10">
                {invoice.invoiceDate && metaRow("Date:", invoice.invoiceDate)}
                {invoice.customerPhone && metaRow("Phone:", formatPhoneDisplay(invoice.customerPhone) || invoice.customerPhone)}
                {metaRow("Status:", PAYMENT_STATUS_LABELS[invoice.paymentStatus], STATUS_TEXT_CLASS[invoice.paymentStatus] || "")}
                <div className="grid grid-cols-[1fr_auto] items-center gap-4 rounded bg-[#f4f4f4] px-3 py-2 text-sm font-bold">
                  <span className="text-right">Balance Due:</span>
                  <span className="text-right tabular-nums">{formatInvoiceAmount(invoice.pendingAmount)}</span>
                </div>
              </div>

              {(invoice.customerName || hasShipTo) && (
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:w-1/2">
                    {invoice.customerName && (
                      <div className="min-w-0">
                        <p className="text-[#777]">Bill To:</p>
                        <p className="mt-1 font-bold wrap-break-word">{invoice.customerName}</p>
                      </div>
                    )}
                    {hasShipTo && (
                      <div className="min-w-0">
                        <p className="text-[#777]">Ship To:</p>
                        {invoice.shipTo.address && <p className="mt-1 font-bold wrap-break-word whitespace-pre-line">{invoice.shipTo.address}</p>}
                        {invoice.shipTo.city && <p className="wrap-break-word">{invoice.shipTo.city}</p>}
                        {invoice.shipTo.pincode && <p>pincode : {invoice.shipTo.pincode}</p>}
                      </div>
                    )}
                  </div>
              )}

              {invoice.isCancelled && (
                <div className="mt-4 rounded bg-rose-50 py-1.5 text-center font-bold text-rose-700">
                  THIS ORDER HAS BEEN CANCELLED
                </div>
              )}

              {invoice.items.length > 0 && (
                <div className="mt-6">
                  <div className="grid grid-cols-[1fr_2.5rem_4.5rem_4.5rem] sm:grid-cols-[1fr_4rem_6rem_6rem] gap-2 rounded bg-[#3c3c3c] px-3 py-1.5 text-white">
                    <span>Item</span>
                    <span className="text-center sm:text-left">Qty<span className="hidden sm:inline">uantity</span></span>
                    <span className="text-right">Rate</span>
                    <span className="text-right">Amount</span>
                  </div>
                  {invoice.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_2.5rem_4.5rem_4.5rem] sm:grid-cols-[1fr_4rem_6rem_6rem] gap-2 px-3 py-1.5">
                      <span className="font-bold wrap-break-word">{item.name}</span>
                      <span className="text-center sm:text-left">{item.quantity}</span>
                      <span className="text-right tabular-nums">{item.unitPrice !== null ? formatInvoiceAmount(item.unitPrice) : ""}</span>
                      <span className="text-right tabular-nums">{item.unitPrice !== null ? formatInvoiceAmount(item.unitPrice * item.quantity) : ""}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-8 flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="sm:w-1/2">
                  {invoice.payments.length > 0 && (
                    <>
                      <p className="mb-1 text-[#777]">Payment Details:</p>
                      {invoice.payments.map((p, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 py-0.5">
                          <span className="min-w-0 wrap-break-word">
                            {[p.method, p.date, p.reference && `Ref: ${p.reference}`].filter(Boolean).join(" · ") || "Payment"}
                          </span>
                          <span className="tabular-nums whitespace-nowrap">{formatInvoiceAmount(p.amount)}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <div className="space-y-2 sm:w-1/2">
                  {invoice.courierCharge > 0 && (
                    <>
                      {metaRow("Subtotal:", formatInvoiceAmount(invoice.sellingAmount))}
                      {metaRow("Courier Charge:", formatInvoiceAmount(invoice.courierCharge))}
                    </>
                  )}
                  {metaRow("Total:", formatInvoiceAmount(invoice.totalAmount))}
                  {metaRow("Amount Paid:", formatInvoiceAmount(invoice.paidAmount))}
                  {invoice.refundedAmount > 0 && metaRow("Refunded:", formatInvoiceAmount(invoice.refundedAmount))}
                </div>
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm font-bold">Thank you for your business!</p>
                <p className="mt-0.5 text-[10px] text-[#777]">{INVOICE_COMPANY_NAME} — {INVOICE_TAGLINE}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))] rounded-b-2xl">
          <button
            type="button"
            disabled={!invoice}
            onClick={handleWhatsApp}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
          {canShareFiles && (
            <button
              type="button"
              disabled={!invoice || isSharing}
              onClick={handleNativeShare}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-2 text-xs font-bold text-white hover:bg-[#3162d2] disabled:opacity-50"
            >
              {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share PDF
            </button>
          )}
          <button
            type="button"
            disabled={!invoice || isDownloading}
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaleInvoiceModal;
